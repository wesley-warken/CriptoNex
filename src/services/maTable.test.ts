import { describe, it, expect } from 'vitest';
import { computeMaSet, maCrossDiff, maCrossTitle, slowsFor } from '@/services/maTable';

function rising(n: number, step = 0.5, start = 100): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}
function falling(n: number, step = 0.5, start = 200): number[] {
  return Array.from({ length: n }, (_, i) => start - i * step);
}

describe('cruzamentos de médias', () => {
  it('monta o set com todas as médias', () => {
    const s = computeMaSet(rising(250));
    expect(s?.sma[200]).not.toBeNull();
    expect(s?.ema[9]).not.toBeNull();
    expect(computeMaSet(rising(100))).toBeNull();
  });
  it('alta: rápida acima da lenta; queda: abaixo', () => {
    const up = computeMaSet(rising(250))!;
    expect(maCrossDiff(up, 'EMA', 9, 26)).toBeGreaterThan(0);
    expect(maCrossDiff(up, 'SMA', 9, 200)).toBeGreaterThan(0);
    expect(maCrossDiff(up, 'EMA', 'price', 26)).toBeGreaterThan(0);
    const dn = computeMaSet(falling(250))!;
    expect(maCrossDiff(dn, 'EMA', 9, 26)).toBeLessThan(0);
    expect(maCrossDiff(dn, 'SMA', 'price', 200)).toBeLessThan(0);
  });
  it('sem dados retorna null sem quebrar', () => {
    expect(maCrossDiff(null, 'EMA', 9, 26)).toBeNull();
  });
  it('títulos e lentas no padrão da referência', () => {
    expect(maCrossTitle('EMA', 9, 12)).toBe('EMA 9 cruzando EMA 12');
    expect(maCrossTitle('EMA', 'price', 26)).toBe('Preço cruzando EMA 26');
    expect(slowsFor(9)).toEqual([12, 26, 50, 100, 200]);
    expect(slowsFor(50)).toEqual([12, 26, 100, 200]);
  });
});
