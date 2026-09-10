import { describe, it, expect } from 'vitest';
import { classifyTrend, coinTrend, coinTrendFromCloses, coinTrendFromLegs, coinTrendIntraday, legChange, shiftLabel, TREND_LEVEL } from '@/engine/trend';

describe('tendência multi-timeframe', () => {
  it('classifica estados no diário', () => {
    expect(classifyTrend(8, 1)).toBe('Alta Forte');
    expect(classifyTrend(2, 1)).toBe('Alta');
    expect(classifyTrend(0.5, 1)).toBe('Neutro');
    expect(classifyTrend(-2, 1)).toBe('Baixa');
    expect(classifyTrend(-9, 1)).toBe('Baixa Forte');
    expect(classifyTrend(null, 1)).toBeNull();
  });
  it('escala limites com √t (1h tolera menos que 30d)', () => {
    // +2% é forte em 1h, mas +1% é neutro em 30d
    expect(classifyTrend(2, 1 / 24)).toBe('Alta Forte');
    expect(classifyTrend(1, 30)).toBe('Neutro');
  });
  it('monta cadeia 1h→24h→7d→30d com deltas', () => {
    const t = coinTrend({ change1h: 0.1, change24h: 6, change7d: -15, change30d: 40 });
    expect(t.curto).toBe('Alta Forte');
    expect(t.medio).toBe('Baixa Forte');
    expect(t.longo).toBe('Alta Forte');
    expect(t.mudCurto?.delta).toBeGreaterThan(0);
    expect(t.mudMedio?.delta).toBeLessThan(0);
    expect(t.mudLongo?.delta).toBeGreaterThan(0);
  });
  it('sem dados retorna null sem quebrar', () => {
    const t = coinTrend({});
    expect(t.curto).toBeNull();
    expect(t.mudCurto).toBeNull();
  });
  it('níveis ordenam do mais baixista ao mais altista', () => {
    expect(TREND_LEVEL['Baixa Forte']).toBeLessThan(TREND_LEVEL['Neutro']);
    expect(TREND_LEVEL['Neutro']).toBeLessThan(TREND_LEVEL['Alta Forte']);
    expect(shiftLabel('Alta Forte')).toBe('Alta forte');
  });
  it('legChange mede a variação nos últimos N candles', () => {
    expect(legChange([100, 110], 1)).toBeCloseTo(10, 6);
    expect(legChange([100, 90], 1)).toBeCloseTo(-10, 6);
    expect(legChange([100, 105, 110, 121], 3)).toBeCloseTo(21, 6);
    expect(legChange([100], 1)).toBeNull();
    expect(legChange([], 5)).toBeNull();
  });
  it('fromLegs monta a cadeia a partir de elos explícitos', () => {
    const t = coinTrendFromLegs([0.1, -6, 10, 40], [1 / 24, 1, 7, 30]);
    expect(t.curto).toBe('Baixa Forte');
    expect(t.medio).toBe('Alta');
    expect(t.longo).toBe('Alta Forte');
    expect(t.mudCurto).toEqual({ from: 'Neutro', to: 'Baixa Forte', delta: -2 });
  });
  it('fromCloses exige histórico mínimo e classifica no 1h', () => {
    // 200 closes horários em alta forte: +0,6% por hora
    const closes = Array.from({ length: 200 }, (_, i) => 100 * Math.pow(1.006, i));
    const t = coinTrendFromCloses(closes, '1h');
    expect(t?.curto).toBe('Alta Forte');
    expect(t?.medio).toBe('Alta Forte');
    expect(t?.longo).toBe('Alta Forte');
    expect(t?.mudLongo?.delta).toBeGreaterThanOrEqual(0);
    expect(coinTrendFromCloses(closes.slice(0, 100), '1h')).toBeNull();
    expect(coinTrendFromCloses(closes.slice(0, 100), '4h')).toBeNull();
  });
  it('intraday via spark: 1h usa elos 1h→4h→24h→7d sem fetch', () => {
    // spark de 168h caindo -0,2%/h, mas dia/semana no verde (campos do universo)
    const hourly = Array.from({ length: 168 }, (_, i) => 100 * Math.pow(0.998, i));
    const t = coinTrendIntraday(hourly, { d: 5, w: 8, m: -20 }, '1h');
    expect(t?.curto).toBe('Baixa'); // 4h ≈ -0,8%
    expect(t?.medio).toBe('Alta Forte'); // 24h = +5%
    expect(t?.longo).toBe('Alta'); // 7d = +8%
    expect(t?.mudMedio?.delta).toBeGreaterThan(0);
  });
  it('intraday 4h usa 4h→24h→7d→30d e exige pouco spark', () => {
    const hourly = Array.from({ length: 30 }, (_, i) => 100 + i * 0.1);
    const t = coinTrendIntraday(hourly, { d: 0.2, w: 0.5, m: 40 }, '4h');
    expect(t?.longo).toBe('Alta Forte');
    expect(coinTrendIntraday([100, 101], { d: 1, w: 1, m: 1 }, '4h')).toBeNull();
    expect(coinTrendIntraday(undefined, { d: 1, w: 1, m: 1 }, '1h')).toBeNull();
  });
});
