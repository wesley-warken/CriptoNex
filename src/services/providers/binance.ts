import type { Candle } from '@/types';
import { fetchWithTimeout, retry } from '@/services/cache';
import { isLocalhost } from '@/services/lookup';

/** Dev local: via proxy /api/binance do vite (direto cai no CORS do browser). */
export function binanceBase(): string {
  return isLocalhost() ? '/api/binance/api/v3' : 'https://api.binance.com/api/v3';
}
export type BinanceInterval = '1h' | '4h' | '1d' | '1w';
const MAP: Record<BinanceInterval, string> = { '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };

export async function binanceKlines(symbol: string, interval: BinanceInterval, limit = 220): Promise<Candle[]> {
  return retry(async () => {
    const r = await fetchWithTimeout(`${binanceBase()}/klines?symbol=${symbol}&interval=${MAP[interval]}&limit=${limit}`);
    if (!r.ok) throw new Error(`Binance ${r.status}`);
    const raw = (await r.json()) as unknown[][];
    return raw.map((k) => ({
      time: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  });
}
export async function binancePrices(symbols: string[]): Promise<Record<string, number>> {
  const r = await fetchWithTimeout(`${binanceBase()}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
  if (!r.ok) throw new Error(`Binance prices ${r.status}`);
  const arr = (await r.json()) as { symbol: string; price: string }[];
  const out: Record<string, number> = {};
  for (const t of arr) out[t.symbol] = parseFloat(t.price);
  return out;
}
export function binanceWS(symbols: string[], onTick: (symbol: string, price: number) => void): () => void {
  const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join('/');
  const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      const d = msg.data;
      if (d?.s && d?.c) onTick(d.s as string, parseFloat(d.c as string));
    } catch { /* ignora tick inválido */ }
  };
  return () => { try { ws.close(); } catch { /* já fechado */ } };
}
