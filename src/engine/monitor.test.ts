import { describe, it, expect } from 'vitest';
import {
  buildMonData, diffEdgeEvents, evalCondition, evalConditionState, evalFilter, evalFilterState,
  planMonitorData, PRESET_FILTERS, selectTopByMcap, validateCondition,
  validateFilter, whyFilter,
  type MonData, type MonFilter,
} from '@/engine/monitor';
import type { Candle } from '@/types';
import type { UniverseCoin } from '@/services/universeTypes';

function candlesFromCloses(closes: number[], tfMs = 86400000): Candle[] {
  return closes.map((c, i) => ({ time: i * tfMs, open: c, high: c * 1.001, low: c * 0.999, close: c, volume: 1000 }));
}
function rising(n: number, step = 0.4, start = 100): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}
const coin = (symbol: string, extra: Partial<UniverseCoin> = {}): UniverseCoin => ({
  id: symbol.toLowerCase(), symbol, name: symbol, price: 100, marketCap: 1e9, volume24h: 1e6,
  change1h: 0.2, change24h: 6, change7d: 10, change30d: 25, change1y: 100, ...extra,
});

describe('monitor', () => {
  it('filtros prontos têm condições válidas', () => {
    expect(PRESET_FILTERS.length).toBeGreaterThanOrEqual(8);
    for (const f of PRESET_FILTERS) {
      expect(f.conditions.length).toBeGreaterThan(0);
      expect(f.name.length).toBeGreaterThan(0);
    }
  });
  it('pullback em alta: tendência alta + RSI 4h sobrevendido', () => {
    const f = PRESET_FILTERS.find((x) => x.id === 'pullback-alta')!;
    // 200 closes horários em queda forte → RSI 4h? aqui testamos o resolver no diário
    const d: MonData = {
      symbol: 'T', trend: { '1d': { curto: 'Alta Forte', medio: 'Alta', longo: 'Alta', mudCurto: null, mudMedio: null, mudLongo: null }, '1h': null, '4h': null },
      rsi: { '1h': 20, '4h': 25, '1d': 45, '1w': 50 },
      stochK: { '1h': null, '4h': null, '1d': null, '1w': null },
      stochD: { '1h': null, '4h': null, '1d': null, '1w': null },
      macd: { '1h': null, '4h': null, '1d': 1, '1w': null },
      super: { '1h': null, '4h': null, '1d': 'BULLISH', '1w': null },
      attRatio: 1, attToday: 1, ma: null,
      srDistSup: { '1h': null, '4h': null, '1d': 10, '1w': null },
      srDistRes: { '1h': null, '4h': null, '1d': 10, '1w': null },
    };
    expect(evalFilter(d, f)).toBe(true);
    expect(evalCondition(d, { indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 })).toBe(false);
  });
  it('supertrend resolve Alta=1 / Baixa=0', () => {
    const d: MonData = {
      symbol: 'T', trend: { '1d': null, '1h': null, '4h': null },
      rsi: { '1h': null, '4h': null, '1d': null, '1w': null },
      stochK: { '1h': null, '4h': null, '1d': null, '1w': null },
      stochD: { '1h': null, '4h': null, '1d': null, '1w': null },
      macd: { '1h': null, '4h': null, '1d': null, '1w': null },
      super: { '1h': null, '4h': 'BULLISH', '1d': 'BEARISH', '1w': null },
      attRatio: null, attToday: null, ma: null,
      srDistSup: { '1h': null, '4h': null, '1d': null, '1w': null },
      srDistRes: { '1h': null, '4h': null, '1d': null, '1w': null },
    };
    expect(evalCondition(d, { indicator: 'super', tf: '4h', field: 'dir', op: 'eq', value: 1 })).toBe(true);
    expect(evalCondition(d, { indicator: 'super', tf: '1d', field: 'dir', op: 'eq', value: 1 })).toBe(false);
  });
  it('buildMonData monta tudo com klines sintéticos em alta', () => {
    const c = coin('TST');
    const d = buildMonData(c, {
      '1h': candlesFromCloses(rising(200, 0.05), 3600000),
      '4h': candlesFromCloses(rising(200, 0.2), 4 * 3600000),
      '1d': candlesFromCloses(rising(250, 0.4)),
      '1w': candlesFromCloses(rising(60, 2), 7 * 86400000),
    });
    expect(d.rsi['1d']).not.toBeNull();
    expect(d.rsi['1d']!).toBeGreaterThan(50);
    expect(d.trend['1d']?.curto).toBe('Alta');
    expect(d.super['1d']).toBe('BULLISH');
    expect(d.ma).not.toBeNull();
    const gold: MonFilter = { id: 'g', name: 'G', icon: '✅', color: 'green', conditions: [{ indicator: 'ma', tf: '1d', field: 'ema9_26', op: 'gt', value: 0 }] };
    expect(evalFilter(d, gold)).toBe(true);
  });
  it('sem dados nada casa (sem falsos positivos)', () => {
    const d: MonData = {
      symbol: 'X', trend: { '1d': null, '1h': null, '4h': null },
      rsi: { '1h': null, '4h': null, '1d': null, '1w': null },
      stochK: { '1h': null, '4h': null, '1d': null, '1w': null },
      stochD: { '1h': null, '4h': null, '1d': null, '1w': null },
      macd: { '1h': null, '4h': null, '1d': null, '1w': null },
      super: { '1h': null, '4h': null, '1d': null, '1w': null },
      attRatio: null, attToday: null, ma: null,
      srDistSup: { '1h': null, '4h': null, '1d': null, '1w': null },
      srDistRes: { '1h': null, '4h': null, '1d': null, '1w': null },
    };
    for (const f of PRESET_FILTERS) expect(evalFilter(d, f)).toBe(false);
    expect(evalFilter(d, { id: 'e', name: 'E', icon: '', color: 'blue', conditions: [] })).toBe(false);
  });
  it('plano de dados: só busca o que os filtros exigem', () => {
    // Padrões: médias (golden/death) + diário + sem semanal + range 4h/1d (super/stoch)
    expect(planMonitorData(PRESET_FILTERS)).toEqual({ daily: 'ma', weekly: false, rangeTf: ['1d', '4h'], rsiTf: ['4h', '1d'] });
    // Só tendência/4h: nada de rede, nada de range — mas RSI 4h exige real
    expect(planMonitorData([{
      id: 't', name: 'T', icon: '', color: 'blue',
      conditions: [
        { indicator: 'trend', tf: '1d', field: 'curto', op: 'gte', value: 3 },
        { indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 },
      ],
    }])).toEqual({ daily: 'none', weekly: false, rangeTf: [], rsiTf: ['4h'] });
    // RSI diário sem médias: diário leve, sem range, real para o RSI
    expect(planMonitorData([{
      id: 'r', name: 'R', icon: '', color: 'blue',
      conditions: [{ indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 }],
    }])).toEqual({ daily: 'kl', weekly: false, rangeTf: [], rsiTf: ['1d'] });
    // Condição semanal liga o fetch 1s + real para o RSI
    expect(planMonitorData([{
      id: 'w', name: 'W', icon: '', color: 'blue',
      conditions: [{ indicator: 'rsi', tf: '1w', field: 'value', op: 'gte', value: 70 }],
    }])).toEqual({ daily: 'none', weekly: true, rangeTf: [], rsiTf: ['1w'] });
  });
  it('S/R: aproximando da resistência e rompimento', () => {
    // 30 dias subindo 0.3 + pullback leve de 1%: a 3-4% da máxima de 20
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(100 + i * 0.3);
    for (let i = 0; i < 2; i++) closes.push(closes[closes.length - 1] * 0.995);
    const c = coin('SR');
    const d = buildMonData(c, {
      '1h': null, '4h': null, '1d': candlesFromCloses(closes), '1w': null,
    });
    expect(d.srDistRes['1d']).not.toBeNull();
    expect(d.srDistRes['1d']!).toBeLessThanOrEqual(5);
    expect(d.srDistRes['1d']!).toBeGreaterThan(0);
    const aprox = PRESET_FILTERS.find((x) => x.id === 'prox-resistencia')!;
    expect(evalFilter(d, aprox)).toBe(true);
    const romp = PRESET_FILTERS.find((x) => x.id === 'rompimento-resistencia')!;
    expect(evalFilter(d, romp)).toBe(false);
  });
  it('S/R: rompimento acima da máxima de 20', () => {
    const closes: number[] = [];
    for (let i = 0; i < 25; i++) closes.push(100 + Math.sin(i) * 0.5);
    closes.push(120); // estouro
    const c = coin('BRK');
    const d = buildMonData(c, {
      '1h': null, '4h': null, '1d': candlesFromCloses(closes), '1w': null,
    });
    expect(d.srDistRes['1d']!).toBeLessThanOrEqual(0);
    expect(evalFilter(d, PRESET_FILTERS.find((x) => x.id === 'rompimento-resistencia')!)).toBe(true);
  });
  it('porquê: mostra valor atual e alvo de cada condição', () => {
    const d: MonData = {
      symbol: 'T', trend: { '1d': { curto: 'Alta', medio: 'Alta', longo: 'Alta', mudCurto: null, mudMedio: null, mudLongo: null }, '1h': null, '4h': null },
      rsi: { '1h': 20, '4h': 25, '1d': 45, '1w': 50 },
      stochK: { '1h': null, '4h': null, '1d': null, '1w': null },
      stochD: { '1h': null, '4h': null, '1d': null, '1w': null },
      macd: { '1h': null, '4h': null, '1d': 1, '1w': null },
      super: { '1h': null, '4h': null, '1d': 'BEARISH', '1w': null },
      attRatio: 1, attToday: 1, ma: null,
      srDistSup: { '1h': null, '4h': null, '1d': 1.5, '1w': null },
      srDistRes: { '1h': null, '4h': null, '1d': 10, '1w': null },
    };
    const f = PRESET_FILTERS.find((x) => x.id === 'sobrecomprado-resistencia')!;
    const why = whyFilter(d, f);
    expect(why).toContain('45');
    expect(why).toContain('≥ 70');
    expect(why).toContain('10');
    const pull = PRESET_FILTERS.find((x) => x.id === 'pullback-alta')!;
    const whyPull = whyFilter(d, pull);
    expect(whyPull).toContain('Alta');
    expect(whyPull).toContain('25');
    expect(whyPull).toContain('≤ 30');
  });
  it('plano de dados: S/R diário pede klines, S/R 4h é grátis (spark)', () => {
    expect(planMonitorData([{
      id: 's', name: 'S', icon: '', color: 'blue',
      conditions: [{ indicator: 'sr', tf: '1d', field: 'distRes', op: 'lte', value: 5 }],
    }])).toEqual({ daily: 'kl', weekly: false, rangeTf: [], rsiTf: [] });
    expect(planMonitorData([{
      id: 's', name: 'S', icon: '', color: 'blue',
      conditions: [{ indicator: 'sr', tf: '4h', field: 'distRes', op: 'lte', value: 5 }],
    }])).toEqual({ daily: 'none', weekly: false, rangeTf: [], rsiTf: [] });
  });
  it('terminologia: EMA9/26 não se chama Golden/Death Cross (regressão P16)', () => {
    const gc = PRESET_FILTERS.find((x) => x.id === 'golden-cross')!;
    const dc = PRESET_FILTERS.find((x) => x.id === 'death-cross')!;
    expect(gc.name).not.toMatch(/golden cross/i);
    expect(dc.name).not.toMatch(/death cross/i);
    expect(gc.name).toMatch(/EMA 9\/26/);
    expect(dc.name).toMatch(/EMA 9\/26/);
    // ids preservados p/ compatibilidade com filtros salvos
    expect(gc.id).toBe('golden-cross');
    expect(dc.id).toBe('death-cross');
  });
});

describe('monitor tri-state (dado ausente ≠ false)', () => {
  const empty: MonData = {
    symbol: 'X', trend: { '1d': null, '1h': null, '4h': null },
    rsi: { '1h': null, '4h': null, '1d': null, '1w': null },
    stochK: { '1h': null, '4h': null, '1d': null, '1w': null },
    stochD: { '1h': null, '4h': null, '1d': null, '1w': null },
    macd: { '1h': null, '4h': null, '1d': null, '1w': null },
    super: { '1h': null, '4h': null, '1d': null, '1w': null },
    attRatio: null, attToday: null, ma: null,
    srDistSup: { '1h': null, '4h': null, '1d': null, '1w': null },
    srDistRes: { '1h': null, '4h': null, '1d': null, '1w': null },
  };
  const rsiCond = { indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 } as const;
  it('sem dados: unknown (e o booleano legado continua false)', () => {
    expect(evalConditionState(empty, { ...rsiCond })).toBe('unknown');
    expect(evalFilterState(empty, PRESET_FILTERS[1])).toBe('unknown');
    expect(evalCondition(empty, { ...rsiCond })).toBe(false);
    expect(evalFilter(empty, PRESET_FILTERS[1])).toBe(false);
  });
  it('false domina unknown no AND', () => {
    const d: MonData = {
      ...empty,
      rsi: { '1h': null, '4h': null, '1d': 80, '1w': null },
      macd: { '1h': null, '4h': null, '1d': null, '1w': null },
    };
    const f: MonFilter = {
      id: 'x', name: 'X', icon: '', color: 'blue',
      conditions: [
        { indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 },
        { indicator: 'macd', tf: '1d', field: 'hist', op: 'lt', value: 0 },
      ],
    };
    expect(evalFilterState(d, f)).toBe('inactive');
  });
});

describe('bordas inativo→ativo (diffEdgeEvents)', () => {
  it('só borda vira evento; saída limpa o ativo sem evento', () => {
    const r1 = diffEdgeEvents({}, [
      { key: 'f:A', filterId: 'f', symbol: 'A', state: 'active' },
    ], 1000);
    expect(r1.events).toHaveLength(1);
    expect(r1.events[0].ts).toBe(1000);
    const r2 = diffEdgeEvents(r1.active, [
      { key: 'f:A', filterId: 'f', symbol: 'A', state: 'inactive' },
    ], 2000);
    expect(r2.events).toHaveLength(0);
    expect(r2.active).toEqual({});
    expect(r2.changed).toBe(true);
  });
});

describe('matriz indicador × timeframe', () => {
  it('trend+1w, attention+4h e ma+1w são inválidos com motivo', () => {
    expect(validateCondition({ indicator: 'trend', tf: '1w', field: 'curto', op: 'gte', value: 3 })).toMatch(/semanal|1w|vale/i);
    expect(validateCondition({ indicator: 'attention', tf: '4h', field: 'ratio', op: 'gte', value: 2 })).toMatch(/1d/);
    expect(validateCondition({ indicator: 'ma', tf: '1w', field: 'ema9_26', op: 'gt', value: 0 })).toMatch(/1d/);
    expect(validateFilter({
      id: 'v', name: 'V', icon: '', color: 'blue',
      conditions: [{ indicator: 'trend', tf: '1w', field: 'curto', op: 'gte', value: 3 }],
    })).toHaveLength(1);
  });
  it('combos válidas passam (rsi+1w, super+4h, sr+1h)', () => {
    expect(validateCondition({ indicator: 'rsi', tf: '1w', field: 'value', op: 'gte', value: 70 })).toBeNull();
    expect(validateCondition({ indicator: 'super', tf: '4h', field: 'dir', op: 'eq', value: 1 })).toBeNull();
    expect(validateFilter(PRESET_FILTERS.find((x) => x.id === 'pullback-alta')!)).toEqual([]);
  });
});

describe('universo Top N por market cap (selectTopByMcap)', () => {
  const mk = (symbol: string, marketCap: number, rank?: number) => ({
    id: symbol.toLowerCase(), symbol, name: symbol, price: 1, marketCap,
    volume24h: 1, change1h: 0, change24h: 0, change7d: 0, change30d: 0, change1y: 0,
    ...(rank != null ? { rank } : {}),
  });
  it('ordem visual embaralhada não muda o pelotão', () => {
    const coins = [mk('C', 30, 3), mk('A', 10, 1), mk('B', 20, 2), mk('D', 5, 4)];
    const top2 = selectTopByMcap(coins as never, 2, 100).map((c) => c.symbol).sort();
    expect(top2).toEqual(['A', 'B']);
  });
  it('sem rank oficial: ordena por marketCap', () => {
    const coins = [mk('C', 30), mk('A', 10), mk('B', 20)];
    expect(selectTopByMcap(coins as never, 2, 100).map((c) => c.symbol).sort()).toEqual(['B', 'C']);
  });
  it('sem market cap: vazio (chamador pausa com aviso)', () => {
    expect(selectTopByMcap([mk('A', 0)] as never, 100, 100)).toEqual([]);
    expect(selectTopByMcap([] as never, 100, 100)).toEqual([]);
  });
});

describe('buildMonData com range real × sintético', () => {
  const synth = (n: number, step: number, start = 100, tfMs = 3600000): Candle[] =>
    Array.from({ length: n }, (_, i) => {
      const c = start + i * step;
      return { time: i * tfMs, open: c, high: c * 1.0005, low: c * 0.9995, close: c, volume: 0 };
    });
  const c = {
    id: 'tst', symbol: 'TST', name: 'TST', price: 100, marketCap: 1e9, volume24h: 1e6,
    change1h: 0, change24h: 1, change7d: 2, change30d: 3, change1y: 4,
  } as never;
  it('sem range real: stoch/super null, RSI funciona, trend sem voto-Stoch', () => {
    const d = buildMonData(c, {
      '1h': synth(200, 0.05), '4h': synth(200, 0.2, 100, 4 * 3600000),
      '1d': synth(250, 0.4), '1w': synth(60, 2, 100, 7 * 86400000),
    }, {});
    expect(d.rsi['4h']).not.toBeNull();
    expect(d.stochK['4h']).toBeNull();
    expect(d.super['4h']).toBeNull();
    expect(d.trend['4h']).not.toBeNull();
  });
  it('legado (sem 3º arg): stoch/super calculam como antes', () => {
    const d = buildMonData(c, {
      '1h': synth(200, 0.05), '4h': synth(200, 0.2, 100, 4 * 3600000),
      '1d': synth(250, 0.4), '1w': synth(60, 2, 100, 7 * 86400000),
    });
    expect(d.super['1d']).toBe('BULLISH');
    expect(d.stochK['4h']).not.toBeNull();
  });
  it('warmup Wilder: RSI nulo com 60 barras, presente com 150', () => {
    const short = buildMonData(c, {
      '1h': null, '4h': synth(60, 0.2, 100, 4 * 3600000), '1d': null, '1w': null,
    }, {});
    expect(short.rsi['4h']).toBeNull();
    const full = buildMonData(c, {
      '1h': null, '4h': synth(150, 0.2, 100, 4 * 3600000), '1d': null, '1w': null,
    }, {});
    expect(full.rsi['4h']).not.toBeNull();
  });
});
