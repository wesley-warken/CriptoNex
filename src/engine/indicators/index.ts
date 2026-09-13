import { RSI, SMA, EMA, MACD, Stochastic, BollingerBands, ADX, ATR } from 'technicalindicators';
import type { Candle, IndicatorSnapshot } from '@/types';

const closes = (c: Candle[]) => c.map((k) => k.close);

/** Número finito ou null — nada de NaN/Infinity vazando como "número". */
function fin(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Últimos n valores todos finitos (janela de aquecimento do indicador). */
function tailFinite(v: number[], n: number): boolean {
  const t = v.slice(-Math.min(n, v.length));
  if (!t.length) return false;
  return t.every((x) => typeof x === 'number' && Number.isFinite(x));
}

export function calcSMA(values: number[], period: number): (number | undefined)[] {
  return SMA.calculate({ period, values });
}
export function calcEMA(values: number[], period: number): number[] {
  return EMA.calculate({ period, values });
}
/**
 * Barras mínimas para um RSI confiável (paridade TradingView): o alisamento
 * de Wilder só converge com histórico longo — 30–60 candles deslocam o valor
 * (caso real: 29,97 vs 39,78 no TV). Abaixo disso, exibir "indisponível".
 */
export const RSI_MIN_BARS = 100;
export function calcRSI(candles: Candle[], period = 14): number | null {
  const v = closes(candles);
  if (v.length < period + 1 || !tailFinite(v, period + 1)) return null;
  const out = RSI.calculate({ period, values: v });
  return out.length ? fin(out[out.length - 1]) : null;
}
/** RSI atual + AVG (média dos últimos `avgN` RSIs). Exige ≥30 candles. */
export function rsiWithAvg(candles: Candle[], period = 14, avgN = 14): { rsi: number | null; avg: number | null } {
  const v = closes(candles);
  if (v.length < period + avgN + 2) return { rsi: null, avg: null };
  const series = RSI.calculate({ period, values: v });
  if (!series.length) return { rsi: null, avg: null };
  const tail = series.slice(-avgN);
  return { rsi: series[series.length - 1], avg: tail.reduce((a, b) => a + b, 0) / tail.length };
}
export function calcMACD(candles: Candle[]) {
  const v = closes(candles);
  if (v.length < 35 || !tailFinite(v, 60)) return { hist: null as number | null, signal: 'NEUTRAL' as const };
  const out = MACD.calculate({ values: v, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  if (!out.length) return { hist: null as number | null, signal: 'NEUTRAL' as const };
  const last = out[out.length - 1];
  const hist = fin(last.histogram);
  const signal = hist === null ? ('NEUTRAL' as const) : hist > 0 ? ('BUY' as const) : hist < 0 ? ('SELL' as const) : ('NEUTRAL' as const);
  return { hist, signal };
}
export function calcStoch(candles: Candle[]) {
  if (candles.length < 15) return { k: null as number | null, d: null as number | null };
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = closes(candles);
  if (!tailFinite(high, 15) || !tailFinite(low, 15) || !tailFinite(close, 15)) {
    return { k: null as number | null, d: null as number | null };
  }
  const out = Stochastic.calculate({
    high, low, close,
    period: 14,
    signalPeriod: 3,
  });
  if (!out.length) return { k: null, d: null };
  const last = out[out.length - 1];
  return { k: fin(last.k), d: fin(last.d) };
}
export function calcBB(candles: Candle[], period = 20, stdDev = 2) {
  const v = closes(candles);
  if (v.length < period || !tailFinite(v, period)) return { upper: null as number | null, mid: null as number | null, lower: null as number | null };
  const out = BollingerBands.calculate({ period, stdDev, values: v });
  if (!out.length) return { upper: null, mid: null, lower: null };
  const last = out[out.length - 1];
  return { upper: fin(last.upper), mid: fin(last.middle), lower: fin(last.lower) };
}
export function calcADX(candles: Candle[]) {
  if (candles.length < 30) return null;
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = closes(candles);
  if (!tailFinite(high, 30) || !tailFinite(low, 30) || !tailFinite(close, 30)) return null;
  const out = ADX.calculate({
    high, low, close,
    period: 14,
  });
  return out.length ? fin(out[out.length - 1].adx) : null;
}
export function calcATR(candles: Candle[]) {
  if (candles.length < 15) return null;
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = closes(candles);
  if (!tailFinite(high, 15) || !tailFinite(low, 15) || !tailFinite(close, 15)) return null;
  const out = ATR.calculate({
    high, low, close,
    period: 14,
  });
  return out.length ? fin(out[out.length - 1]) : null;
}
// Supertrend próprio (sem look-ahead): usa apenas dados até o candle atual.
// Sem rompimento decisivo em nenhum candle, retorna dir null (neutro) —
// nunca assume viés altista/baixista padrão.
export interface SupertrendPoint { dir: 'BULLISH' | 'BEARISH' | null; value: number }
export function calcSupertrendFull(candles: Candle[], period = 10, multiplier = 3): SupertrendPoint | null {
  if (candles.length < period + 2) return null;
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = closes(candles);
  if (!high.every(Number.isFinite) || !low.every(Number.isFinite) || !close.every(Number.isFinite)) return null;
  const atrArr = ATR.calculate({
    high,
    low,
    close,
    period,
  });
  if (atrArr.length < 2) return null;
  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let trend: 'BULLISH' | 'BEARISH' | null = null;
  let value = candles[candles.length - 1].close;
  const start = candles.length - atrArr.length;
  for (let i = 0; i < atrArr.length; i++) {
    const c = candles[start + i];
    const atr = atrArr[i];
    const hl2 = (c.high + c.low) / 2;
    const upper = hl2 + multiplier * atr;
    const lower = hl2 - multiplier * atr;
    const prevClose = i === 0 ? candles[start].open : candles[start + i - 1].close;
    const fu = upper < prevUpper || prevClose > prevUpper ? upper : prevUpper;
    const fl = lower > prevLower || prevClose < prevLower ? lower : prevLower;
    if (c.close > fu) trend = 'BULLISH';
    else if (c.close < fl) trend = 'BEARISH';
    if (trend === 'BULLISH') value = fl;
    else if (trend === 'BEARISH') value = fu;
    prevUpper = fu;
    prevLower = fl;
  }
  return { dir: trend, value };
}
export function calcSupertrend(candles: Candle[], period = 10, multiplier = 3): 'BULLISH' | 'BEARISH' | null {
  return calcSupertrendFull(candles, period, multiplier)?.dir ?? null;
}
function lastOrNull(arr: (number | undefined)[], priceFallback?: number): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== undefined && v !== null && !Number.isNaN(v)) return v;
  }
  return priceFallback ?? null;
}
export function snapshot(candles: Candle[]): IndicatorSnapshot {
  const v = closes(candles);
  const last = v[v.length - 1];
  const sma20 = v.length >= 20 ? lastOrNull(calcSMA(v, 20)) : null;
  const sma50 = v.length >= 50 ? lastOrNull(calcSMA(v, 50)) : null;
  const sma200 = v.length >= 200 ? lastOrNull(calcSMA(v, 200)) : null;
  const ema12 = v.length >= 13 ? lastOrNull(calcEMA(v, 12).map(Number)) : null;
  const ema26 = v.length >= 27 ? lastOrNull(calcEMA(v, 26).map(Number)) : null;
  const macd = calcMACD(candles);
  const stoch = calcStoch(candles);
  const bb = calcBB(candles);
  const vols = candles.map((c) => c.volume);
  const avgVol = vols.length >= 20 ? vols.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
  const lastVol = candles.length ? candles[candles.length - 1].volume : NaN;
  const volumeRatio = avgVol != null && avgVol > 0 && Number.isFinite(avgVol) && Number.isFinite(lastVol) && last !== undefined
    ? fin(lastVol / avgVol)
    : null;
  return {
    rsi: calcRSI(candles),
    macdHist: macd.hist,
    macdSignal: macd.signal,
    sma20, sma50, sma200, ema12, ema26,
    supertrend: calcSupertrend(candles),
    adx: calcADX(candles),
    atr: calcATR(candles),
    stochK: stoch.k, stochD: stoch.d,
    bbUpper: bb.upper, bbLower: bb.lower, bbMid: bb.mid,
    volumeRatio,
  };
}
export function detectDivergence(closesArr: number[], rsiArr: number[]): { bullish: boolean; bearish: boolean; confidence: number } {
  if (closesArr.length < 30 || rsiArr.length < 30) return { bullish: false, bearish: false, confidence: 0 };
  // Janela recente (14) vs anterior (16): índices sempre relativos ao slice.
  const pPrev = closesArr.slice(-30, -14);
  const pRec = closesArr.slice(-14);
  const rPrev = rsiArr.slice(-30, -14);
  const rRec = rsiArr.slice(-14);
  if (![...pPrev, ...pRec, ...rPrev, ...rRec].every(Number.isFinite)) {
    return { bullish: false, bearish: false, confidence: 0 };
  }
  const low = Math.min(...pRec);
  const high = Math.max(...pRec);
  const rsiAtLow = rRec[pRec.indexOf(low)];
  const rsiAtHigh = rRec[pRec.indexOf(high)];
  const bullish = low < Math.min(...pPrev) && rsiAtLow > Math.min(...rPrev);
  const bearish = high > Math.max(...pPrev) && rsiAtHigh < Math.max(...rPrev);
  const confidence = bullish || bearish ? 62 : 0;
  return { bullish, bearish, confidence };
}
