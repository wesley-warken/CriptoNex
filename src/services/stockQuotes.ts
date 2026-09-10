import { useEffect, useState } from 'react';
import { brapiBatchQuotes, type BrapiQuote } from '@/services/brapi';
import { yahooChart, type YahooQuote } from '@/services/lookup';
import { useStore } from '@/stores/useStore';

const TTL = 60_000;
const RETRY_AFTER = 30_000;
const CONCURRENCY = 6;
const brapiCache = new Map<string, { q: BrapiQuote; ts: number }>();
const yhCache = new Map<string, { q: YahooQuote; ts: number }>();
const brapiFail = new Map<string, number>();
const yhFail = new Map<string, number>();

function yahooSymbol(s: string): string {
  if (s.includes('.') || s.includes('=') || s.startsWith('^')) return s;
  return `${s}.SA`;
}

async function mapPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/** Fallback Yahoo (com .SA) quando o Brapi recusa (401 sem token, por exemplo). */
async function yahooAsBrapi(symbols: string[]): Promise<void> {
  await mapPool(symbols, CONCURRENCY, async (s) => {
    try {
      const q = await yahooChart(yahooSymbol(s), '5d', '1d');
        brapiCache.set(s, { q: { symbol: s, price: q.price, change: q.changePct, marketCap: null }, ts: Date.now() });
      brapiFail.delete(s);
    } catch {
      brapiFail.set(s, Date.now());
    }
  });
}

function missingOf(list: string[], cache: Map<string, { ts: number }>, fails: Map<string, number>): string[] {
  const now = Date.now();
  return list.filter((s) => {
    const hit = cache.get(s);
    if (hit && now - hit.ts < TTL) return false;
    const f = fails.get(s);
    if (f && now - f < RETRY_AFTER) return false;
    return true;
  });
}

export function useBrapiQuotes(symbols: string[]): { map: Map<string, BrapiQuote>; loading: boolean; pending: number } {
  const token = useStore((s) => s.brapiToken);
  const [map, setMap] = useState<Map<string, BrapiQuote>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(0);
  const key = [...new Set(symbols)].sort().join(',');
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(',') : [];
    const snap = () => {
      const out = new Map<string, BrapiQuote>();
      for (const s of list) {
        const hit = brapiCache.get(s);
        if (hit) out.set(s, hit.q);
      }
      return out;
    };
    setMap(snap());
    if (!list.length) return () => {
      alive = false;
    };
    let cancelled = false;
    const t = setTimeout(async () => {
      const miss = missingOf(list, brapiCache, brapiFail);
      setPending(miss.length);
      if (!miss.length) return;
      setLoading(true);
      try {
        try {
          const rows = await brapiBatchQuotes(miss, token || undefined);
          for (const r of rows) {
            brapiCache.set(r.symbol, { q: r, ts: Date.now() });
            brapiFail.delete(r.symbol);
          }
        } catch {
          /* Brapi indisponível/401: fallback Yahoo abaixo */
        }
        if (cancelled || !alive) return;
        const still = missingOf(list, brapiCache, brapiFail);
        if (still.length) await yahooAsBrapi(still);
        if (alive && !cancelled) {
          setMap(snap());
          setPending(missingOf(list, brapiCache, brapiFail).length);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, 350);
    return () => {
      alive = false;
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token]);
  return { map, loading, pending };
}

export function useYahooQuotes(symbols: string[]): { map: Map<string, YahooQuote>; loading: boolean; pending: number } {
  const [map, setMap] = useState<Map<string, YahooQuote>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(0);
  const key = [...new Set(symbols)].sort().join(',');
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(',') : [];
    const snap = () => {
      const out = new Map<string, YahooQuote>();
      for (const s of list) {
        const hit = yhCache.get(s);
        if (hit) out.set(s, hit.q);
      }
      return out;
    };
    setMap(snap());
    if (!list.length) return () => {
      alive = false;
    };
    let cancelled = false;
    const t = setTimeout(async () => {
      const miss = missingOf(list, yhCache, yhFail);
      setPending(miss.length);
      if (!miss.length) return;
      setLoading(true);
      await mapPool(miss, CONCURRENCY, async (s) => {
        if (cancelled) return;
        try {
          const q = await yahooChart(s, '5d', '1d');
          yhCache.set(s, { q, ts: Date.now() });
          yhFail.delete(s);
        } catch {
          yhFail.set(s, Date.now());
        }
      });
      if (alive && !cancelled) {
        setMap(snap());
        setPending(missingOf(list, yhCache, yhFail).length);
      }
      if (alive) setLoading(false);
    }, 350);
    return () => {
      alive = false;
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { map, loading, pending };
}
