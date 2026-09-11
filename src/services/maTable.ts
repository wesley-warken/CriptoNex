import { coinHistory } from '@/services/history';
import { closesToCandles } from '@/services/indicatorTable';
import { getIntervalKlines } from '@/services/rsiTable';
import { multiKlines, probeBinance } from '@/services/providers/multiKlines';
import { calcEMA, calcSMA } from '@/engine/indicators';
import { idbGet, idbSet } from '@/lib/idb';
import type { Candle } from '@/types';

export type MaKind = 'SMA' | 'EMA';
export type MaFast = number | 'price';

export const MA_FASTS = [9, 12, 26, 50, 100];
export const MA_SLOWS = [12, 26, 50, 100, 200];
export const MA_PERIODS = [9, 12, 26, 50, 100, 200];
const MA_MIN_CANDLES = 210;
const MA_LIMIT = 250;
const MA_TTL = 2 * 60 * 60 * 1000;

const maKey = (symbol: string) => `cc.quotes.cache:ma2:${symbol}`;

/** Lentas do cruzamento (exclui a rápida quando coincide). */
export function slowsFor(fast: MaFast): number[] {
  return MA_SLOWS.filter((s) => s !== fast);
}

export function maCrossTitle(kind: MaKind, fast: MaFast, slow: number): string {
  return fast === 'price' ? `Preço cruzando ${kind} ${slow}` : `${kind} ${fast} cruzando ${kind} ${slow}`;
}

export interface MaSet {
  price: number;
  sma: Record<number, number | null>;
  ema: Record<number, number | null>;
}

function lastNum(arr: (number | undefined)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== undefined && v !== null && !Number.isNaN(v)) return v;
  }
  return null;
}

/** Calcula SMA/EMA 9–200 a partir dos fechamentos (exige ~210 candles p/ a 200). */
export function computeMaSet(closes: number[]): MaSet | null {
  const clean = closes.filter((v) => v > 0);
  if (clean.length < MA_MIN_CANDLES) return null;
  const sma: Record<number, number | null> = {};
  const ema: Record<number, number | null> = {};
  for (const p of MA_PERIODS) {
    sma[p] = lastNum(calcSMA(clean, p));
    ema[p] = lastNum(calcEMA(clean, p).map(Number));
  }
  return { price: clean[clean.length - 1], sma, ema };
}

/** Diferença rápida − lenta (>0 = Acima). `fast='price'` compara o preço. */
export function maCrossDiff(set: MaSet | null, kind: MaKind, fast: MaFast, slow: number): number | null {
  if (!set) return null;
  const slowV = kind === 'SMA' ? set.sma[slow] : set.ema[slow];
  if (slowV == null) return null;
  const fastV = fast === 'price' ? set.price : kind === 'SMA' ? set.sma[fast] : set.ema[fast];
  if (fastV == null) return null;
  return fastV - slowV;
}

async function maDaily(symbol: string, id: string): Promise<Candle[] | null> {
  try {
    const hit = await idbGet<Candle[]>(maKey(symbol));
    if (hit && !hit.stale && hit.data.length >= MA_MIN_CANDLES) return hit.data;
  } catch {
    /* segue para rede */
  }
  const res = await multiKlines(symbol, '1d', MA_LIMIT, MA_MIN_CANDLES);
  const kl = res?.klines ?? null;
  if (kl) {
    await idbSet(maKey(symbol), kl, MA_TTL);
    return kl;
  }
  try {
    const fb = closesToCandles(await coinHistory(id));
    if (fb) await idbSet(maKey(symbol), fb, MA_TTL);
    return fb;
  } catch {
    return null;
  }
}

/**
 * Klines com histórico para cruzamentos de médias (top-100, cache 1h).
 * 1d: 250 candles diários · 1h/4h: reaproveita o cache da aba RSI.
 */
export async function ensureMaKlines(
  items: { symbol: string; id: string }[],
  tf: '1d' | '1h' | '4h',
  onProgress?: (done: number, total: number, ready?: { symbol: string; klines: Candle[] | null }) => void,
  limit = 100,
): Promise<Map<string, Candle[]>> {
  const out = new Map<string, Candle[]>();
  const queue = items.slice(0, limit);
  const total = queue.length;
  let done = 0;
  if (queue.length) await probeBinance();
  for (let i = 0; i < queue.length; i += 12) {
    const batch = await Promise.all(
      queue.slice(i, i + 12).map(async (it): Promise<[string, Candle[] | null]> => {
        const kl = tf === '1d'
          ? await maDaily(it.symbol, it.id)
          : await getIntervalKlines(it.symbol, it.id, tf, MA_MIN_CANDLES, MA_LIMIT);
        return [it.symbol, kl];
      }),
    );
    for (const [s, kl] of batch) {
      if (kl) out.set(s, kl);
      done += 1;
      onProgress?.(done, total, { symbol: s, klines: kl });
    }
  }
  return out;
}
