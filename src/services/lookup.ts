import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';
import { normalizeLookup, type LookupResult } from '@/services/universeTypes';
import type { Candle } from '@/types';

const QUOTE_TTL_MS = 60_000;

function lookupBases(): string[] {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return ['/api/ylookup', 'https://query2.finance.yahoo.com'];
  }
  return ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
}

function chartBases(): string[] {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return ['/api/yahoo', 'https://query2.finance.yahoo.com'];
  }
  return ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
}

export async function yahooLookup(query: string, count = 25): Promise<LookupResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  let lastErr: unknown = null;
  for (const base of lookupBases()) {
    try {
      const r = await fetchWithTimeout(
        `${base}/v1/finance/lookup?query=${encodeURIComponent(q)}&count=${count}`,
        12000,
      );
      if (!r.ok) throw new Error(`Yahoo lookup ${r.status}`);
      const j = (await r.json()) as { finance?: { result?: unknown[] } };
      return normalizeLookup((j.finance?.result ?? []) as Parameters<typeof normalizeLookup>[0]);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Yahoo lookup indisponível');
}

export interface YahooQuote {
  price: number | null;
  changePct: number | null;
  candles: Candle[];
  currency: string;
}

/** Somente /v8/finance/chart (endpoint público estável), com fallback query1→query2. */
export async function yahooChart(symbol: string, range = '3mo', interval = '1d', ttlMs: number = QUOTE_TTL_MS): Promise<YahooQuote> {
  const cached = await idbGet<YahooQuote>(`${IDB_KEYS.quotes}:yh:${symbol}:${range}`);
  if (cached && Date.now() - cached.ts < ttlMs && cached.data.price != null) return cached.data;
  let lastErr: unknown = null;
  for (const base of chartBases()) {
    try {
      const r = await fetchWithTimeout(
        `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
        15000,
      );
      if (!r.ok) throw new Error(`Yahoo chart ${r.status}`);
      const j = (await r.json()) as {
        chart?: {
          result?: {
            timestamp?: number[];
            meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
            indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
          }[];
        };
      };
      const res = j.chart?.result?.[0];
      if (!res?.timestamp) throw new Error('Yahoo sem dados');
      const q = res.indicators?.quote?.[0];
      const candles: Candle[] = res.timestamp.map((t, i) => ({
        time: t * 1000,
        open: q?.open?.[i] ?? 0,
        high: q?.high?.[i] ?? 0,
        low: q?.low?.[i] ?? 0,
        close: q?.close?.[i] ?? 0,
        volume: q?.volume?.[i] ?? 0,
      })).filter((c) => c.close > 0);
      const last = candles.length ? candles[candles.length - 1].close : null;
      const prev = res.meta?.chartPreviousClose ?? (candles.length > 1 ? candles[candles.length - 2].close : null);
      const out: YahooQuote = {
        price: res.meta?.regularMarketPrice ?? last,
        changePct: last != null && prev ? ((last / prev - 1) * 100) : null,
        candles,
        currency: (res.meta as { currency?: string } | undefined)?.currency ?? (symbol.endsWith('.SA') ? 'BRL' : 'USD'),
      };
      await idbSet(`${IDB_KEYS.quotes}:yh:${symbol}:${range}`, out, ttlMs);
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Yahoo chart indisponível');
}
