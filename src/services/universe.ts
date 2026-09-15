import { fetchWithTimeout, retry } from '@/services/cache';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';
import { acquire, report429, rateLimitedError } from '@/services/rateLimit';
import { mergeUniverse, type UniverseCoin } from '@/services/universeTypes';

export const CRYPTO_TTL_MS = 10 * 60 * 1000;
const PER_PAGE = 250;
const PAGE_DELAY_MS = 500;

function base(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') return '/api/coingecko';
  return 'https://api.coingecko.com/api/v3';
}

interface GeckoRow {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_1y_in_currency?: number | null;
  sparkline_in_7d?: { price: number[] };
}

export async function geckoUniversePage(page: number, withSparkline: boolean): Promise<UniverseCoin[]> {
  const url =
    `${base()}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${PER_PAGE}&page=${page}` +
    `&sparkline=${withSparkline ? 'true' : 'false'}&price_change_percentage=1h,24h,7d,30d,1y`;
  await acquire('coingecko');
  const r = await fetchWithTimeout(url, 20000);
  if (r.status === 429) {
    report429('coingecko');
    throw rateLimitedError('CoinGecko 429 rate limit');
  }
  if (!r.ok) throw new Error(`CoinGecko universo ${r.status}`);
  const rows = (await r.json()) as GeckoRow[];
  return rows.map((m) => ({
    id: m.id,
    symbol: (m.symbol ?? '').toUpperCase(),
    name: m.name ?? m.id,
    image: m.image ?? undefined,
    price: m.current_price ?? 0,
    marketCap: m.market_cap ?? null,
    rank: m.market_cap_rank ?? null,
    volume24h: m.total_volume ?? null,
    change1h: m.price_change_percentage_1h_in_currency ?? null,
    change24h: m.price_change_percentage_24h_in_currency ?? null,
    change7d: m.price_change_percentage_7d_in_currency ?? null,
    change30d: m.price_change_percentage_30d_in_currency ?? null,
    change1y: m.price_change_percentage_1y_in_currency ?? null,
    spark7d: m.sparkline_in_7d?.price,
  }));
}

export interface UniverseProgress {
  loaded: number;
  done: boolean;
  rateLimited: boolean;
  cacheTs: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Carrega o universo em background, página a página, fora do render.
 * onPage é chamado a cada página com o acumulado (para progresso).
 * Backoff exponencial em 429; nunca trava a UI.
 */
export async function fetchCryptoUniverse(
  onPage: (acc: UniverseCoin[], page: number) => void,
  opts?: { maxPages?: number; signal?: AbortSignal },
): Promise<UniverseCoin[]> {
  let acc: UniverseCoin[] = [];
  let page = 1;
  let backoff = 2000;
  let consecutive429 = 0;
  const maxPages = opts?.maxPages ?? 80;
  for (;;) {
    if (opts?.signal?.aborted) break;
    if (page > maxPages) break;
    try {
      // sparkline sempre: 168 fechamentos horários alimentam Tendência/RSI/Stoch/Super/BB
      // intradiários localmente (instantâneo, sem 1 call por moeda por tempo gráfico)
      // C1: retry 2 + preserva acc mesmo com rede instável
      const rows = await retry(() => geckoUniversePage(page, true), 2);
      if (!rows.length) break;
      acc = mergeUniverse(acc, rows);
      onPage(acc, page);
      await idbSet(IDB_KEYS.cryptoUniverse, acc, CRYPTO_TTL_MS);
      void recordDominance(acc).catch(() => {});
      page += 1;
      backoff = 2000;
      consecutive429 = 0;
      await sleep(PAGE_DELAY_MS);
    } catch (e) {
      if ((e as { rateLimited?: boolean }).rateLimited) {
        consecutive429 += 1;
        // Sem nenhum dado e muitas recusas seguidas:_surface erro com retry
        // em vez de esqueleto infinito. Com dados parciais, segue tentando.
        if (acc.length === 0 && consecutive429 >= 6) throw e;
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60000);
        continue;
      }
      // Falha de rede genérica (Failed to fetch): com dados parciais, não quebra o universo
      const msg = e instanceof Error ? e.message : String(e);
      const isNet = /Failed to fetch|NetworkError|fetch|load failed/i.test(msg);
      if (isNet) {
        if (acc.length > 0) {
          // Retorna o acumulado em cache; boot vai exibir "rede indisponível — exibindo cache"
          await sleep(backoff);
          // Tenta mais 2 vezes antes de desistir silenciosamente
          if (backoff < 8000) {
            backoff = Math.min(backoff * 2, 60000);
            continue;
          }
          break;
        }
        throw new Error('rede indisponível');
      }
      throw e;
    }
  }
  return acc;
}

export async function loadCachedCryptoUniverse(): Promise<{ data: UniverseCoin[]; ts: number; stale: boolean } | null> {
  return idbGet<UniverseCoin[]>(IDB_KEYS.cryptoUniverse);
}

export interface DominancePoint {
  ts: number;
  /** % BTC sobre o market cap somado do universo carregado (amostra) */
  value: number;
}

const DOM_KEY = 'cc.quotes.cache:dominance';
const DOM_MAX = 200;

/** Dominância BTC aproximada a partir da amostra carregada (rotulada como tal na UI). */
export async function recordDominance(acc: UniverseCoin[]): Promise<DominancePoint[]> {
  const btc = acc.find((c) => c.symbol === 'BTC')?.marketCap ?? null;
  const total = acc.reduce((s, c) => s + (c.marketCap ?? 0), 0);
  let prev: DominancePoint[] = [];
  try {
    const hit = await idbGet<DominancePoint[]>(DOM_KEY);
    if (hit && Array.isArray(hit.data)) prev = hit.data;
  } catch {
    /* sem histórico */
  }
  if (btc && total > 0) {
    prev = [...prev, { ts: Date.now(), value: (btc / total) * 100 }].slice(-DOM_MAX);
    await idbSet(DOM_KEY, prev, 7 * 24 * 60 * 60 * 1000);
  }
  return prev;
}

export async function loadDominance(): Promise<DominancePoint[]> {
  try {
    const hit = await idbGet<DominancePoint[]>(DOM_KEY);
    return Array.isArray(hit?.data) ? hit.data : [];
  } catch {
    return [];
  }
}
