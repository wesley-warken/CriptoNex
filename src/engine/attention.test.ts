import { describe, it, expect } from 'vitest';
import { unusualMove } from '@/engine/attention';

function chop(n: number, pct = 1, start = 100): number[] {
  // n barras alternando +pct/-pct (média em módulo = pct)
  const out = [start];
  for (let i = 1; i < n; i++) {
    const d = i % 2 === 1 ? pct : -pct;
    out.push(out[i - 1] * (1 + d / 100));
  }
  return out;
}

describe('movimento atípico (preço, não volume)', () => {
  it('sinaliza valorização ≥2× a média de 10 barras', () => {
    const closes = chop(11, 1);
    const last = closes[closes.length - 1];
    const s = unusualMove([...closes, last * 1.03]);
    expect(s?.unusual).toBe(true);
    expect(s?.dir).toBe('up');
    expect(s?.ratio).toBeGreaterThanOrEqual(2);
    expect(s?.todayPct).toBeCloseTo(3, 1);
  });
  it('sinaliza desvalorização ≥2× a média', () => {
    const closes = chop(11, 1);
    const last = closes[closes.length - 1];
    const s = unusualMove([...closes, last * 0.97]);
    expect(s?.unusual).toBe(true);
    expect(s?.dir).toBe('down');
  });
  it('movimento normal não gera alerta', () => {
    const closes = chop(11, 1);
    const last = closes[closes.length - 1];
    const s = unusualMove([...closes, last * 1.005]);
    expect(s?.unusual).toBe(false);
    expect(s?.ratio).toBeLessThan(2);
  });
  it('poucos dados retornam null sem quebrar', () => {
    expect(unusualMove([100, 101, 102])).toBeNull();
    expect(unusualMove([])).toBeNull();
  });
});
