import { describe, it, expect } from 'vitest';
import {
  buildMonData, evalCondition, evalFilter, planMonitorData, PRESET_FILTERS, whyFilter,
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
    // Padrões: médias (golden/death) + diário + sem semanal
    expect(planMonitorData(PRESET_FILTERS)).toEqual({ daily: 'ma', weekly: false });
    // Só tendência/4h: nada de rede
    expect(planMonitorData([{
      id: 't', name: 'T', icon: '', color: 'blue',
      conditions: [
        { indicator: 'trend', tf: '1d', field: 'curto', op: 'gte', value: 3 },
        { indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 },
      ],
    }])).toEqual({ daily: 'none', weekly: false });
    // RSI diário sem médias: diário leve
    expect(planMonitorData([{
      id: 'r', name: 'R', icon: '', color: 'blue',
      conditions: [{ indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 }],
    }])).toEqual({ daily: 'kl', weekly: false });
    // Condição semanal liga o fetch 1s
    expect(planMonitorData([{
      id: 'w', name: 'W', icon: '', color: 'blue',
      conditions: [{ indicator: 'rsi', tf: '1w', field: 'value', op: 'gte', value: 70 }],
    }])).toEqual({ daily: 'none', weekly: true });
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
    }])).toEqual({ daily: 'kl', weekly: false });
    expect(planMonitorData([{
      id: 's', name: 'S', icon: '', color: 'blue',
      conditions: [{ indicator: 'sr', tf: '4h', field: 'distRes', op: 'lte', value: 5 }],
    }])).toEqual({ daily: 'none', weekly: false });
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
