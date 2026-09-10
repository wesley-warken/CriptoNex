import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet } from '@/lib/idb';
import { report429, rateLimitedError, tryAcquire } from '@/services/rateLimit';

export const HIST_TTL_MS = 24 * 60 * 60 * 1000;
export const HIST_HOURS_TTL_MS = 60 * 60 * 1000;

async function fetchHistoryFresh(id: string, days: 365 | 7): Promise<number[]> {
  // Espera limitada: em espiral de 429, desiste rápido (vira "—") em vez de travar o lote
  if (!(await tryAcquire('coingecko', 8000))) throw rateLimitedError('CoinGecko ocupado — tentando depois');
  const r = await fetchWithTimeout(`${base()}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`, 20000);
  if (r.status === 429) {
    report429('coingecko');
    throw rateLimitedError('CoinGecko 429 rate limit');
  }
  if (!r.ok) throw new Error(`History ${id} ${r.status}`);
  const j = (await r.json()) as { prices?: [number, number][] };
  return (j.prices ?? []).map((p) => p[1]).filter((v) => v > 0);
}

/**
 * Fechamentos diários (365d) de qualquer moeda do CoinGecko.
 * Cache IndexedDB 24h + stale-while-revalidate: dado vencido há menos que
 * o TTL é servido na hora e atualizado em background (visitas mornas instantâneas).
 */
export async function coinHistory(id: string): Promise<number[]> {
  const key = `cc.quotes.cache:hist:${id}`;
  const cached = await idbGet<number[]>(key);
  if (cached && cached.data.length >= 60) {
    if (!cached.stale) return cached.data;
    if (Date.now() - cached.ts < HIST_TTL_MS) {
      void fetchHistoryFresh(id, 365)
        .then((c) => { if (c.length >= 60) void idbSet(key, c, HIST_TTL_MS); })
        .catch(() => {});
      return cached.data;
    }
  }
  try {
    const closes = await fetchHistoryFresh(id, 365);
    if (closes.length >= 60) await idbSet(key, closes, HIST_TTL_MS);
    else if (cached?.data.length) return cached.data;
    return closes;
  } catch (e) {
    if (cached?.data.length) return cached.data;
    throw e;
  }
}

function base(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') return '/api/coingecko';
  return 'https://api.coingecko.com/api/v3';
}

/**
 * Fechamentos horários (~7d, ~168 pontos) de qualquer moeda do CoinGecko.
 * 1 chamada cobre o RSI de 1h e o de 4h (reamostrado). Cache IDB 1h + SWR.
 */
export async function coinHistoryHours(id: string): Promise<number[]> {
  const key = `cc.quotes.cache:hist-hours:${id}`;
  const cached = await idbGet<number[]>(key);
  if (cached && cached.data.length >= 30) {
    if (!cached.stale) return cached.data;
    if (Date.now() - cached.ts < HIST_HOURS_TTL_MS) {
      void fetchHistoryFresh(id, 7)
        .then((c) => { if (c.length >= 30) void idbSet(key, c, HIST_HOURS_TTL_MS); })
        .catch(() => {});
      return cached.data;
    }
  }
  try {
    const closes = await fetchHistoryFresh(id, 7);
    if (closes.length >= 30) await idbSet(key, closes, HIST_HOURS_TTL_MS);
    else if (cached?.data.length) return cached.data;
    return closes;
  } catch (e) {
    if (cached?.data.length) return cached.data;
    throw e;
  }
}
