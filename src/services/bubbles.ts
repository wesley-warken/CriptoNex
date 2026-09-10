import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet } from '@/lib/idb';
import { acquire, report429, rateLimitedError } from '@/services/rateLimit';
import { geckoUniversePage, loadCachedCryptoUniverse } from '@/services/universe';
import { useEffect, useState } from 'react';
import type { UniverseCoin } from '@/services/universeTypes';

export interface BubbleCoin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  mcap: number | null;
  vol: number | null;
  c1h: number | null;
  c24: number | null;
  c7d: number | null;
  c30d: number | null;
  c1y: number | null;
  image?: string;
  source: 'gecko' | 'paprika' | 'coinlore';
}

export const BUBBLES_TTL_MS = 10 * 60 * 1000;
const KEY = 'cc.universe.bubbles';

export function fromUniverse(c: UniverseCoin): BubbleCoin {
  return {
    id: c.id, symbol: c.symbol, name: c.name, price: c.price,
    mcap: c.marketCap, vol: c.volume24h,
    c1h: c.change1h, c24: c.change24h, c7d: c.change7d, c30d: c.change30d, c1y: c.change1y,
    image: c.image, source: 'gecko',
  };
}

interface PaprikaRow {
  id: string;
  symbol: string;
  name: string;
  quotes: { USD: { price: number; market_cap: number; volume_24h: number; percent_change_1h: number; percent_change_24h: number; percent_change_7d: number; percent_change_30d: number; percent_change_1y: number } };
}

export function fromPaprika(r: PaprikaRow): BubbleCoin {
  const q = r.quotes.USD;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: r.id, symbol: (r.symbol ?? '').toUpperCase(), name: r.name ?? r.id,
    price: num(q.price) ?? 0, mcap: num(q.market_cap), vol: num(q.volume_24h),
    c1h: num(q.percent_change_1h), c24: num(q.percent_change_24h), c7d: num(q.percent_change_7d),
    c30d: num(q.percent_change_30d), c1y: num(q.percent_change_1y),
    image: `https://assets.coincap.io/assets/icons/${(r.symbol ?? '').toLowerCase()}@2x.png`,
    source: 'paprika',
  };
}

interface LoreRow {
  id: string;
  symbol: string;
  name: string;
  price_usd: string;
  market_cap_usd: string;
  volume24: number | null;
  percent_change_1h: string;
  percent_change_24h: string;
  percent_change_7d: string;
}

export function fromLore(r: LoreRow): BubbleCoin {
  const num = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: `lore-${r.id}`, symbol: (r.symbol ?? '').toUpperCase(), name: r.name ?? r.symbol,
    price: num(r.price_usd) ?? 0, mcap: num(r.market_cap_usd), vol: typeof r.volume24 === 'number' ? r.volume24 : null,
    c1h: num(r.percent_change_1h), c24: num(r.percent_change_24h), c7d: num(r.percent_change_7d),
    c30d: null, c1y: null,
    image: `https://assets.coincap.io/assets/icons/${(r.symbol ?? '').toLowerCase()}@2x.png`,
    source: 'coinlore',
  };
}

async function fetchPaprika(limit = 600): Promise<BubbleCoin[]> {
  const r = await fetchWithTimeout(`https://api.coinpaprika.com/v1/tickers?limit=${limit}`, 25000);
  if (!r.ok) throw new Error(`Paprika ${r.status}`);
  const rows = (await r.json()) as PaprikaRow[];
  if (!Array.isArray(rows) || !rows.length) throw new Error('Paprika vazio');
  return rows.map(fromPaprika);
}

async function fetchLore(limit = 300): Promise<BubbleCoin[]> {
  const r = await fetchWithTimeout(`https://api.coinlore.com/api/tickers/?start=0&limit=${limit}`, 25000);
  if (!r.ok) throw new Error(`CoinLore ${r.status}`);
  const j = (await r.json()) as { data?: LoreRow[] };
  if (!j.data?.length) throw new Error('CoinLore vazio');
  return j.data.map(fromLore);
}

export interface BubbleFeed {
  coins: BubbleCoin[];
  source: BubbleCoin['source'];
  stale: boolean;
  ts: number | null;
}

/**
 * Feed das bolhas com fallback triplo: CoinGecko (rico) → CoinPaprika
 * (sem chave, CORS aberto) → CoinLore. Nunca trava a UI.
 */
export async function fetchBubbleFeed(onProgress?: (acc: BubbleCoin[]) => void): Promise<BubbleFeed> {
  const cached = await idbGet<BubbleCoin[]>(KEY).catch(() => null);
  // 1) CoinGecko: 4 primeiras páginas (top 1000, pintura rápida)
  try {
    const acc: BubbleCoin[] = [];
    for (let p = 1; p <= 4; p++) {
      const rows = await geckoUniversePage(p, p <= 2);
      if (!rows.length) break;
      acc.push(...rows.map(fromUniverse));
      onProgress?.([...acc]);
    }
    if (acc.length >= 100) {
      await idbSet(KEY, acc, BUBBLES_TTL_MS);
      return { coins: acc, source: 'gecko', stale: false, ts: Date.now() };
    }
    throw new Error('Gecko insuficiente');
  } catch (e) {
    if ((e as { rateLimited?: boolean }).rateLimited) {
      await acquire('coingecko').catch(() => {});
    }
  }
  // 2) CoinPaprika
  try {
    const coins = await fetchPaprika(600);
    await idbSet(KEY, coins, BUBBLES_TTL_MS);
    return { coins, source: 'paprika' as const, stale: true, ts: Date.now() };
  } catch {
    /* tenta CoinLore */
  }
  // 3) CoinLore
  try {
    const coins = await fetchLore(300);
    await idbSet(KEY, coins, BUBBLES_TTL_MS);
    return { coins, source: 'coinlore' as const, stale: true, ts: Date.now() };
  } catch {
    /* último recurso: cache antigo */
  }
  if (cached && cached.data.length) {
    return { coins: cached.data, source: cached.data[0]?.source ?? 'gecko' as const, stale: true, ts: cached.ts };
  }
  const geckoCache = await loadCachedCryptoUniverse().catch(() => null);
  if (geckoCache && geckoCache.data.length) {
    return { coins: geckoCache.data.map(fromUniverse), source: 'gecko' as const, stale: true, ts: geckoCache.ts };
  }
  throw new Error('Fontes de bolhas indisponíveis (Gecko, Paprika e CoinLore falharam)');
}

const shared: BubbleFeed & { loading: boolean; error: string | null } = {
  coins: [], source: 'gecko', stale: false, ts: null, loading: true, error: null,
};
const listeners = new Set<(s: typeof shared) => void>();
let started = false;

function emit() {
  const s = { ...shared };
  for (const l of listeners) l(s);
}

async function boot() {
  if (started) return;
  started = true;
  try {
    const cached = await idbGet<BubbleCoin[]>(KEY).catch(() => null);
    if (cached && cached.data.length) {
      shared.coins = cached.data;
      shared.stale = cached.stale;
      shared.ts = cached.ts;
      shared.loading = false;
      emit();
      if (!cached.stale) return;
    }
    const feed = await fetchBubbleFeed((acc) => {
      shared.coins = acc;
      shared.source = 'gecko';
      shared.loading = acc.length < 100;
      emit();
    });
    shared.coins = feed.coins;
    shared.source = feed.source;
    shared.stale = feed.stale;
    shared.ts = feed.ts;
    shared.loading = false;
    emit();
  } catch (e) {
    shared.error = e instanceof Error ? e.message : 'Feed indisponível';
    shared.loading = false;
    emit();
  }
}

export function useBubbleFeed() {
  const [snap, setSnap] = useState({ ...shared });
  useEffect(() => {
    const l = (s: typeof shared) => setSnap({ ...s });
    listeners.add(l);
    setSnap({ ...shared });
    void boot();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    ...snap,
    reload: () => {
      started = false;
      shared.loading = true;
      shared.error = null;
      void boot();
    },
  };
}
