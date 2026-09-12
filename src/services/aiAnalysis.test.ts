import { describe, expect, it } from 'vitest';
import { quotaDay, canSpend, hashPrompt, buildSetupPrompt, buildContextPrompt, AI_SYSTEM, AI_DAILY_CAP } from './aiAnalysis';

describe('cota dura do plano gratuito', () => {
  it('quotaDay em YYYY-MM-DD e canSpend com virada de dia', () => {
    expect(quotaDay(new Date(2026, 8, 12, 10).getTime())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(canSpend(null, '2026-09-12')).toBe(true);
    expect(canSpend({ day: '2026-09-12', count: AI_DAILY_CAP - 1 }, '2026-09-12')).toBe(true);
    expect(canSpend({ day: '2026-09-12', count: AI_DAILY_CAP }, '2026-09-12')).toBe(false);
    expect(canSpend({ day: '2026-09-11', count: AI_DAILY_CAP }, '2026-09-12')).toBe(true);
  });
  it('hash estável e distinto', () => {
    expect(hashPrompt('abc')).toBe(hashPrompt('abc'));
    expect(hashPrompt('abc')).not.toBe(hashPrompt('abd'));
  });
});

describe('prompts só com dados reais + linguagem honesta', () => {
  const setup = {
    symbol: 'SOL', setupLabel: 'Pullback em tendência', horizonLabel: '3–4 meses',
    score: 82, confidence: 71, tier: 'FORTE',
    entryLow: 185, entryHigh: 192, entryIdeal: 190, stop: 168,
    t1: 215, t2: 242, t3: 270, rr1: 2.4, rr2: 3.1, rr3: 4,
    basePct: 21, why: ['Tendência semanal Alta'], risks: ['Volatilidade elevada'],
    regime: 'RISK-ON', evN: 184, evHit: 0.63,
  };
  it('setup carrega números reais e proíbe recomendação', () => {
    const p = buildSetupPrompt(setup);
    for (const n of ['SOL', '185', '168', '215', '2.4', '184', '63']) expect(p).toContain(n);
    expect(p.toLowerCase()).not.toMatch(/compre|recomendo comprar/);
  });
  it('system proíbe probabilidade e recomendação', () => {
    expect(AI_SYSTEM).toMatch(/Nunca recomende/i);
    expect(AI_SYSTEM).toMatch(/probabilidade/i);
  });
  it('contexto carrega valores e pede briefing neutro', () => {
    const p = buildContextPrompt({ btc7d: -3.2, btc30d: 21.7, breadth: 74, regime: 'STRONG RISK-ON', br30d: 5.7, us30d: 2.9 });
    expect(p).toContain('-3.2');
    expect(p).toContain('74');
  });
});
