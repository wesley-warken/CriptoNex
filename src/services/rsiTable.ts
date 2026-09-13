import { fetchWithTimeout } from '@/services/cache';
import { coinHistory, coinHistoryHours } from '@/services/history';
import { closesToCandles } from '@/services/indicatorTable';
import { multiKlines, probeBinance, isFresh, type KlineInterval } from '@/services/providers/multiKlines';
import { rsiWithAvg, RSI_MIN_BARS } from '@/engine/indicators';
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

const TF_MAP: { tf: RsiTf; interval: KlineInterval }[] = [
  { tf: 'h1', interval: '1h' },
  { tf: 'h4', interval: '4h' },
  { tf: 'd1', interval: '1d' },
  { tf: 'w1', interval: '1w' },
];

const rsiKey = (symbol: string, interval: string) => `cc.quotes.cache:rsi2:${symbol}:${interval}`;

function snapOfTf(kl: Candle[] | null): { rsi: number | null; avg: number | null } {
  if (!kl || kl.length < RSI_MIN_BARS) return { rsi: null, avg: null };
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

export interface RsiItem {
  symbol: string;
  id: string;
  /** Legado (sparkline): RSI agora exige OHLC real — campo mantido p/ compatibilidade, ignorado. */
  hourly?: number[];
}

/** Limite de candles buscados por TF (warmup de Wilder + AVG). */
const REAL_LIMIT: Record<RsiTf, number> = { h1: 220, h4: 220, d1: 300, w1: 150 };

/**
 * RSI(14)+AVG em 1h/4h/1d/1s: SOMENTE OHLC real de exchange (paridade
 * TradingView) com warmup de 100 barras. Sem dado real: "—" (indisponível),
 * nunca aproximado do sparkline. `onProgress` recebe cada moeda pronta.
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
        // OHLC real por TF (IDB real → multi-fonte); ausente = indisponível.
        await Promise.all(
          TF_MAP.map(async ({ tf, interval }) => {
            const kl = await getRealKlines(it.symbol, interval, RSI_MIN_BARS, REAL_LIMIT[tf]);
            if (kl) klByTf.set(tf, kl);
          }),
        );
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
async function fetchIntervalKlines(symbol: string, id: string, interval: AnyTf, minCandles: number, limit: number): Promise<Candle[] | null> {
  const kl = (await multiKlines(symbol, interval, limit, minCandles))?.klines ?? null;
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
    const fb = closesToCandles(closes);
    if (fb && fb.length >= minCandles) {
      await idbSet(rsiKey(symbol, interval), fb, TTL);
      return fb;
    }
    return fb;
  } catch {
    return null;
  }
}

export async function getIntervalKlines(
  symbol: string,
  id: string,
  interval: AnyTf,
  minCandles: number,
  limit: number,
): Promise<Candle[] | null> {
  try {
    const hit = await idbGet<Candle[]>(rsiKey(symbol, interval));
    if (hit && hit.data.length >= minCandles) {
      if (!hit.stale) return hit.data;
      // Stale com graça: serve na hora, atualiza em background
      if (Date.now() - hit.ts < TTL) {
        void fetchIntervalKlines(symbol, id, interval, minCandles, limit).catch(() => {});
        return hit.data;
      }
    }
  } catch {
    /* segue para rede */
  }
  return fetchIntervalKlines(symbol, id, interval, minCandles, limit);
}

/** Chave separada do misto: sintético NUNCA entra aqui. */
const realKey = (symbol: string, interval: string) => `cc.quotes.cache:klreal:${symbol}:${interval}`;

/** Idade máxima do cache real por timeframe (indicador precisa de dado novo). */
const REAL_TTL_MS: Record<AnyTf, number> = {
  '1h': 2 * 3600_000,
  '4h': 8 * 3600_000,
  '1d': 36 * 3600_000,
  '1w': 8 * 24 * 3600_000,
};

/**
 * Klines OHLC reais com frescor (multi-fonte Binance→Kraken→Coinbase).
 * null = indisponível (o chamador mostra "indisponível", nunca sintético).
 * Usado pelos indicadores de range do Monitor (stoch/super/voto-Stoch).
 */
export async function getRealKlines(
  symbol: string, interval: AnyTf, minCandles: number, limit: number,
): Promise<Candle[] | null> {
  try {
    const hit = await idbGet<Candle[]>(realKey(symbol, interval));
    if (hit && hit.data.length >= minCandles && isFresh(hit.data, interval)
      && Date.now() - hit.ts < REAL_TTL_MS[interval]) {
      return hit.data;
    }
  } catch {
    /* segue para rede */
  }
  const kl = (await multiKlines(symbol, interval, limit, minCandles))?.klines ?? null;
  if (kl && kl.length >= minCandles && isFresh(kl, interval)) {
    try {
      await idbSet(realKey(symbol, interval), kl, REAL_TTL_MS[interval]);
    } catch {
      /* quota cheia */
    }
    return kl;
  }
  return null;
}
