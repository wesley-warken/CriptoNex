import { describe, expect, it } from 'vitest';
import { classifySetup, SETUP_LABELS, type SetupInput } from './setups';

const base: SetupInput = {
  trendW: 'Alta', trendD: 'Alta', rsiD: 58, macdBull: true,
  volRatio: 1.8, atrPct: 2, stretchPct: 40, distHigh20Pct: 8,
};

describe('classifySetup — 4 setups robustos + observação', () => {
  it('tendência + RSI saudável = trend-continuation', () => {
    const r = classifySetup({ ...base, trendW: 'Alta Forte', trendD: 'Alta' });
    expect(r.kind).toBe('trend-continuation');
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it('semanal forte + diário em desconto = pullback', () => {
    const r = classifySetup({ ...base, trendW: 'Alta Forte', trendD: 'Neutro', rsiD: 42 });
    expect(r.kind).toBe('pullback');
  });
  it('colado na máxima + volume = breakout', () => {
    const r = classifySetup({ ...base, trendD: 'Alta', rsiD: 72, distHigh20Pct: 1.2, volRatio: 2.2 });
    expect(r.kind).toBe('breakout');
  });
  it('RSI alto + MACD + volume = momentum', () => {
    const r = classifySetup({ ...base, trendW: 'Neutro', trendD: 'Neutro', rsiD: 66 });
    expect(r.kind).toBe('momentum');
  });
  it('semanal fraca + diário forte com fôlego = reversal', () => {
    const r = classifySetup({ ...base, trendW: 'Baixa', trendD: 'Alta', rsiD: 48, stretchPct: 30, volRatio: 1.3 });
    expect(r.kind).toBe('reversal');
  });
  it('reversal sem volume vira observação', () => {
    const r = classifySetup({ ...base, trendW: 'Baixa', trendD: 'Alta', rsiD: 48, stretchPct: 30, volRatio: 0.8 });
    expect(r.kind).toBe('watch');
  });
  it('esticado (≥p90) bloqueia continuation e pullback', () => {
    expect(classifySetup({ ...base, stretchPct: 95 }).kind).not.toBe('trend-continuation');
    expect(classifySetup({ ...base, trendD: 'Neutro', rsiD: 42, stretchPct: 95 }).kind).not.toBe('pullback');
  });
  it('tudo nulo = observação, sem throw', () => {
    const r = classifySetup({
      trendW: null, trendD: null, rsiD: null, macdBull: null,
      volRatio: null, atrPct: null, stretchPct: null, distHigh20Pct: null,
    });
    expect(r.kind).toBe('watch');
  });
  it('labels PT-BR para os 4 + observação', () => {
    expect(SETUP_LABELS['trend-continuation']).toBe('Tendência (continuação)');
    expect(SETUP_LABELS.pullback).toBe('Pullback em tendência');
    expect(SETUP_LABELS.breakout).toBe('Rompimento');
    expect(SETUP_LABELS.momentum).toBe('Momentum');
    expect(SETUP_LABELS.watch).toBe('Observação');
  });
});
