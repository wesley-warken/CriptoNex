import type { Candle } from '@/types';
import { scoreAsset } from '@/engine/scoring';

export interface BacktestResult {
  trades: number;
  wins: number;
  winRate: number;
  avgReturn: number;
  profitFactor: number;
  maxDrawdown: number;
  sampleEnough: boolean;
  returns: number[];
}
// Sem look-ahead: o score do candle i usa apenas candles[0..i].
export function backtest(candles: Candle[], threshold = 80, holdDays = 7): BacktestResult {
  const returns: number[] = [];
  if (candles.length < 60) return { trades: 0, wins: 0, winRate: 0, avgReturn: 0, profitFactor: 0, maxDrawdown: 0, sampleEnough: false, returns };
  for (let i = 50; i < candles.length - holdDays; i++) {
    const window = candles.slice(0, i + 1);
    const s = scoreAsset({ symbol: 'BT', candles: window });
    if (s.score >= threshold) {
      const entry = candles[i].close;
      const exit = candles[i + holdDays].close;
      if (entry > 0) returns.push(((exit - entry) / entry) * 100);
    }
  }
  if (!returns.length) return { trades: 0, wins: 0, winRate: 0, avgReturn: 0, profitFactor: 0, maxDrawdown: 0, sampleEnough: false, returns };
  const wins = returns.filter((r) => r > 0);
  const grossW = wins.reduce((a, b) => a + b, 0);
  const grossL = Math.abs(returns.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
  let peak = 0, trough = 0, maxDd = 0, cum = 0;
  for (const r of returns) {
    cum += r;
    if (cum > peak) { peak = cum; trough = cum; }
    if (cum < trough) trough = cum;
    maxDd = Math.min(maxDd, trough - peak);
  }
  return {
    trades: returns.length,
    wins: wins.length,
    winRate: (wins.length / returns.length) * 100,
    avgReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
    profitFactor: grossL === 0 ? 9.99 : grossW / grossL,
    maxDrawdown: maxDd,
    sampleEnough: returns.length >= 20,
    returns,
  };
}
export function signalForwardStats(candles: Candle[], threshold = 80): { up2d24h: number | null; up5d7d: number | null; n: number } {
  const r1: number[] = [];
  const r7: number[] = [];
  if (candles.length < 60) return { up2d24h: null, up5d7d: null, n: 0 };
  for (let i = 50; i < candles.length - 7; i++) {
    const s = scoreAsset({ symbol: 'S', candles: candles.slice(0, i + 1) });
    if (s.score >= threshold) {
      const e = candles[i].close;
      if (e > 0) {
        r1.push(candles[i + 1].close / e - 1);
        r7.push(candles[i + 7].close / e - 1);
      }
    }
  }
  if (r1.length < 10) return { up2d24h: null, up5d7d: null, n: r1.length };
  return {
    up2d24h: (r1.filter((r) => r >= 0.02).length / r1.length) * 100,
    up5d7d: (r7.filter((r) => r >= 0.05).length / r7.length) * 100,
    n: r1.length,
  };
}
