import { fetchWithTimeout } from '@/services/cache';
import { coinHistory, coinHistoryHours } from '@/services/history';
import { closesToCandles } from '@/services/indicatorTable';
import { multiKlines, probeBinance, type KlineInterval } from '@/services/providers/multiKlines';
import { rsiWithAvg } from '@/engine/indicators';
import { idbGet, idbSet } from '@/lib/idb';
import type { Candle } from '@/types';

export type RsiTf = 'h1' | 'h4' | 'd1' | 'w1';

export interface RsiSnap {
  rsiH1: number | null; rsiH1Avg: number | null;
  rsiH4: number | null; rsiH4Avg: number | null;
  rsiD1: number | null; rsiD1Avg: number | null;
  rsiW1: number | null; rsiW1Avg: number | null;
}

export type RsiCol = keyof RsiSnap;
export type RsiOp = 'gte' | 'lte' | 'gt' | 'lt';
export interface RsiFilter { col: RsiCol; op: RsiOp; value: number }

export const RSI_COLS: { k: RsiCol; label: string }[] = [
  { k: 'rsiH1', label: '1h' }, { k: 'rsiH1Avg', label: '1h AVG' },
  { k: 'rsiH4', label: '4h' }, { k: 'rsiH4Avg', label: '4h AVG' },
  { k: 'rsiD1', label: '1d' }, { k: 'rsiD1Avg', label: '1d AVG' },
  { k: 'rsiW1', label: '1s' }, { k: 'rsiW1Avg', label: '1s AVG' },
];

export const RSI_SORT_KEYS: ReadonlySet<string> = new Set(RSI_COLS.map((c) => c.k));

/** Faixa visual: <30 sobrevendido (vermelho), >70 sobrecomprado (verde), resto neutro (âmbar). */
export function rsiBand(v: number | null | undefined): 'low' | 'mid' | 'high' | null {
  if (v == null || Number.isNaN(v)) return null;
  if (v < 30) return 'low';
  if (v > 70) return 'high';
  return 'mid';
}

const TTL = 2 * 60 * 60 * 1000;
const TOP_N = 100;
const KLINES_LIMIT = 60;

const TF_MAP: { tf: RsiTf; interval: KlineInterval }[] = [
  { tf: 'h1', interval: '1h' },
  { tf: 'h4', interval: '4h' },
  { tf: 'd1', interval: '1d' },
  { tf: 'w1', interval: '1w' },
];

const rsiKey = (symbol: string, interval: string) => `cc.quotes.cache:rsi:${symbol}:${interval}`;

function snapOfTf(kl: Candle[] | null): { rsi: number | null; avg: number | null } {
  if (!kl || kl.length < 30) return { rsi: null, avg: null };
  try {
    return rsiWithAvg(kl);
  } catch {
    return { rsi: null, avg: null };
  }
}

/** Reamostra fechamentos (ex.: diários → semanais com n=7). */
export function sampleEvery(closes: number[], n: number): number[] {
  const clean = closes.filter((v) => v > 0);
  const out: number[] = [];
  for (let i = clean.length - 1; i >= 0; i -= n) out.unshift(clean[i]);
  return out;
}

export interface RsiTableResult {
  snaps: Map<string, RsiSnap>;
  /** false quando a Binance falhou no probe (intradiário veio do fallback, mais lento). */
  binanceOk: boolean;
}

/** Fallback 100% CoinGecko: 1d do diário, 1s do diário reamostrado, 1h/4h do horário. */
async function fallbackSnaps(id: string): Promise<Partial<Record<RsiTf, Candle[]>>> {
  const out: Partial<Record<RsiTf, Candle[]>> = {};
  try {
    const daily = await coinHistory(id);
    const d1 = closesToCandles(daily);
    if (d1) {
      out.d1 = d1;
      const w1 = closesToCandles(sampleEvery(daily, 7));
      if (w1) out.w1 = w1;
    }
  } catch {
    /* sem diário */
  }
  try {
    const hourly = await coinHistoryHours(id);
    const h1 = closesToCandles(hourly.slice(-90));
    if (h1) {
      out.h1 = h1;
      const h4 = closesToCandles(sampleEvery(hourly, 4));
      if (h4) out.h4 = h4;
    }
  } catch {
    /* sem horário: 1h/4h ficam "—" */
  }
  return out;
}

export interface RsiItem {
  symbol: string;
  id: string;
  /** Fechamentos horários (sparkline): h1/h4 calculados localmente, sem fetch. */
  hourly?: number[];
}

/**
 * RSI(14)+AVG em 1h/4h/1d/1s: IDB → multi-fonte (Binance→Kraken→Coinbase) →
 * fallback CoinGecko total. `onProgress` recebe cada moeda pronta.
 */
export async function ensureRsiTable(
  items: RsiItem[],
  onProgress?: (done: number, total: number, ready?: { symbol: string; snap: RsiSnap }) => void,
  limit = TOP_N,
): Promise<RsiTableResult> {
  const out = new Map<string, RsiSnap>();
  const queue = items.slice(0, limit);
  const total = queue.length;
  let done = 0;
  const tick = (ready?: { symbol: string; snap: RsiSnap }) => onProgress?.(done, total, ready);

  const useBinance = queue.length ? await probeBinance() : true;

  for (let i = 0; i < queue.length; i += 12) {
    const batch = await Promise.all(
      queue.slice(i, i + 12).map(async (it): Promise<[string, RsiSnap]> => {
        const klByTf = new Map<RsiTf, Candle[]>();
        // Horário local primeiro (sparkline do universo: zero fetch p/ 1h/4h)
        const hourly = (it.hourly ?? []).filter((v) => v > 0);
        if (hourly.length >= 30) {
          const h1 = closesToCandles(hourly.slice(-90));
          if (h1) {
            klByTf.set('h1', h1);
            const h4 = closesToCandles(sampleEvery(hourly, 4));
            if (h4) klByTf.set('h4', h4);
          }
        }
        await Promise.all(
          TF_MAP.map(async ({ tf, interval }) => {
            try {
              const hit = await idbGet<Candle[]>(rsiKey(it.symbol, interval));
              if (hit && !hit.stale && hit.data.length >= 30) klByTf.set(tf, hit.data);
            } catch {
              /* segue para rede */
            }
          }),
        );
        // Multi-fonte (Binance→Kraken→Coinbase, com cooldown compartilhado); CoinGecko abaixo
        await Promise.all(
          TF_MAP.filter(({ tf }) => !klByTf.has(tf)).map(async ({ tf, interval }) => {
            const kl = await multiKlines(it.symbol, interval, KLINES_LIMIT, 30);
            if (kl) {
              klByTf.set(tf, kl);
              await idbSet(rsiKey(it.symbol, interval), kl, TTL);
            }
          }),
        );
        const missing = TF_MAP.some(({ tf }) => !klByTf.has(tf));
        if (missing) {
          const fb = await fallbackSnaps(it.id);
          for (const { tf, interval } of TF_MAP) {
            const kl = fb[tf];
            if (kl && !klByTf.has(tf)) {
              klByTf.set(tf, kl);
              await idbSet(rsiKey(it.symbol, interval), kl, TTL);
            }
          }
        }
        const h1 = snapOfTf(klByTf.get('h1') ?? null);
        const h4 = snapOfTf(klByTf.get('h4') ?? null);
        const d1 = snapOfTf(klByTf.get('d1') ?? null);
        const w1 = snapOfTf(klByTf.get('w1') ?? null);
        return [it.symbol, {
          rsiH1: h1.rsi, rsiH1Avg: h1.avg,
          rsiH4: h4.rsi, rsiH4Avg: h4.avg,
          rsiD1: d1.rsi, rsiD1Avg: d1.avg,
          rsiW1: w1.rsi, rsiW1Avg: w1.avg,
        }];
      }),
    );
    for (const [s, snap] of batch) {
      out.set(s, snap);
      done += 1;
      tick({ symbol: s, snap });
    }
  }
  return { snaps: out, binanceOk: useBinance };
}

/**
 * Klines de um tempo gráfico (1h/4h/1d/1s) com histórico: IDB (mesmo cache
 * da aba RSI) → multi-fonte → CoinGecko (horário p/ 1h/4h, diário p/ 1d,
 * diário reamostrado p/ 1s). Usado por Tendência, Stoch, Supertrend e Monitor.
 */
export type AnyTf = '1h' | '4h' | '1d' | '1w';
export async function getIntervalKlines(
  symbol: string,
  id: string,
  interval: AnyTf,
  minCandles: number,
  limit: number,
): Promise<Candle[] | null> {
  try {
    const hit = await idbGet<Candle[]>(rsiKey(symbol, interval));
    if (hit && !hit.stale && hit.data.length >= minCandles) return hit.data;
  } catch {
    /* segue para rede */
  }
  const kl = await multiKlines(symbol, interval, limit, minCandles);
  if (kl) {
    await idbSet(rsiKey(symbol, interval), kl, TTL);
    return kl;
  }
  try {
    let closes: number[];
    if (interval === '1h') {
      closes = (await coinHistoryHours(id)).slice(-250);
    } else if (interval === '4h') {
      closes = sampleEvery(await coinHistoryHours(id), 4).slice(-250);
    } else if (interval === '1w') {
      closes = sampleEvery(await coinHistory(id), 7);
    } else {
      closes = await coinHistory(id);
    }
    const kl = closesToCandles(closes);
    if (kl && kl.length >= minCandles) {
      await idbSet(rsiKey(symbol, interval), kl, TTL);
      return kl;
    }
    return kl;
  } catch {
    return null;
  }
}
