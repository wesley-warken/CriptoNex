import { RSI, SMA, EMA, MACD, Stochastic, BollingerBands, ADX, ATR } from 'technicalindicators';
import type { Candle, IndicatorSnapshot } from '@/types';

const closes = (c: Candle[]) => c.map((k) => k.close);

export function calcSMA(values: number[], period: number): (number | undefined)[] {
  return SMA.calculate({ period, values });
}
export function calcEMA(values: number[], period: number): number[] {
  return EMA.calculate({ period, values });
}
export function calcRSI(candles: Candle[], period = 14): number | null {
  const v = closes(candles);
  if (v.length < period + 1) return null;
  const out = RSI.calculate({ period, values: v });
  return out.length ? out[out.length - 1] : null;
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
  if (v.length < 35) return { hist: null as number | null, signal: 'NEUTRAL' as const };
  const out = MACD.calculate({ values: v, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  if (!out.length) return { hist: null as number | null, signal: 'NEUTRAL' as const };
  const last = out[out.length - 1];
  const hist = last.histogram ?? null;
  const signal = hist === null ? ('NEUTRAL' as const) : hist > 0 ? ('BUY' as const) : hist < 0 ? ('SELL' as const) : ('NEUTRAL' as const);
  return { hist, signal };
}
export function calcStoch(candles: Candle[]) {
  if (candles.length < 15) return { k: null as number | null, d: null as number | null };
  const out = Stochastic.calculate({
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: closes(candles),
    period: 14,
    signalPeriod: 3,
  });
  if (!out.length) return { k: null, d: null };
  const last = out[out.length - 1];
  return { k: last.k ?? null, d: last.d ?? null };
}
export function calcBB(candles: Candle[], period = 20, stdDev = 2) {
  const v = closes(candles);
  if (v.length < period) return { upper: null as number | null, mid: null as number | null, lower: null as number | null };
  const out = BollingerBands.calculate({ period, stdDev, values: v });
  if (!out.length) return { upper: null, mid: null, lower: null };
  const last = out[out.length - 1];
  return { upper: last.upper ?? null, mid: last.middle ?? null, lower: last.lower ?? null };
}
export function calcADX(candles: Candle[]) {
  if (candles.length < 30) return null;
  const out = ADX.calculate({
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: closes(candles),
    period: 14,
  });
  return out.length ? out[out.length - 1].adx ?? null : null;
}
export function calcATR(candles: Candle[]) {
  if (candles.length < 15) return null;
  const out = ATR.calculate({
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: closes(candles),
    period: 14,
  });
  return out.length ? out[out.length - 1] ?? null : null;
}
// Supertrend próprio (sem look-ahead): usa apenas dados até o candle atual.
export interface SupertrendPoint { dir: 'BULLISH' | 'BEARISH'; value: number }
export function calcSupertrendFull(candles: Candle[], period = 10, multiplier = 3): SupertrendPoint | null {
  if (candles.length < period + 2) return null;
  const atrArr = ATR.calculate({
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: closes(candles),
    period,
  });
  if (atrArr.length < 2) return null;
  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let trend: 'BULLISH' | 'BEARISH' = 'BULLISH';
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
    trend = c.close > fu ? 'BULLISH' : c.close < fl ? 'BEARISH' : trend;
    value = trend === 'BULLISH' ? fl : fu;
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
  const volumeRatio = avgVol && avgVol > 0 && last !== undefined ? candles[candles.length - 1].volume / avgVol : null;
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
  const p = closesArr.slice(-30);
  const r = rsiArr.slice(-30);
  const priceLowIdx = p.indexOf(Math.min(...p.slice(-14)));
  const priceHighIdx = p.indexOf(Math.max(...p.slice(-14)));
  const prevLow = Math.min(...p.slice(0, 16));
  const prevHigh = Math.max(...p.slice(0, 16));
  const rsiAtLow = r[14 + priceLowIdx] ?? r[r.length - 1];
  const rsiPrevLow = Math.min(...r.slice(0, 16));
  const rsiAtHigh = r[14 + priceHighIdx] ?? r[r.length - 1];
  const rsiPrevHigh = Math.max(...r.slice(0, 16));
  const bullish = p[14 + priceLowIdx] < prevLow && rsiAtLow > rsiPrevLow;
  const bearish = p[14 + priceHighIdx] > prevHigh && rsiAtHigh < rsiPrevHigh;
  const confidence = bullish || bearish ? 62 : 0;
  return { bullish, bearish, confidence };
}
