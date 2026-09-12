import { describe, expect, it } from 'vitest';
import {
  backtest, equityFromReturns, formatPF, sampleLabel, signalForwardStats,
} from './index';
import type { Candle } from '@/types';

function kl(n: number, close: (i: number) => number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = close(i);
    const wob = Math.sin(i / 3) * Math.abs(c) * 0.002;
    const k = c + wob;
    const spread = Math.abs(k) * 0.004 + 0.1;
    return { time: i * 86400000, open: k - 0.2, high: k + spread, low: k - spread, close: c, volume: 1000 };
  });
}
const rising = (n = 200) => kl(n, (i) => 100 + i * 0.5 + Math.sin(i / 3) * 0.8);
const falling = (n = 200) => kl(n, (i) => 300 - i * 0.5 + Math.sin(i / 3) * 0.8);

describe('equityFromReturns — composição verdadeira', () => {
  it('compõe em vez de somar: -30%,-30% dá DD −51%, não −60', () => {
    const r = equityFromReturns([-30, -30], 1);
    expect(r.maxDrawdown).toBeCloseTo(-51, 6);
    expect(r.totalReturn).toBeCloseTo(-51, 6);
    expect(r.equity).toEqual([1, 0.7, 0.49]);
  });
  it('pico e recuperação: DD medido do pico', () => {
    const r = equityFromReturns([10, 10, -5], 1);
    expect(r.maxDrawdown).toBeCloseTo(((1.1 * 1.1 * 0.95) / (1.1 * 1.1) - 1) * 100, 9);
  });
});

describe('backtest — sem Profit Factor artificial', () => {
  it('só ganhos → PF Infinity (nunca 9.99)', () => {
    const r = backtest(rising(), 0, 7, { feePct: 0, slippagePct: 0, maxPositions: 1000, usePlan: false, validate: false });
    expect(r.trades).toBeGreaterThan(0);
    expect(r.profitFactor).toBe(Infinity);
    expect(formatPF(r.profitFactor, r.trades)).toBe('∞');
  });
  it('sem trades → PF "—" e amostra insuficiente', () => {
    const r = backtest(rising(70), 100, 7, { validate: false });
    expect(r.trades).toBe(0);
    expect(formatPF(r.profitFactor, r.trades)).toBe('—');
    expect(r.sampleEnough).toBe(false);
    expect(r.sampleLabel).toBe('insuficiente');
  });
});

describe('backtest — direcional (short em queda)', () => {
  it('série em queda com threshold 0 lucra vendido (long-only perderia)', () => {
    const r = backtest(falling(), 0, 7, { feePct: 0, slippagePct: 0, maxPositions: 1000, usePlan: false, validate: false });
    expect(r.trades).toBeGreaterThan(0);
    expect(r.avgReturn).toBeGreaterThan(0);
  });
});

describe('backtest — custos honestos', () => {
  it('fee alto reduz o retorno médio vs fee zero', () => {
    const free = backtest(rising(), 0, 7, { feePct: 0, slippagePct: 0, maxPositions: 1000, usePlan: false, validate: false });
    const paid = backtest(rising(), 0, 7, { feePct: 0.01, slippagePct: 0.005, maxPositions: 1000, usePlan: false, validate: false });
    expect(paid.avgReturn).toBeLessThan(free.avgReturn);
    expect(paid.trades).toBe(free.trades);
  });
});

describe('backtest — overlap explícito', () => {
  it('limite de simultâneas com contagem de pulados', () => {
    const r = backtest(rising(), 0, 7, { feePct: 0, slippagePct: 0, maxPositions: 2, usePlan: false, validate: false });
    expect(r.maxSimultaneous).toBeLessThanOrEqual(2);
    expect(r.skippedOverlap).toBeGreaterThan(0);
    expect(r.trades + r.skippedOverlap).toBeGreaterThan(r.trades);
    expect(r.capitalUtilization).toBeGreaterThan(0);
    expect(r.capitalUtilization).toBeLessThanOrEqual(100);
  });
});

describe('backtest — benchmark e estatística completa', () => {
  it('buy&hold + alpha + mediana/mín/máx + N', () => {
    const r = backtest(rising(), 0, 7, { feePct: 0, slippagePct: 0, maxPositions: 1000, usePlan: false, validate: false });
    expect(r.benchmarkReturn).toBeGreaterThan(0);
    expect(Number.isFinite(r.alpha)).toBe(true);
    expect(r.medianReturn).toBeLessThanOrEqual(r.best);
    expect(r.medianReturn).toBeGreaterThanOrEqual(r.worst);
    expect(r.expectancy).toBe(r.avgReturn);
    expect(r.equity[0]).toBe(1);
    expect(r.equity.length).toBe(r.trades + 1);
  });
});

describe('backtest — dados inválidos não contaminam', () => {
  it('candle NaN no meio: pula entradas, conta e não quebra', () => {
    const v = rising();
    v[100] = { ...v[100], close: NaN, high: NaN, low: NaN };
    const r = backtest(v, 0, 7, { feePct: 0, slippagePct: 0, maxPositions: 1000, usePlan: false, validate: true });
    expect(r.skippedInvalid).toBeGreaterThan(0);
    expect(r.dataQuality).not.toBeNull();
    expect(r.dataQuality!.errors.length).toBeGreaterThan(0);
    for (const x of r.returns) expect(Number.isFinite(x)).toBe(true);
  });
});

describe('sampleLabel — honestidade por N', () => {
  it('faixas 20/50/100/300', () => {
    expect(sampleLabel(0)).toBe('insuficiente');
    expect(sampleLabel(19)).toBe('insuficiente');
    expect(sampleLabel(20)).toBe('fraca');
    expect(sampleLabel(49)).toBe('fraca');
    expect(sampleLabel(50)).toBe('moderada');
    expect(sampleLabel(99)).toBe('moderada');
    expect(sampleLabel(100)).toBe('boa');
    expect(sampleLabel(299)).toBe('boa');
    expect(sampleLabel(300)).toBe('forte');
  });
});

describe('signalForwardStats — estendida sem quebrar', () => {
  it('mantém campos antigos e soma mediana/PF/amostra', () => {
    const r = signalForwardStats(rising(300), 50);
    expect(r.n).toBeGreaterThan(0);
    expect(r.up2d24h).not.toBeNull();
    expect(r.median7).toBeLessThanOrEqual(Math.max(...[r.best7 ?? -Infinity]));
    expect(['insuficiente', 'fraca', 'moderada', 'boa', 'forte']).toContain(r.sampleLabel);
  });
});
