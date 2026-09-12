import { describe, expect, it } from 'vitest';
import {
  horizonScore, liquidityOf, regimeFit, evidenceLabel, percentileMap,
  buildOpportunities, rankSetups, bestBy, type RankFilters,
} from './rank';
import { HORIZONS } from './horizons';
import type { HorizonFacts } from './types';
import type { OpportunityScore } from '@/types';

function score1d(symbol = 'T'): OpportunityScore {
  return {
    symbol, score: 70, classification: 'Boa', confidence: 65, dataQuality: 70,
    timeframeAlignment: 60, signal: 'BUY', breakdown: [], why: ['✓ base'], risks: [],
    stretchRaw: 2,
  };
}
function facts(symbol: string, over: Partial<HorizonFacts> = {}): HorizonFacts {
  return {
    symbol, name: symbol, price: 100, change7d: 5, marketCap: 5e9, volume24h: 1e8,
    score1d: score1d(symbol),
    rsiD: 58, macdBull: true, volRatio: 1.8, cmfD: null, atrPct: 2, superD: 'BULLISH',
    trendW: 'Alta', trendD: 'Alta', distHigh20Pct: 8,
    plan: {
      ideal: 100, zoneLow: 99, zoneHigh: 100, stop: 95, t1: 105, t2: 110, t3: 115,
      rr1: 1, rr2: 2, rr3: 3, stopPct: -5, basis: 'pivô', scenarios: [],
    },
    dqScore: 90, provider: 'binance', fetchedAt: Date.now(), candles: 250,
    ...over,
  };
}
const ctx = (over: object = {}) => ({
  horizon: '4m' as const, regimeLabel: 'RISK-ON', btcChange7d: 2, gates: undefined, wf: null, confluenceOf: undefined, ...over,
});

describe('horizonScore — limitado e ponderado', () => {
  const F = { trendW: 50, trendD: 50, regime: 50, rs: 50, struct: 50, vol: 50, volat: 50, liq: 50 };
  it('meio-termo dá ~50; extremos dão 0 e 100', () => {
    expect(horizonScore(F, HORIZONS['4m'])).toBeCloseTo(50, 6);
    expect(horizonScore({ trendW: 0, trendD: 0, regime: 0, rs: 0, struct: 0, vol: 0, volat: 0, liq: 0 }, HORIZONS['4m'])).toBe(0);
    expect(horizonScore({ trendW: 100, trendD: 100, regime: 100, rs: 100, struct: 100, vol: 100, volat: 100, liq: 100 }, HORIZONS['4m'])).toBe(100);
  });
});

describe('liquidityOf / regimeFit / evidenceLabel', () => {
  it('liquidez por mcap+volume', () => {
    expect(liquidityOf(5e9, 1e8)).toBe('alta');
    expect(liquidityOf(5e8, 1e7)).toBe('media');
    expect(liquidityOf(1e6, 1e4)).toBe('baixa');
    expect(liquidityOf(null, null)).toBe('baixa');
  });
  it('regime long-only: ON favorável, OFF contra', () => {
    expect(regimeFit('BUY', 'RISK-ON')).toBe('favoravel');
    expect(regimeFit('BUY', 'STRONG RISK-ON')).toBe('favoravel');
    expect(regimeFit('BUY', 'RISK-OFF')).toBe('contra');
    expect(regimeFit('BUY', 'NEUTRAL')).toBe('neutro');
  });
  it('evidência por N (convenção da feature)', () => {
    expect(evidenceLabel(0)).toBe('insuficiente');
    expect(evidenceLabel(29)).toBe('insuficiente');
    expect(evidenceLabel(30)).toBe('limitada');
    expect(evidenceLabel(99)).toBe('limitada');
    expect(evidenceLabel(100)).toBe('moderada');
    expect(evidenceLabel(299)).toBe('moderada');
    expect(evidenceLabel(300)).toBe('forte');
  });
  it('percentileMap ordena e ignora nulos', () => {
    const m = percentileMap(new Map([['a', 10], ['b', 20], ['c', 30]]));
    expect(m.get('a')).toBe(0);
    expect(m.get('c')).toBe(100);
    expect(percentileMap(new Map()).size).toBe(0);
  });
});

describe('buildOpportunities — monta sem inventar', () => {
  it('setup, tier, plano e percentis coerentes', () => {
    const [o] = buildOpportunities([facts('AAA'), facts('BBB', { change7d: -5 })], ctx());
    expect(o.setup).toBe('trend-continuation');
    expect(o.score).toBeGreaterThanOrEqual(0);
    expect(o.score).toBeLessThanOrEqual(100);
    expect(o.t1).toBe(105);
    expect(o.rr1).toBe(1);
    expect(o.evidence).toBeNull(); // sem walk-forward
    expect(o.entryExtended).toBe(false);
    expect(o.trendScore).toBe(75);
  });
  it('sem plano = R:R N/A, sem crash', () => {
    const [o] = buildOpportunities([facts('AAA', { plan: null })], ctx());
    expect(o.rr1).toBeNull();
    expect(o.t1).toBeNull();
    expect(o.stop).toBeNull();
  });
  it('esticado ≥p90 degrada e sinaliza', () => {
    const items = [facts('A', { score1d: score1d('A') }), facts('B', { score1d: { ...score1d('B'), stretchRaw: 50 } })];
    const [a, b] = buildOpportunities(items, ctx());
    expect(b.entryExtended).toBe(true);
    expect(a.entryExtended).toBe(false);
  });
  it('sem demanda comprovada: badge + tier degradado', () => {
    const [o] = buildOpportunities([facts('AAA', { volRatio: 0.5, cmfD: -0.1 })], ctx());
    expect(o.demandPass).toBe(false);
    expect(o.demandNote).toMatch(/volume|fluxo/i);
    expect(['FORTE', 'OBSERVAR', 'EVITAR']).toContain(o.tier);
    const [ok] = buildOpportunities([facts('BBB', { volRatio: 2.2, cmfD: 0.05 })], ctx());
    expect(ok.demandPass).toBe(true);
    expect(ok.demandNote).toBeNull();
  });
  it('evidência mapeada por tier com N real', () => {
    const wf = {
      perTier: { FORTE: { n: 200, byHorizon: { 20: { n: 200, wins: 110 } }, rrSum: 100, rrN: 200 } },
      inSample: {}, outOfSample: {}, isRatio: 0.7, symbols: 10, skippedSymbols: 0,
      steps: 200, horizons: [10, 20], stride: 2, computedAt: 1,
    };
    const [o] = buildOpportunities([facts('AAA')], { ...ctx(), wf: wf as never });
    expect(o.evidence?.n).toBe(200);
    expect(o.evidence?.strength).toBe('moderada');
  });
});

describe('rankSetups — filtros e ordem', () => {
  const F: RankFilters = { setup: 'all', tier: 'all', regimeFit: 'all', minRR: 0, minScore: 0, liquidity: 'all', query: '' };
  it('vazio e unitário', () => {
    expect(rankSetups([], F)).toEqual([]);
    expect(rankSetups(buildOpportunities([facts('AAA')], ctx()), F)).toHaveLength(1);
  });
  it('minRR exclui sem plano; minScore corta; query filtra', () => {
    const items = buildOpportunities([facts('AAA'), facts('BBB', { plan: null })], ctx());
    expect(rankSetups(items, { ...F, minRR: 0.5 }).map((o) => o.symbol)).toEqual(['AAA']);
    expect(rankSetups(items, { ...F, minScore: 101 })).toEqual([]);
    expect(rankSetups(items, { ...F, query: 'bb' }).map((o) => o.symbol)).toEqual(['BBB']);
  });
  it('ordem por score, desempate por confiança', () => {
    const items = buildOpportunities([facts('A'), facts('B', { score1d: { ...score1d('B'), confidence: 90 } })], ctx());
    const [first] = rankSetups(items, F);
    expect(first.symbol).toBe('B');
  });
  it('bestBy ignora nulos', () => {
    const items = buildOpportunities([facts('A', { plan: null }), facts('B')], ctx());
    expect(bestBy(items, (o) => o.rr1)?.symbol).toBe('B');
    expect(bestBy([], (o) => o.rr1)).toBeNull();
  });
});
