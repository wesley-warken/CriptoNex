import { describe, expect, it } from 'vitest';
import { buildSwingPlan, buildInvalidation } from './swingPlan';
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

describe('buildSwingPlan — zona, 3 alvos, R:R', () => {
  it('compra: zona = [entrada−0.5·ATR, entrada], T3 = R3, cenários coerentes', () => {
    const p = buildSwingPlan(rigged(108), 'BUY', 2);
    expect(p).not.toBeNull();
    expect(p!.ideal).toBe(108);
    expect(p!.zoneLow).toBe(107); // 108 − 0.5·2
    expect(p!.zoneHigh).toBe(108);
    expect(p!.stop).toBe(100);
    expect(p!.t1).toBe(110);
    expect(p!.t2).toBe(115);
    expect(p!.t3).toBe(120); // R3 = H + 2·(P−L) = 110 + 2·5
    expect(p!.rr1).toBeCloseTo(0.25, 6);
    expect(p!.rr3).toBeCloseTo(1.5, 6);
    expect(p!.scenarios).toHaveLength(3);
    expect(p!.scenarios[1].pct).toContain('+'); // base positivo
    expect(p!.scenarios[2].pct).toContain('−'); // bear negativo
  });
  it('zona aceita pullback de meio ATR abaixo da entrada', () => {
    const p = buildSwingPlan(rigged(108), 'BUY', 2);
    expect(p?.zoneLow).toBe(107);
    expect(p?.zoneHigh).toBe(108);
  });
  it('stop do lado errado / alvo invertido = null (sem R:R impossível)', () => {
    expect(buildSwingPlan(rigged(112), 'BUY', 2)).toBeNull(); // acima de R1
    expect(buildSwingPlan(rigged(98), 'SELL', 2)).toBeNull(); // abaixo de S1
    expect(buildSwingPlan(rigged(108), 'NEUTRAL', 2)).toBeNull();
    expect(buildSwingPlan(rigged(108).slice(0, 5), 'BUY', 2)).toBeNull();
  });
  it('venda espelha: zona acima, T3 = S3', () => {
    const p = buildSwingPlan(rigged(102), 'SELL', 2);
    expect(p).not.toBeNull();
    expect(p!.zoneLow).toBe(102);
    expect(p!.zoneHigh).toBe(103);
    expect(p!.t3).toBe(90); // S3 = L − 2·(H−P) = 100 − 2·5
  });
});

describe('buildInvalidation — condições reais, não genéricas falsas', () => {
  it('usa stop, regime e RS reais', () => {
    const inv = buildInvalidation({ stop: 168.5, side: 'long', supertrend: 'BULLISH', regimeLabel: 'RISK-OFF', rs7: -3.2, stretchPct: 95 });
    expect(inv.join(' ')).toContain('168.5');
    expect(inv.join(' ')).toContain('RISK-OFF');
    expect(inv.join(' ')).toContain('-3.2');
    expect(inv.some((s) => s.toLowerCase().includes('esticada'))).toBe(true);
  });
  it('sem dados extras, só o stop', () => {
    const inv = buildInvalidation({ stop: 10, side: 'long', supertrend: null, regimeLabel: 'NEUTRAL', rs7: null, stretchPct: null });
    expect(inv).toHaveLength(1);
  });
});
