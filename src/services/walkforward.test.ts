import { describe, expect, it } from 'vitest';
import { tierHit, tierAvgRR, suggestGates } from './walkforward';
import type { WFStats } from '@/workers/walkforward';

function stats(): WFStats {
  return {
    perTier: {
      ELITE: { n: 100, byHorizon: { 10: { n: 100, wins: 55 }, 20: { n: 100, wins: 40 } }, rrSum: 120, rrN: 100 },
      FORTE: { n: 200, byHorizon: { 10: { n: 200, wins: 110 }, 20: { n: 200, wins: 100 } }, rrSum: 150, rrN: 200 },
      FRACO: { n: 10, byHorizon: { 10: { n: 10, wins: 9 } }, rrSum: 5, rrN: 10 },
    },
    symbols: 5,
    steps: 310,
    horizons: [10, 20],
    stride: 2,
    computedAt: Date.now(),
  };
}

describe('tierHit / tierAvgRR', () => {
  it('retorna hit e n com amostra; null sem amostra', () => {
    expect(tierHit(stats(), 'ELITE', 20)).toEqual({ hit: 0.4, n: 100 });
    expect(tierHit(stats(), 'FRACO', 10)).toBeNull();
    expect(tierHit(stats(), 'INEXISTENTE', 20)).toBeNull();
    expect(tierAvgRR(stats(), 'ELITE')).toEqual({ rr: 1.2, n: 100 });
    expect(tierAvgRR(stats(), 'FRACO')).toBeNull();
  });
});

describe('suggestGates', () => {
  it('sobe gates com hit baixo; mantém com hit bom', () => {
    const g = suggestGates(stats());
    expect(g.eliteMinScore).toBe(80); // 40% < 45%
    expect(g.forteMinScore).toBe(65); // 50% ok
    expect(g.notes.length).toBe(2);
    const good: WFStats = {
      ...stats(),
      perTier: {
        ELITE: { n: 100, byHorizon: { 20: { n: 100, wins: 62 } }, rrSum: 200, rrN: 100 },
        FORTE: { n: 100, byHorizon: { 20: { n: 100, wins: 55 } }, rrSum: 150, rrN: 100 },
      },
    };
    const g2 = suggestGates(good);
    expect(g2).toMatchObject({ eliteMinScore: 75, forteMinScore: 65 });
  });
});
