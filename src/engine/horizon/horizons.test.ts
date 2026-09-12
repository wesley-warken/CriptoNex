import { describe, expect, it } from 'vitest';
import { HORIZONS, DEFAULT_HORIZON, HORIZON_ORDER, type HorizonKey } from './horizons';

describe('horizons — pesos documentados e somando 100', () => {
  it('toda chave tem pesos que somam 100', () => {
    for (const k of HORIZON_ORDER) {
      const w = Object.values(HORIZONS[k].weights) as number[];
      expect(w.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
  it('default é 3–4 meses e diário nunca domina position', () => {
    expect(DEFAULT_HORIZON).toBe('4m');
    const longKeys: HorizonKey[] = ['3m', '4m', '12m'];
    for (const k of longKeys) {
      const w = HORIZONS[k].weights;
      expect(w.trendW).toBeGreaterThanOrEqual(w.trendD);
      expect(w.trendD).toBeLessThanOrEqual(15);
    }
    expect(HORIZONS['7d'].weights.trendD).toBeGreaterThan(HORIZONS['7d'].weights.trendW);
  });
});
