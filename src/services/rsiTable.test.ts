import { describe, it, expect } from 'vitest';
import { rsiWithAvg } from '@/engine/indicators';
import { rsiBand, sampleEvery } from '@/services/rsiTable';
import type { Candle } from '@/types';

function candlesTrend(n: number, step: number, start = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return { time: i * 3600000, open: c - step / 2, high: c + 0.3, low: c - 0.3, close: c, volume: 1000 };
  });
}

describe('rsi multi-timeframe', () => {
  it('faixas: <30 low, >70 high, resto mid', () => {
    expect(rsiBand(28.3)).toBe('low');
    expect(rsiBand(29.99)).toBe('low');
    expect(rsiBand(30)).toBe('mid');
    expect(rsiBand(52.91)).toBe('mid');
    expect(rsiBand(70)).toBe('mid');
    expect(rsiBand(70.01)).toBe('high');
    expect(rsiBand(null)).toBeNull();
    expect(rsiBand(undefined)).toBeNull();
  });
  it('alta consistente dá RSI alto com AVG próxima', () => {
    const { rsi, avg } = rsiWithAvg(candlesTrend(60, 0.8));
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(60);
    expect(avg).not.toBeNull();
    expect(Math.abs(avg! - rsi!)).toBeLessThan(20);
  });
  it('queda consistente dá RSI baixo', () => {
    const { rsi } = rsiWithAvg(candlesTrend(60, -0.8));
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(40);
  });
  it('poucos candles retornam null sem quebrar', () => {
    expect(rsiWithAvg(candlesTrend(10, 0.5))).toEqual({ rsi: null, avg: null });
  });
  it('reamostragem gera pontos suficientes p/ RSI (365d→~52 semanais, 169h→~42 de 4h)', () => {
    const daily = Array.from({ length: 365 }, (_, i) => 100 + i * 0.5);
    const weekly = sampleEvery(daily, 7);
    expect(weekly.length).toBeGreaterThanOrEqual(30);
    expect(weekly[weekly.length - 1]).toBe(daily[daily.length - 1]);
    const hourly = Array.from({ length: 169 }, (_, i) => 50 + Math.sin(i / 5) * 2 + i * 0.01);
    expect(sampleEvery(hourly, 4).length).toBeGreaterThanOrEqual(30);
  });
});
