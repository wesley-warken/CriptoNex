import { snapshot } from '@/engine/indicators';
import { coinHistory } from '@/services/history';
import { multiKlines, probeBinance } from '@/services/providers/multiKlines';
import { idbGet, idbSet } from '@/lib/idb';
import type { Candle, IndicatorSnapshot } from '@/types';

export type IndSnap = IndicatorSnapshot;

const TTL = 2 * 60 * 60 * 1000;
const TOP_N = 100;

const indKey = (symbol: string) => `cc.quotes.cache:ind2:${symbol}USDT`;

/**
 * Converte fechamentos (CoinGecko/sparkline) em pseudo-candles.
 * high/low sintéticos (±0,05%) só para não zerar indicadores que precisam
 * de range; RSI/MACD/SMA/EMA usam só o close, então são exatos.
 */
export function closesToCandles(closes: number[]): Candle[] | null {
  const last = closes.filter((v) => v > 0).slice(-120);
  if (last.length < 40) return null;
  const day = 86_400_000;
  const now = Date.now();
  return last.map((close, i) => {
    const open = i === 0 ? close : last[i - 1];
    return {
      time: now - (last.length - 1 - i) * day,
      open,
      high: Math.max(open, close) * 1.0005,
      low: Math.min(open, close) * 0.9995,
      close,
      volume: 0,
    };
  });
}

/**
 * Klines 1d: cache IDB → multi-fonte (Binance→Kraken→Coinbase) → fallback CoinGecko.
 * O fallback cobre stablecoins (sem par em exchange) e bloqueios,
 * então as abas de indicadores sempre terminam com dados em vez de "—".
 */
export async function ensureTopKlines(
  items: { symbol: string; id: string }[],
  onProgress?: (done: number, total: number) => void,
  limit = TOP_N,
): Promise<Map<string, Candle[]>> {
  const out = new Map<string, Candle[]>();
  const queue = items.slice(0, limit);
  const total = queue.length;
  let done = 0;
  const tick = () => onProgress?.(done, total);

  // 1) IDB primeiro (instantâneo)
  const missing: { symbol: string; id: string }[] = [];
  for (const it of queue) {
    try {
      const hit = await idbGet<Candle[]>(indKey(it.symbol));
      if (hit && !hit.stale && hit.data.length >= 40) {
        out.set(it.symbol, hit.data);
        done += 1;
        tick();
        continue;
      }
    } catch {
      /* segue para rede */
    }
    missing.push(it);
  }
  if (!missing.length) return out;

  // 2) Probe barato (cooldown compartilhado entre abas); o lote multi-fonte
  // tenta Binance primeiro quando ela responde, senão Kraken/Coinbase
  if (missing.length) await probeBinance();
  const rest = [...missing];

  // 3) Multi-fonte em lotes (Binance→Kraken→Coinbase); o que sobrar vai ao CoinGecko
  const needFallback: { symbol: string; id: string }[] = [];
  for (let i = 0; i < rest.length; i += 12) {
    const batch = await Promise.all(
        rest.slice(i, i + 12).map(async (it): Promise<[string, Candle[] | null]> => [it.symbol, (await multiKlines(it.symbol, '1d', 120, 40))?.klines ?? null]),
    );
    for (const [s, kl] of batch) {
      if (kl) {
        out.set(s, kl);
        await idbSet(indKey(s), kl, TTL);
      } else {
        const it = rest.find((q) => q.symbol === s);
        if (it) needFallback.push(it);
      }
      done += 1;
      tick();
    }
  }

  // 4) Fallback CoinGecko (concorrência baixa respeita o rate limit;
  // coinHistory já tem cache IDB 24h + backoff em 429)
  for (let i = 0; i < needFallback.length; i += 2) {
    const batch = await Promise.all(
      needFallback.slice(i, i + 2).map(async (it): Promise<[string, Candle[] | null]> => {
        try {
          return [it.symbol, closesToCandles(await coinHistory(it.id))];
        } catch {
          return [it.symbol, null];
        }
      }),
    );
    for (const [s, kl] of batch) {
      if (kl) {
        out.set(s, kl);
        await idbSet(indKey(s), kl, TTL);
      }
      done += 1;
      tick();
    }
  }
  return out;
}

export function snapOf(kl: Candle[] | undefined): IndSnap | null {
  if (!kl || kl.length < 40) return null;
  try {
    return snapshot(kl);
  } catch {
    return null;
  }
}
