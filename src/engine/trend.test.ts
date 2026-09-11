import { describe, it, expect } from 'vitest';
import {
  classifyTrend, coinTrend, coinTrendMultiTF, consensusOf, shiftLabel,
  TREND_LEVEL, type TrendOhlc,
} from '@/engine/trend';

const rise = (n: number, step = 0.006, start = 100): number[] =>
  Array.from({ length: n }, (_, i) => start * Math.pow(1 + step, i));
const fall = (n: number, step = 0.006, start = 200): number[] =>
  Array.from({ length: n }, (_, i) => start * Math.pow(1 - step, i));
// Stablecoin: ruído de ±0,02% em torno de 1
const flat = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => 1 + (i % 2 === 1 ? 0.0002 : -0.0002));
const ohlcOf = (closes: number[]): TrendOhlc => ({
  closes,
  highs: closes.map((c) => c * 1.005),
  lows: closes.map((c) => c * 0.995),
});
const multiRise = (): Record<'1h' | '4h' | '1d' | '1w', TrendOhlc | null> => ({
  '1h': ohlcOf(rise(120)),
  '4h': ohlcOf(rise(120)),
  '1d': ohlcOf(rise(200)),
  '1w': ohlcOf(rise(90)),
});

describe('consenso de indicadores (receita: RSI60/40, MACD, SMA50±1%, EMA20±0,5%, Stoch K×D)', () => {
  it('alta consistente vira Alta Forte nas 3 pernas (1d)', () => {
    const t = coinTrendMultiTF(multiRise(), '1d');
    expect(t?.curto).toBe('Alta Forte');
    expect(t?.medio).toBe('Alta Forte');
    expect(t?.longo).toBe('Alta Forte');
    expect(t?.mudCurto?.delta).toBe(0);
    expect(t?.mudMedio?.delta).toBe(0);
    expect(t?.mudLongo?.delta).toBe(0);
  });
  it('queda consistente vira Baixa Forte', () => {
    const t = coinTrendMultiTF(
      { '1h': null, '4h': ohlcOf(fall(120)), '1d': ohlcOf(fall(200)), '1w': ohlcOf(fall(90)) }, '1d',
    );
    expect(t?.curto).toBe('Baixa Forte');
    expect(t?.longo).toBe('Baixa Forte');
  });
  it('stablecoin travada vira Neutro (sem consenso, sem chute)', () => {
    const { closes, highs, lows } = ohlcOf(flat(200));
    // Nota honesta: a referência mostra "Alta Forte" p/ USDT (receita proprietária);
    // sem eleitores concordando, Neutro — nunca direção forjada, nunca vazio.
    expect(consensusOf(closes, highs, lows)).toBe('Neutro');
    const t = coinTrendMultiTF(
      { '1h': null, '4h': ohlcOf(flat(120)), '1d': ohlcOf(flat(200)), '1w': ohlcOf(flat(90)) }, '1d',
    )!;
    expect(t.curto).toBe('Neutro');
    expect(t.medio).toBe('Neutro');
    expect(t.mudCurto?.delta).toBe(0);
  });
  it('multi-TF: pernas em timeframes distintos diferenciam de verdade', () => {
    // Curto (4h) em queda livre + médio/diário e longo/semanal em alta:
    // o pullback vira o curto e segura o resto — assinatura da referência
    const shortFall = ohlcOf(fall(60, 0.01, 150));
    const t = coinTrendMultiTF(
      { '1h': null, '4h': shortFall, '1d': ohlcOf(rise(200)), '1w': ohlcOf(rise(90)) }, '1d',
    )!;
    expect(t.curto).toBe('Baixa Forte');
    expect(t.medio).toBe('Alta Forte');
    expect(t.longo).toBe('Alta Forte');
    expect(t.mudCurto?.to).toBe(t.curto);
    expect(t.mudLongo?.to).toBe(t.longo);
  });
  it('mudança é temporal (candle anterior → atual), não entre pernas', () => {
    // 59 em alta + 1 queda de -15% no 4h: curto Alta Forte → Baixa Forte, longo mantém
    const base = rise(59, 0.006);
    const last = base[base.length - 1];
    const shortCrash = ohlcOf([...base, last * 0.85]);
    const t = coinTrendMultiTF(
      { '1h': null, '4h': shortCrash, '1d': ohlcOf(rise(200)), '1w': ohlcOf(rise(90)) }, '1d',
    )!;
    expect(t.curto).toBe('Baixa Forte');
    expect(t.mudCurto?.from).toBe('Alta Forte');
    expect(t.mudCurto?.to).toBe('Baixa Forte');
    expect(t.mudCurto?.delta).toBe(-4);
    expect(t.mudLongo?.delta).toBe(0);
  });
  it('sem perna suficiente retorna null (sem dado, sem chute)', () => {
    expect(coinTrendMultiTF({ '1h': null, '4h': null, '1d': null, '1w': null }, '1d')).toBeNull();
    expect(coinTrendMultiTF({ '1h': null, '4h': ohlcOf(rise(10)), '1d': null, '1w': null }, '1d')).toBeNull();
  });
});

describe('cold-start legado (% com escala √t)', () => {
  it('classifica estados no diário', () => {
    expect(classifyTrend(8, 1)).toBe('Alta Forte');
    expect(classifyTrend(2, 1)).toBe('Alta');
    expect(classifyTrend(0.5, 1)).toBe('Neutro');
    expect(classifyTrend(-2, 1)).toBe('Baixa');
    expect(classifyTrend(-9, 1)).toBe('Baixa Forte');
    expect(classifyTrend(null, 1)).toBeNull();
  });
  it('monta cadeia 1h→24h→7d→30d', () => {
    const t = coinTrend({ change1h: 0.1, change24h: 6, change7d: -15, change30d: 40 });
    expect(t.curto).toBe('Alta Forte');
    expect(t.medio).toBe('Baixa Forte');
    expect(t.longo).toBe('Alta Forte');
    expect(t.mudCurto?.delta).toBeGreaterThan(0);
    expect(t.mudMedio?.delta).toBeLessThan(0);
    expect(t.mudLongo?.delta).toBeGreaterThan(0);
  });
  it('níveis ordenam do mais baixista ao mais altista', () => {
    expect(TREND_LEVEL['Baixa Forte']).toBeLessThan(TREND_LEVEL['Neutro']);
    expect(TREND_LEVEL['Neutro']).toBeLessThan(TREND_LEVEL['Alta Forte']);
    expect(shiftLabel('Alta Forte')).toBe('Alta forte');
  });
});
