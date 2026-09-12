import { describe, expect, it } from 'vitest';

export function classifyTrendTone(status: string) {
  const norm = (status || '').trim().toLowerCase();
  if (norm.includes('forte') && (norm.includes('alta') || norm.includes('bull'))) {
    return { tone: 'bull', label: 'Alta Forte', hasDot: true, bg: 'var(--bull-bg)', fg: 'var(--bull-text)' };
  }
  if (norm.includes('alta') || norm.includes('bull')) {
    return { tone: 'bull', label: 'Alta', hasDot: false, bg: 'var(--bull-bg)', fg: 'var(--bull-text)' };
  }
  if (norm.includes('forte') && (norm.includes('baixa') || norm.includes('bear'))) {
    return { tone: 'bear', label: 'Baixa Forte', hasDot: true, bg: 'var(--bear-bg)', fg: 'var(--bear-text)' };
  }
  if (norm.includes('baixa') || norm.includes('bear')) {
    return { tone: 'bear', label: 'Baixa', hasDot: false, bg: 'var(--bear-bg)', fg: 'var(--bear-text)' };
  }
  return { tone: 'neutral', label: 'Neutro', hasDot: false, bg: 'var(--neutral-bg)', fg: 'var(--neutral-text)' };
}

export function classifyRsiTone(rsi: number) {
  if (rsi >= 70) return { zone: 'sobrecomprado', tone: 'bear' };
  if (rsi <= 30) return { zone: 'sobrevendido', tone: 'bull' };
  return { zone: 'neutro', tone: 'neutral' };
}

describe('TrendPill e Sistema de Badges Semânticos do Terminal', () => {
  it('identifica Alta Forte com bull tone e dot ativo', () => {
    const res = classifyTrendTone('Alta Forte');
    expect(res.tone).toBe('bull');
    expect(res.label).toBe('Alta Forte');
    expect(res.hasDot).toBe(true);
    expect(res.bg).toBe('var(--bull-bg)');
  });

  it('identifica Alta normal sem dot obrigatório', () => {
    const res = classifyTrendTone('Alta');
    expect(res.tone).toBe('bull');
    expect(res.label).toBe('Alta');
    expect(res.hasDot).toBe(false);
  });

  it('identifica Baixa Forte com bear tone e dot ativo', () => {
    const res = classifyTrendTone('Baixa Forte');
    expect(res.tone).toBe('bear');
    expect(res.label).toBe('Baixa Forte');
    expect(res.hasDot).toBe(true);
    expect(res.bg).toBe('var(--bear-bg)');
  });

  it('identifica Baixa normal sem dot', () => {
    const res = classifyTrendTone('Baixa');
    expect(res.tone).toBe('bear');
    expect(res.label).toBe('Baixa');
    expect(res.hasDot).toBe(false);
  });

  it('identifica Neutro para estados estáveis ou laterais', () => {
    const res = classifyTrendTone('Neutro');
    expect(res.tone).toBe('neutral');
    expect(res.label).toBe('Neutro');
    expect(res.hasDot).toBe(false);
  });

  it('categoriza zonas de RSI: sobrecomprado, sobrevendido e neutro', () => {
    expect(classifyRsiTone(75)).toMatchObject({ zone: 'sobrecomprado', tone: 'bear' });
    expect(classifyRsiTone(25)).toMatchObject({ zone: 'sobrevendido', tone: 'bull' });
    expect(classifyRsiTone(50)).toMatchObject({ zone: 'neutro', tone: 'neutral' });
  });
});
