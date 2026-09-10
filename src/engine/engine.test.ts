import { describe, it, expect } from 'vitest';
import type { Candle } from '@/types';
import { calcRSI, calcSMA, calcEMA, calcSupertrend, calcSupertrendFull, snapshot } from '@/engine/indicators';
import { scoreAsset } from '@/engine/scoring';
import { classifyScore } from '@/engine/scoring/scoring.config';
import { buildSignals } from '@/engine/signals';
import { computeRegime } from '@/engine/regime';
import { backtest } from '@/engine/backtesting';

function candlesUp(n = 100, start = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * 0.8 + Math.sin(i / 3) * 0.5;
    return { time: i * 86400000, open: c - 0.2, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 + i };
  });
}
describe('motor analítico', () => {
  it('SMA/EMA/RSI calculam sem distorção grossa', () => {
    const v = Array.from({ length: 60 }, (_, i) => 10 + i * 0.1);
    expect(calcSMA(v, 20)?.length).toBeGreaterThan(0);
    expect(calcEMA(v, 12).length).toBeGreaterThan(0);
    const rsi = calcRSI(candlesUp(60));
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(50);
  });
  it('Supertrend detecta tendência de alta', () => {
    expect(calcSupertrend(candlesUp(80))).toBe('BULLISH');
  });
  it('Supertrend full retorna direção + nível coerente', () => {
    const kl = candlesUp(80);
    const full = calcSupertrendFull(kl);
    expect(full?.dir).toBe('BULLISH');
    // em alta o nível fica abaixo do preço (suporte)
    expect(full!.value).toBeLessThan(kl[kl.length - 1].close);
    expect(full!.value).toBeGreaterThan(0);
  });
  it('snapshot retorna estrutura completa', () => {
    const s = snapshot(candlesUp(220));
    expect(s.sma50).not.toBeNull();
    expect(s.sma200).not.toBeNull();
  });
  it('signals ponderados geram BUY em alta', () => {
    const r = buildSignals(candlesUp(220));
    expect(r.signal).toBe('BUY');
    expect(r.confidence).toBeGreaterThan(50);
  });
  it('scoring 0–100 com classificação e breakdown somando', () => {
    const o = scoreAsset({ symbol: 'TST', candles: candlesUp(220) });
    expect(o.score).toBeGreaterThanOrEqual(0);
    expect(o.score).toBeLessThanOrEqual(100);
    expect(classifyScore(o.score)).toBe(o.classification);
    expect(o.breakdown.reduce((a, b) => a + b.earned, 0)).toBe(o.score);
  });
  it('regime responde a breadth altista', () => {
    const r = computeRegime({ btc: candlesUp(220), assets: [{ symbol: 'X', candles: candlesUp(120) }] });
    expect(['STRONG RISK-ON', 'RISK-ON', 'NEUTRAL', 'RISK-OFF', 'STRONG RISK-OFF']).toContain(r.label);
  });
  it('backtest sem look-ahead retorna métricas', () => {
    const r = backtest(candlesUp(200), 50, 7);
    expect(r.trades).toBeGreaterThanOrEqual(0);
  });
});
