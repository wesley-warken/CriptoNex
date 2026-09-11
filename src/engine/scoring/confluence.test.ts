import { describe, expect, it } from 'vitest';
import { tfDirection, confluenceScore, applyConfluence } from './confluence';
import type { Candle, OpportunityScore } from '@/types';

function trend(n: number, from: number, to: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const c = from + ((to - from) * i) / (n - 1);
    out.push({ time: i, open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1000 });
  }
  return out;
}

function base(symbol = 'T', score = 70): OpportunityScore {
  return {
    symbol, score, classification: 'Boa', confidence: 60, dataQuality: 70,
    timeframeAlignment: 60, signal: 'BUY', breakdown: [], why: ['base'], risks: [],
  };
}

describe('tfDirection', () => {
  it('alta consistente → BULLISH; queda → BEARISH; curto → NEUTRAL', () => {
    expect(tfDirection(trend(250, 100, 200))).toBe('BULLISH');
    expect(tfDirection(trend(250, 200, 100))).toBe('BEARISH');
    expect(tfDirection(trend(10, 100, 110))).toBe('NEUTRAL');
  });
});

describe('confluenceScore', () => {
  it('acordo 15, indefinição 5, divergência 0', () => {
    expect(confluenceScore('BULLISH', 'BULLISH')).toBe(15);
    expect(confluenceScore('BEARISH', 'BEARISH')).toBe(15);
    expect(confluenceScore('BULLISH', 'NEUTRAL')).toBe(5);
    expect(confluenceScore('BULLISH', 'BEARISH')).toBe(0);
  });
});

describe('applyConfluence', () => {
  it('soma bônus com teto 100 e registra motivo', () => {
    const r = applyConfluence(base('T', 90), '4h', 'BULLISH', '1d', 'BULLISH');
    expect(r.score).toBe(100);
    expect(r.confluence).toMatchObject({ tfA: '4h', dirB: 'BULLISH', full: true, bonus: 15 });
    expect(r.why.some((w) => w.includes('Confluência'))).toBe(true);
  });
  it('divergência zera bônus e vira risco', () => {
    const r = applyConfluence(base(), '4h', 'BEARISH', '1d', 'BULLISH');
    expect(r.score).toBe(70);
    expect(r.confluence?.full).toBe(false);
    expect(r.risks.some((w) => w.includes('Divergência'))).toBe(true);
  });
});
