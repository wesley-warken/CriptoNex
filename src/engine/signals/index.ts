import type { Candle, IndicatorSnapshot, Signal, TechnicalSignal } from '@/types';
import { snapshot } from '@/engine/indicators';

export interface SignalResult {
  signals: TechnicalSignal[];
  summary: { bullish: number; neutral: number; bearish: number };
  signal: Signal;
  confidence: number;
}

function sig(s: Signal): number {
  return s === 'BUY' ? 1 : s === 'SELL' ? -1 : 0;
}

export function buildSignals(candles: Candle[], snap?: IndicatorSnapshot): SignalResult {
  const s: IndicatorSnapshot = snap ?? snapshot(candles);
  const price = candles.length ? candles[candles.length - 1].close : 0;
  const out: TechnicalSignal[] = [];
  const push = (indicator: string, signal: Signal, weight: number, detail: string) =>
    out.push({ indicator, signal, weight, detail });

  push('SMA', s.sma50 != null && s.sma200 != null ? (s.sma50 > s.sma200 ? 'BUY' : 'SELL') : s.sma20 != null && price > s.sma20 ? 'BUY' : s.sma20 != null ? 'SELL' : 'NEUTRAL', 1.2, s.sma50 != null && s.sma200 != null ? `SMA50 ${s.sma50 > s.sma200 ? '>' : '<'} SMA200` : 'SMA200 indisponível — usando SMA20');
  push('EMA', s.ema12 != null && s.ema26 != null ? (s.ema12 > s.ema26 ? 'BUY' : 'SELL') : 'NEUTRAL', 1.0, 'EMA12 vs EMA26');
  push('RSI', s.rsi == null ? 'NEUTRAL' : s.rsi < 30 ? 'BUY' : s.rsi > 70 ? 'SELL' : s.rsi >= 50 ? 'BUY' : 'SELL', 1.0, s.rsi == null ? 'RSI indisponível' : `RSI = ${s.rsi.toFixed(1)}`);
  push('MACD', s.macdSignal ?? 'NEUTRAL', 1.1, s.macdHist == null ? 'MACD indisponível' : `Hist ${s.macdHist.toFixed(4)}`);
  push('Supertrend', s.supertrend === 'BULLISH' ? 'BUY' : s.supertrend === 'BEARISH' ? 'SELL' : 'NEUTRAL', 1.3, s.supertrend ? `Supertrend ${s.supertrend.toLowerCase()}` : 'Supertrend indisponível');
  push('ADX', s.adx == null ? 'NEUTRAL' : s.adx >= 25 ? (out[out.length - 1]?.signal === 'SELL' ? 'SELL' : 'BUY') : 'NEUTRAL', 0.7, s.adx == null ? 'ADX indisponível' : `ADX = ${s.adx.toFixed(1)}`);
  push('Stochastic', s.stochK == null ? 'NEUTRAL' : s.stochK < 20 ? 'BUY' : s.stochK > 80 ? 'SELL' : 'NEUTRAL', 0.7, s.stochK == null ? 'Stoch indisponível' : `Stoch K=${s.stochK.toFixed(1)}`);
  push('Bollinger', s.bbUpper != null && s.bbLower != null ? (price > s.bbUpper ? 'SELL' : price < s.bbLower ? 'BUY' : 'NEUTRAL') : 'NEUTRAL', 0.6, 'Preço vs bandas');
  push('Volume', s.volumeRatio == null ? 'NEUTRAL' : s.volumeRatio >= 1.5 ? (out[0]?.signal === 'SELL' ? 'SELL' : 'BUY') : 'NEUTRAL', 0.9, s.volumeRatio == null ? 'Volume indisponível' : `Volume ${s.volumeRatio.toFixed(2)}× média 20`);

  let bullish = 0, bearish = 0, neutral = 0;
  let score = 0, wsum = 0;
  for (const t of out) {
    if (t.signal === 'BUY') bullish++;
    else if (t.signal === 'SELL') bearish++;
    else neutral++;
    score += sig(t.signal) * t.weight;
    wsum += t.weight;
  }
  const norm = wsum ? score / wsum : 0;
  const signal: Signal = norm > 0.15 ? 'BUY' : norm < -0.15 ? 'SELL' : 'NEUTRAL';
  const agreeing = Math.max(bullish, bearish);
  const confidence = Math.round(Math.min(95, Math.max(5, 50 + agreeing * 6 + Math.abs(norm) * 30 - neutral * 3)));
  return { signals: out, summary: { bullish, neutral, bearish }, signal, confidence };
}
