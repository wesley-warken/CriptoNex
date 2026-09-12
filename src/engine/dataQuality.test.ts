import { describe, expect, it } from 'vitest';
import { validateCandles, tfAgeStatus, PROVIDER_RELIABILITY } from './dataQuality';
import type { Candle } from '@/types';

const H = 3600_000;
const D = 24 * H;
function kl(n: number, start = 100, step = D, t0 = D * 1000): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i;
    return { time: t0 + i * step, open: c - 0.5, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 };
  });
}

describe('validateCandles — série limpa', () => {
  it('score alto sem erros nem warnings', () => {
    const now = D * 1000 + 199 * D + 3600_000;
    const r = validateCandles(kl(200), { provider: 'binance', fetchedAt: now - 60_000, timeframe: '1d', market: 'crypto', minCandles: 60 }, now);
    expect(r.errors).toHaveLength(0);
    expect(r.gaps).toBe(0);
    expect(r.duplicates).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.provider).toBe('binance');
  });
});

describe('validateCandles — integridade', () => {
  it('detecta high<low, close fora do range, preço<=0 e volume negativo', () => {
    const bad = kl(70);
    bad[10] = { ...bad[10], high: 5, low: 50 }; // high<low
    bad[11] = { ...bad[11], close: bad[11].high + 99 }; // close fora
    bad[12] = { ...bad[12], close: 0 }; // preço inválido
    bad[13] = { ...bad[13], volume: -3 }; // volume inválido
    const r = validateCandles(bad, { minCandles: 60 });
    expect(r.integrity).toBeLessThan(100);
    expect(r.errors.join(' ').toLowerCase()).toContain('high<low');
    expect(r.invalid.length).toBeGreaterThanOrEqual(4);
  });
  it('detecta duplicatas, desordem e gaps', () => {
    const v = kl(70);
    v[20] = { ...v[19] }; // duplicata de timestamp
    const r1 = validateCandles(v, { timeframe: '1d', market: 'crypto' });
    expect(r1.duplicates).toBe(1);
    const gapped = [...kl(40), ...kl(30, 200, D, D * 1000 + 40 * D + 5 * D)];
    const r2 = validateCandles(gapped, { timeframe: '1d', market: 'crypto' });
    expect(r2.gaps).toBeGreaterThanOrEqual(1);
    const reversed = [...kl(70)].reverse();
    const r3 = validateCandles(reversed, {});
    expect(r3.errors.join(' ').toLowerCase()).toContain('ordem');
  });
  it('ações ignoram gap de fim de semana; crypto não', () => {
    // sexta 2026-09-11 → segunda 2026-09-14 (3 dias)
    const fri = Date.UTC(2026, 8, 11);
    const mon = Date.UTC(2026, 8, 14);
    const mk = (t: number, c: number): Candle => ({ time: t, open: c, high: c + 1, low: c - 1, close: c, volume: 10 });
    const series = [mk(fri - D, 10), mk(fri, 11), mk(mon, 12), mk(mon + D, 13)];
    const rs = validateCandles(series, { timeframe: '1d', market: 'stock' });
    const rc = validateCandles(series, { timeframe: '1d', market: 'crypto' });
    expect(rs.gaps).toBe(0);
    expect(rc.gaps).toBe(1);
  });
  it('amostra insuficiente penaliza completeness com motivo', () => {
    const r = validateCandles(kl(10), { minCandles: 60 });
    expect(r.completeness).toBeLessThan(100);
    expect(r.warnings.join(' ').toLowerCase()).toContain('insuficiente');
  });
});

describe('tfAgeStatus + freshness', () => {
  const now = 1_000_000_000_000;
  it('fresh/stale/invalid por timeframe', () => {
    expect(tfAgeStatus('1d', now - 3600_000, now)).toBe('fresh');
    expect(tfAgeStatus('1d', now - 40 * H, now)).toBe('stale');
    expect(tfAgeStatus('1h', now - 60 * 60_000, now)).toBe('stale');
    expect(tfAgeStatus('1h', now - 5 * 60_000, now)).toBe('fresh');
    expect(tfAgeStatus('1d', 0, now)).toBe('invalid');
    expect(tfAgeStatus('1d', NaN, now)).toBe('invalid');
    expect(tfAgeStatus('1d', now + 10 * 60_000, now)).toBe('invalid'); // futuro
  });
  it('PROVIDER_RELIABILITY cobre provedores conhecidos', () => {
    for (const p of ['binance', 'yahoo', 'coingecko', 'brapi']) expect(PROVIDER_RELIABILITY[p]).toBeGreaterThan(0);
    const r = validateCandles(kl(70), { provider: 'fonte-x' });
    expect(r.sourceReliability).toBe(50);
  });
});
