import { describe, expect, it } from 'vitest';
import { assessDemand, applyDemandGate } from './demand';

describe('assessDemand — sem interesse comprador, sem recomendação', () => {
  it('volume em expansão OU fluxo positivo = pass', () => {
    expect(assessDemand({ volRatio: 2.1, cmf: null }).pass).toBe(true);
    expect(assessDemand({ volRatio: 0.8, cmf: 0.12 }).pass).toBe(true);
  });
  it('sinais presentes e todos negativos = fail com motivo', () => {
    const d = assessDemand({ volRatio: 0.7, cmf: -0.08 });
    expect(d.pass).toBe(false);
    expect(d.known).toBe(true);
    expect(d.reasons.join(' ')).toMatch(/volume|fluxo/i);
  });
  it('sem nenhum sinal = desconhecido (pass neutro, sem fingir)', () => {
    const d = assessDemand({ volRatio: null, cmf: null });
    expect(d.pass).toBe(true);
    expect(d.known).toBe(false);
    expect(d.score).toBe(50);
  });
  it('score = fração de sinais positivos', () => {
    expect(assessDemand({ volRatio: 2, cmf: -0.1 }).score).toBe(50);
    expect(assessDemand({ volRatio: 2, cmf: 0.2 }).score).toBe(100);
    expect(assessDemand({ volRatio: 0.5, cmf: -0.2 }).score).toBe(0);
  });
});

describe('applyDemandGate — degrada um tier sem demanda', () => {
  it('ELITE/FORTE caem um nível; resto mantém', () => {
    expect(applyDemandGate('ELITE', false)).toBe('FORTE');
    expect(applyDemandGate('FORTE', false)).toBe('OBSERVAR');
    expect(applyDemandGate('OBSERVAR', false)).toBe('OBSERVAR');
    expect(applyDemandGate('ELITE', true)).toBe('ELITE');
  });
});
