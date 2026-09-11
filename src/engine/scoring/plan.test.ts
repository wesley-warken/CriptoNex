import { describe, expect, it } from 'vitest';
import { buildPlan } from './plan';
import type { Candle } from '@/types';

function candle(o: Partial<Candle> & { close: number }): Candle {
  const { time = 1, open = o.close, high = o.close, low = o.close, volume = 1000, close } = o;
  return { time, open, high, low, close, volume };
}

/** 30 candles: 5 fechados de referência (idx 24–28) com H=110, L=100, C=105. */
function rigged(lastClose: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 24; i++) out.push(candle({ time: i, close: 100 + (i % 5) }));
  out.push(candle({ time: 24, high: 110, low: 100, close: 102 }));
  out.push(candle({ time: 25, high: 110, low: 100, close: 104 }));
  out.push(candle({ time: 26, high: 110, low: 100, close: 103 }));
  out.push(candle({ time: 27, high: 110, low: 100, close: 106 }));
  out.push(candle({ time: 28, high: 110, low: 100, close: 105 }));
  out.push(candle({ time: 29, high: lastClose + 1, low: lastClose - 1, close: lastClose }));
  return out;
}

describe('buildPlan — pivôs conhecidos (H=110, L=100, C=105)', () => {
  it('compra: stop no menor entre S1 e preço−1.5·ATR, R:R correto', () => {
    const p = buildPlan(rigged(108), 'BUY', 2);
    expect(p).not.toBeNull();
    expect(p!.entry).toBe(108);
    expect(p!.stop).toBe(100); // min(S1=100, 108−3)
    expect(p!.target1).toBe(110); // R1
    expect(p!.target2).toBe(115); // R2
    expect(p!.rr1).toBeCloseTo(0.25, 6);
    expect(p!.rr2).toBeCloseTo(0.875, 6);
    expect(p!.stopPct).toBeCloseTo(-7.407, 2);
    expect(p!.basis).toBe('pivô semanal');
  });
  it('venda: stop no maior entre R1 e preço+1.5·ATR', () => {
    const p = buildPlan(rigged(102), 'SELL', 2);
    expect(p).not.toBeNull();
    expect(p!.stop).toBe(110); // max(R1=110, 102+3)
    expect(p!.target1).toBe(100); // S1
    expect(p!.rr1).toBeCloseTo(0.25, 6);
  });
  it('sem ATR: usa S1/R1 puros', () => {
    const p = buildPlan(rigged(108), 'BUY', null);
    expect(p?.stop).toBe(100);
    expect(p?.rr1).toBeCloseTo(0.25, 6);
  });
  it('compra já acima de R1 → sem plano (perseguição)', () => {
    expect(buildPlan(rigged(112), 'BUY', 2)).toBeNull();
  });
  it('venda já abaixo de S1 → sem plano', () => {
    expect(buildPlan(rigged(98), 'SELL', 2)).toBeNull();
  });
  it('sinal neutro ou amostra curta → sem plano', () => {
    expect(buildPlan(rigged(108), 'NEUTRAL', 2)).toBeNull();
    expect(buildPlan(rigged(108).slice(0, 5), 'BUY', 2)).toBeNull();
  });
});
