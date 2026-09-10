import type { Candle } from '@/types';
import { fetchWithTimeout } from '@/services/cache';
// Yahoo via proxy dev; Brapi como fallback B3 (token opcional via settings).
export async function yahooCandles(symbol: string, range = '1y', interval = '1d'): Promise<Candle[]> {
  const inDev = typeof window !== 'undefined' && window.location.port === '5173';
  const base = inDev ? '/api/yahoo' : 'https://query1.finance.yahoo.com';
  const isBR = /[34]$/.test(symbol);
  const ysym = isBR ? `${symbol}.SA` : symbol;
  const r = await fetchWithTimeout(`${base}/v8/finance/chart/${encodeURIComponent(ysym)}?range=${range}&interval=${interval}`);
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = (await r.json()) as { chart: { result: { timestamp: number[]; indicators: { quote: { open: (number|null)[]; high: (number|null)[]; low: (number|null)[]; close: (number|null)[]; volume: (number|null)[] }[] } }[] } };
  const res = j.chart.result?.[0];
  if (!res) return [];
  const q = res.indicators.quote[0];
  return res.timestamp.map((t, i) => ({
    time: t * 1000,
    open: q.open[i] ?? 0, high: q.high[i] ?? 0, low: q.low[i] ?? 0,
    close: q.close[i] ?? 0, volume: q.volume[i] ?? 0,
  })).filter((c) => c.close > 0);
}
export async function brapiQuote(symbol: string, token?: string): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(`https://brapi.dev/api/quote/${encodeURIComponent(symbol)}${token ? `?token=${token}` : ''}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { results: { regularMarketPrice: number }[] };
    return j.results?.[0]?.regularMarketPrice ?? null;
  } catch { return null; }
}
