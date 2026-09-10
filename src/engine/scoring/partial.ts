import type { MarketRegime, OpportunityScore, Signal } from '@/types';
import { RSI, SMA, EMA, MACD, BollingerBands } from 'technicalindicators';
import { SCORING_WEIGHTS, classifyScore } from '@/engine/scoring/scoring.config';

export interface PartialInput {
  symbol: string;
  closes: number[];
  btcChange7d?: number | null;
  change7d?: number | null;
  regime?: MarketRegime | null;
}

const last = (arr: number[]): number | null => (arr.length ? arr[arr.length - 1] : null);

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

/**
 * Score parcial honesto para ativos SEM candles OHLC/volume (só fechamentos
 * do market_chart). Mesma escala 0–100 e mesmas faixas, mas:
 * - VOLUME zera com nota explícita;
 * - volatilidade vem do desvio dos retornos;
 * - confiança limitada a 70 e Data Quality a 50.
 * Retorna null com menos de 60 fechamentos (amostra insuficiente).
 */
export function scorePartial(input: PartialInput): OpportunityScore | null {
  const { symbol, closes, regime } = input;
  const v = closes.filter((c) => c > 0);
  if (v.length < 60) return null;
  const W = SCORING_WEIGHTS;
  const price = v[v.length - 1];

  const sma = (p: number) => (v.length >= p ? last(SMA.calculate({ period: p, values: v })) : null);
  const ema = (p: number) => (v.length >= p + 1 ? last(EMA.calculate({ period: p, values: v })) : null);
  const sma20 = sma(20);
  const sma50 = sma(50);
  const sma200 = sma(200);
  const ema12 = ema(12);
  const ema26 = ema(26);
  const rsi = v.length >= 15 ? last(RSI.calculate({ period: 14, values: v })) : null;
  const macdOut = v.length >= 35 ? MACD.calculate({ values: v, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }) : [];
  const macdHist = macdOut.length ? (macdOut[macdOut.length - 1].histogram ?? null) : null;
  const macdBull = macdHist == null ? null : macdHist > 0;
  const bb = v.length >= 20 ? BollingerBands.calculate({ period: 20, stdDev: 2, values: v }) : [];
  const bbLast = bb.length ? bb[bb.length - 1] : null;

  const trendPts = (() => {
    let p = W.trend / 2;
    if (sma50 != null && sma200 != null) p += sma50 > sma200 ? W.trend / 2 : -W.trend / 2;
    else if (sma20 != null) p += price > sma20 ? W.trend / 4 : -W.trend / 4;
    if (ema12 != null && ema26 != null) p += ema12 > ema26 ? 2 : -2;
    return Math.max(0, Math.min(W.trend, p));
  })();
  const momentumPts = (() => {
    let p = W.momentum / 2;
    if (macdBull === true) p += 5;
    else if (macdBull === false) p -= 5;
    if (rsi != null) p += rsi >= 50 && rsi <= 70 ? 3 : -2;
    return Math.max(0, Math.min(W.momentum, p));
  })();
  const relPts = (() => {
    const d = (input.change7d ?? 0) - (input.btcChange7d ?? 0);
    if (d >= 8) return W.relativeStrength;
    if (d >= 3) return W.relativeStrength * 0.8;
    if (d >= 0) return W.relativeStrength * 0.55;
    if (d >= -5) return W.relativeStrength * 0.3;
    return W.relativeStrength * 0.1;
  })();
  const rsiPts = rsi == null ? W.rsi * 0.4 : rsi >= 50 && rsi <= 68 ? W.rsi : rsi >= 40 && rsi < 50 ? W.rsi * 0.55 : W.rsi * 0.25;
  const macdPts = macdBull === true ? W.macd : macdBull === false ? W.macd * 0.15 : W.macd * 0.5;
  const rets: number[] = [];
  for (let i = 1; i < v.length; i++) rets.push(v[i] / v[i - 1] - 1);
  const vol = stdev(rets.slice(-30)) * 100;
  const volatPts = vol <= 2.5 ? W.volatility : vol <= 5 ? W.volatility * 0.6 : W.volatility * 0.3;
  const regimePts = !regime ? W.regime * 0.5 : W.regime * 0.5;

  // Sinal ponderado só com o que existe
  let num = 0;
  let den = 0;
  const vote = (s: Signal, w: number) => {
    num += (s === 'BUY' ? 1 : s === 'SELL' ? -1 : 0) * w;
    den += w;
  };
  vote(sma50 != null && sma200 != null ? (sma50 > sma200 ? 'BUY' : 'SELL') : sma20 != null ? (price > sma20 ? 'BUY' : 'SELL') : 'NEUTRAL', 1.2);
  vote(ema12 != null && ema26 != null ? (ema12 > ema26 ? 'BUY' : 'SELL') : 'NEUTRAL', 1.0);
  vote(rsi == null ? 'NEUTRAL' : rsi < 30 ? 'BUY' : rsi > 70 ? 'SELL' : rsi >= 50 ? 'BUY' : 'SELL', 1.0);
  vote(macdBull == null ? 'NEUTRAL' : macdBull ? 'BUY' : 'SELL', 1.1);
  vote(bbLast && bbLast.upper != null && bbLast.lower != null ? (price > bbLast.upper ? 'SELL' : price < bbLast.lower ? 'BUY' : 'NEUTRAL') : 'NEUTRAL', 0.6);
  const norm = den ? num / den : 0;
  const signal: Signal = norm > 0.15 ? 'BUY' : norm < -0.15 ? 'SELL' : 'NEUTRAL';

  const breakdown = [
    { label: 'TREND', earned: Math.round(trendPts), max: W.trend },
    { label: 'MOMENTUM', earned: Math.round(momentumPts), max: W.momentum },
    { label: 'RELATIVE STRENGTH', earned: Math.round(relPts), max: W.relativeStrength },
    { label: 'VOLUME', earned: 0, max: W.volume },
    { label: 'RSI', earned: Math.round(rsiPts), max: W.rsi },
    { label: 'MACD', earned: Math.round(macdPts), max: W.macd },
    { label: 'VOLATILITY', earned: Math.round(volatPts), max: W.volatility },
    { label: 'REGIME', earned: Math.round(regimePts), max: W.regime },
  ];
  const score = Math.max(0, Math.min(100, breakdown.reduce((s, b) => s + b.earned, 0)));
  const dq = Math.min(50, Math.round(20 + (Math.min(v.length, 365) / 365) * 30));
  const confidence = Math.round(Math.min(70, 45 + Math.abs(norm) * 35 + dq * 0.2));

  const why: string[] = [];
  const risks: string[] = ['⚠ Histórico parcial: só preços de fechamento (sem volume/OHLC)'];
  if (sma50 != null && sma200 != null) why.push(sma50 > sma200 ? '✓ SMA50 > SMA200' : '✕ SMA50 < SMA200');
  if (macdBull === true) why.push('✓ MACD bullish');
  else if (macdBull === false) risks.push('⚠ MACD bearish');
  if (rsi != null) (rsi >= 50 && rsi <= 70 ? why : risks).push(`${rsi >= 50 && rsi <= 70 ? '✓' : '⚠'} RSI = ${rsi.toFixed(1)}`);

  return {
    symbol, score, classification: classifyScore(score), confidence,
    dataQuality: dq, timeframeAlignment: 50, signal, breakdown, why, risks,
  };
}
