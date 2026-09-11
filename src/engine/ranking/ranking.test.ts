import { describe, expect, it } from 'vitest';
import {
  rankOpportunities,
  convictionOf,
  clampScoreInput,
  stockSegment,
  partitionStockSegments,
  stretchPercentiles,
  applyStretchGate,
  applyConfluenceGate,
  effectiveTier,
} from './index';
import { exchangeOfYahoo } from '../../services/scanner';
import type { OpportunityScore } from '../../types';

function mk(symbol: string, partial: Partial<OpportunityScore> = {}): OpportunityScore {
  return {
    symbol,
    score: 60,
    classification: 'Neutra',
    confidence: 60,
    dataQuality: 70,
    timeframeAlignment: 60,
    signal: 'BUY',
    breakdown: [],
    why: [],
    risks: [],
    ...partial,
  };
}

// ELITE: BUY + score≥75 + conf≥65 + DQ≥60
const elite = (s: string) => mk(s, { score: 82, confidence: 70, dataQuality: 65, signal: 'BUY' });
const forte = (s: string) => mk(s, { score: 68, confidence: 58, dataQuality: 60, signal: 'BUY' });
const observar = (s: string) => mk(s, { score: 55, confidence: 50, dataQuality: 60, signal: 'NEUTRAL' });
const evitar = (s: string) => mk(s, { score: 40, confidence: 60, dataQuality: 70, signal: 'SELL' });

describe('Fase 0 — invariante de contadores', () => {
  it('pill "Todas" == Σ tiers == título do Ranking (sem filtros extras)', () => {
    const items = [elite('A'), elite('B'), forte('C'), observar('D'), observar('E'), evitar('F')];
    // Mesma derivação da página: baseRanked → tierCounts → ranked sem extras
    const baseRanked = rankOpportunities(items, { minScore: 0, minConfidence: 0, signal: 'ALL' });
    const counts = { ELITE: 0, FORTE: 0, OBSERVAR: 0, EVITAR: 0 } as Record<string, number>;
    for (const o of baseRanked) counts[convictionOf(o)] += 1;
    const pillTodas = baseRanked.length;
    const somaTiers = counts.ELITE + counts.FORTE + counts.OBSERVAR + counts.EVITAR;
    const tituloRanking = [...baseRanked].sort((a, b) => b.score - a.score).length;
    expect(pillTodas).toBe(6);
    expect(somaTiers).toBe(pillTodas);
    expect(tituloRanking).toBe(pillTodas);
    expect(counts).toEqual({ ELITE: 2, FORTE: 1, OBSERVAR: 2, EVITAR: 1 });
  });
});

describe('rankOpportunities — filtros nulos', () => {
  const items = [mk('A', { score: 10 }), mk('B', { score: 90 })];
  it('minScore 0 inclui tudo (igual a undefined)', () => {
    expect(rankOpportunities(items, { minScore: 0 })).toHaveLength(2);
    expect(rankOpportunities(items, {})).toHaveLength(2);
  });
  it('minScore 100 filtra de verdade', () => {
    expect(rankOpportunities(items, { minScore: 100 })).toHaveLength(0);
  });
  it('minConfidence 0 inclui tudo', () => {
    expect(rankOpportunities(items, { minConfidence: 0 })).toHaveLength(2);
  });
  it('minRR filtra por plan.rr1; sem plano sai quando minRR > 0', () => {
    const withPlan = [
      mk('A', { score: 70, plan: { entry: 100, stop: 95, target1: 110, target2: 115, rr1: 2, rr2: 3, stopPct: -5, basis: 'pivô' } }),
      mk('B', { score: 70, plan: null }),
    ];
    expect(rankOpportunities(withPlan, { minRR: 0 })).toHaveLength(2);
    expect(rankOpportunities(withPlan, { minRR: 1.5 }).map((o) => o.symbol)).toEqual(['A']);
    expect(rankOpportunities(withPlan, { minRR: 5 })).toHaveLength(0);
  });
});

describe('clampScoreInput', () => {
  it('limita 0–100 e arredonda; NaN vira 0', () => {
    expect(clampScoreInput(-5)).toBe(0);
    expect(clampScoreInput(150)).toBe(100);
    expect(clampScoreInput(62.7)).toBe(63);
    expect(clampScoreInput(60)).toBe(60);
    expect(clampScoreInput(NaN)).toBe(0);
  });
});

describe('exchangeOfYahoo (score sob demanda)', () => {
  it('*.SA → B3; resto → string vazia', () => {
    expect(exchangeOfYahoo('PETR4.SA')).toBe('B3');
    expect(exchangeOfYahoo('petr4.sa')).toBe('B3');
    expect(exchangeOfYahoo('AAPL')).toBe('');
    expect(exchangeOfYahoo('VWRA.L')).toBe('');
  });
});

describe('stockSegment / partitionStockSegments', () => {
  const b3 = new Set(['PETR4', 'VALE3']);
  const us = new Set(['AAPL', 'MSFT']);
  it('universo tem prioridade sobre sufixo', () => {
    expect(stockSegment('PETR4', 'PETR4.SA', b3, us)).toBe('B3');
    expect(stockSegment('AAPL', 'AAPL', b3, us)).toBe('US');
  });
  it('fora do universo, deriva do Yahoo', () => {
    expect(stockSegment('TAEE11', 'TAEE11.SA', b3, us)).toBe('B3');
    expect(stockSegment('NVDA', 'NVDA', b3, us)).toBe('US');
    expect(stockSegment('VWRA', 'VWRA.L', b3, us)).toBe('GLOBAL');
    expect(stockSegment('BVSP', '^BVSP', b3, us)).toBe('GLOBAL');
    expect(stockSegment('X', '', b3, us)).toBe('GLOBAL');
  });
  it('Σ(B3+US+GLOBAL) == total; universo sem GLOBAL', () => {    const items = [
      { symbol: 'PETR4', yahoo: 'PETR4.SA' },
      { symbol: 'VALE3', yahoo: 'VALE3.SA' },
      { symbol: 'AAPL', yahoo: 'AAPL' },
      { symbol: 'MSFT', yahoo: 'MSFT' },
      { symbol: 'TAEE11', yahoo: 'TAEE11.SA' },
      { symbol: 'VWRA', yahoo: 'VWRA.L' },
    ];
    const p = partitionStockSegments(items, b3, us);
    expect(p.B3.length + p.US.length + p.GLOBAL.length).toBe(items.length);
    expect(p).toEqual({
      B3: ['PETR4', 'VALE3', 'TAEE11'],
      US: ['AAPL', 'MSFT'],
      GLOBAL: ['VWRA'],
    });
    // Só universo → GLOBAL vazio ⇒ Σ(B3+US) == total do header
    const uni = partitionStockSegments(items.slice(0, 4), b3, us);
    expect(uni.GLOBAL).toHaveLength(0);
    expect(uni.B3.length + uni.US.length).toBe(4);
  });
});

describe('Fase 1 — stretch percentil e gate', () => {
  it('percentil 0–100 ordenado pelo desvio', () => {
    const m = stretchPercentiles([
      { symbol: 'A', stretchRaw: -5 },
      { symbol: 'B', stretchRaw: 0 },
      { symbol: 'C', stretchRaw: 5 },
      { symbol: 'D', stretchRaw: 15 },
      { symbol: 'E', stretchRaw: null },
    ]);
    expect(m.get('A')).toBe(0);
    expect(m.get('D')).toBe(100);
    expect(m.get('B')).toBeCloseTo(33.33, 1);
    expect(m.has('E')).toBe(false);
  });
  it('ELITE/FORTE esticado (≥p90) degrada 1 tier', () => {
    expect(applyStretchGate('ELITE', 95)).toBe('FORTE');
    expect(applyStretchGate('FORTE', 90)).toBe('OBSERVAR');
    expect(applyStretchGate('ELITE', 89.9)).toBe('ELITE');
    expect(applyStretchGate('ELITE', null)).toBe('ELITE');
    expect(applyStretchGate('OBSERVAR', 99)).toBe('OBSERVAR');
  });
});

describe('Fase 2 — gate de confluência', () => {
  const fullBull = { tfA: '4h', dirA: 'BULLISH', tfB: '1d', dirB: 'BULLISH', full: true, bonus: 15 } as const;
  const diverg = { tfA: '4h', dirA: 'BEARISH', tfB: '1d', dirB: 'BULLISH', full: false, bonus: 0 } as const;
  it('ELITE sem confluência → FORTE (só pós-stage 2)', () => {
    expect(applyConfluenceGate('ELITE', 'BUY', null)).toBe('FORTE');
    expect(applyConfluenceGate('ELITE', 'BUY', undefined)).toBe('FORTE');
    expect(applyConfluenceGate('FORTE', 'BUY', null)).toBe('FORTE');
  });
  it('ELITE exige acordo total com o sinal', () => {
    expect(applyConfluenceGate('ELITE', 'BUY', { ...fullBull })).toBe('ELITE');
    expect(applyConfluenceGate('ELITE', 'BUY', { ...diverg })).toBe('FORTE');
  });
  it('FORTE com 1d oposto → OBSERVAR', () => {
    expect(
      applyConfluenceGate('FORTE', 'BUY', { tfA: '4h', dirA: 'BULLISH', tfB: '1d', dirB: 'BEARISH', full: false, bonus: 0 }),
    ).toBe('OBSERVAR');
    expect(applyConfluenceGate('FORTE', 'BUY', { ...fullBull })).toBe('FORTE');
  });
  it('effectiveTier compõe base → stretch → confluência', () => {
    const o = elite('A');
    expect(effectiveTier(o, {})).toBe('FORTE'); // sem confluência, ELITE capa
    expect(effectiveTier(o, { stretchPct: 95 })).toBe('FORTE'); // stretch não piora além do cap
    expect(effectiveTier({ ...o, confluence: { ...fullBull } }, {})).toBe('ELITE');
    expect(effectiveTier({ ...o, confluence: { ...fullBull } }, { stretchPct: 95 })).toBe('FORTE');
  });
});
