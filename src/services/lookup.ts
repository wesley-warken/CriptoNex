import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';
import { normalizeLookup, type LookupResult } from '@/services/universeTypes';
import type { Candle } from '@/types';

const QUOTE_TTL_MS = 60_000;

/**
 * Dev local em qualquer porta (5173, 5174…): usa os proxies /api/* do
 * vite em vez de chamar Yahoo/Binance direto (CORS bloqueia no browser).
 * Antes era só porta 5173 — na 5174 tudo do Yahoo caía em N/A.
 */
export function isLocalhost(): boolean {
  try {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

function lookupBases(): string[] {
  if (isLocalhost()) {
    return ['/api/ylookup', 'https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  }
  return ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
}

function chartBases(): string[] {
  if (isLocalhost()) {
    return ['/api/yahoo', 'https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
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
  /** Abertura da sessão coberta (1º candle) — base do gap de abertura. */
  openToday: number | null;
  /** Fechamento anterior (meta do Yahoo) — referência do gap. */
  prevClose: number | null;
  /** Timestamp do último candle (ms) — checagem de frescor. */
  lastTime: number | null;
}

/** Somente /v8/finance/chart (endpoint público estável), com fallback query1→query2. */
export async function yahooChart(symbol: string, range = '3mo', interval = '1d', ttlMs: number = QUOTE_TTL_MS): Promise<YahooQuote> {
  const key = `${IDB_KEYS.quotes}:yh:${symbol}:${range}`;
  const cached = await idbGet<YahooQuote>(key);
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
        openToday: candles.length ? candles[0].open : null,
        prevClose: prev ?? null,
        lastTime: candles.length ? candles[candles.length - 1].time : null,
      };
      await idbSet(key, out, ttlMs);
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  // Rede falhou em todas as bases: serve o último cache (stale) em vez de
  // N/A — dado de minutos/horas atrás vale mais que nada no brief.
  if (cached && cached.data.price != null) return cached.data;
  throw lastErr instanceof Error ? lastErr : new Error('Yahoo chart indisponível');
}
