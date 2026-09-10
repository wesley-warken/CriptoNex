import { fetchWithTimeout, retry } from '@/services/cache';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';
import { chunk, type StockEntry } from '@/services/universeTypes';

export const B3_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH = 30;

export interface BrapiQuote {
  symbol: string;
  price: number | null;
  change: number | null;
  name?: string;
  marketCap: number | null;
  volume?: number | null;
}

export async function brapiBatchQuotes(symbols: string[], token?: string): Promise<BrapiQuote[]> {
  const out: BrapiQuote[] = [];
  for (const group of chunk(symbols, BATCH)) {
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const tickers = group.map((s) => encodeURIComponent(s)).join(',');
    const row = await retry(async () => {
      const r = await fetchWithTimeout(`https://brapi.dev/api/quote/${tickers}${qs}`, 15000);
      if (!r.ok) throw new Error(`Brapi ${r.status}`);
      return (await r.json()) as {
        results?: { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number; longName?: string; shortName?: string; marketCap?: number; regularMarketVolume?: number }[];
      };
    }, 1);
    for (const it of row.results ?? []) {
      out.push({
        symbol: it.symbol,
        price: it.regularMarketPrice ?? null,
        change: it.regularMarketChangePercent ?? null,
        name: it.longName ?? it.shortName,
        marketCap: it.marketCap ?? null,
        volume: it.regularMarketVolume ?? null,
      });
    }
  }
  return out;
}

export interface B3Entry extends StockEntry {
  sector?: string;
}

/** Lista oficial de tickers negociáveis (Brapi), com fallback para o seed local. */
export async function fetchB3List(seed: B3Entry[]): Promise<B3Entry[]> {
  try {
    const r = await fetchWithTimeout('https://brapi.dev/api/available', 15000);
    if (!r.ok) throw new Error(`Brapi available ${r.status}`);
    const j = (await r.json()) as { stocks?: string[] };
    const bySym = new Map(seed.map((s) => [s.symbol, s]));
    const list: B3Entry[] = (j.stocks ?? [])
      .filter((s) => typeof s === 'string' && s.length >= 5)
      .map((symbol) => bySym.get(symbol) ?? { symbol, name: symbol, exchange: 'B3', kind: 'stock' as const });
    if (list.length >= 100) {
      await idbSet(IDB_KEYS.b3Stocks, list, B3_TTL_MS);
      return list;
    }
    return seed;
  } catch {
    const cached = await idbGet<B3Entry[]>(IDB_KEYS.b3Stocks);
    if (cached && cached.data.length) return cached.data;
    return seed;
  }
}

export async function loadCachedB3(): Promise<{ data: B3Entry[]; ts: number; stale: boolean } | null> {
  return idbGet<B3Entry[]>(IDB_KEYS.b3Stocks);
}
