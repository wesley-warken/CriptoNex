import { describe, expect, it } from 'vitest';
import {
  all, any, classifyRegime, qualityOf, thesisDirection,
} from './entities';
import {
  activeFilterCount, applyPreset, decodeFilters, encodeFilters, facetCounts,
  filterAndRank, filterSetups, DEFAULT_FILTERS, type FilterState,
} from './filters';
import { breadthTone, buildMarketPulse } from './pulse';
import type { Setup } from './entities';

function setup(over: Partial<Setup> = {}): Setup {
  return {
    symbol: 'BTC', name: 'Bitcoin', price: 100, horizon: '4m',
    setup: 'trend-continuation', setupReasons: [],
    score: 75, confidence: 70, tier: 'FORTE',
    entryIdeal: 100, entryLow: 98, entryHigh: 102, entryDistPct: 0, entryExtended: false,
    stop: 90, t1: 110, t2: 120, t3: null,
    rr1: 2, rr2: 3, rr3: null, stopPct: -10, basePct: 20,
    scenarios: [], invalidation: [], why: [], risks: [],
    regime: 'STRONG RISK-ON', regimeFit: 'favoravel',
    rs7: 1, stretchPct: 50, demandPass: true, demandNote: null,
    trendScore: 80, volumeRatio: 1.6, atrPct: 3, liquidity: 'alta',
    dqScore: 80, provider: 'x', updatedAt: 1, candles: 200, fresh: true,
    evidence: null, confFull: false, confLabel: null, signal: 'BUY',
    ...over,
  } as Setup;
}

describe('entities', () => {
  it('qualityOf respeita os cortes 70/80', () => {
    expect(qualityOf(80)).toBe('elite');
    expect(qualityOf(79)).toBe('forte');
    expect(qualityOf(70)).toBe('forte');
    expect(qualityOf(69)).toBe('base');
  });

  it('classifyRegime lê o rótulo', () => {
    expect(classifyRegime('STRONG RISK-ON')).toBe('on');
    expect(classifyRegime('RISK-OFF')).toBe('off');
    expect(classifyRegime('NEUTRO')).toBe('flat');
  });

  it('thesisDirection combina vento e demanda', () => {
    expect(thesisDirection(setup())).toBe('aligned');
    expect(thesisDirection(setup({ demandPass: false }))).toBe('neutral');
    expect(thesisDirection(setup({ regimeFit: 'contra' }))).toBe('against');
    expect(thesisDirection(setup({ regimeFit: 'neutro', demandPass: true }))).toBe('neutral');
  });

  it('all/any compõem predicados', () => {
    const t = () => true;
    const f = () => false;
    expect(all(t, t)(setup())).toBe(true);
    expect(all(t, f)(setup())).toBe(false);
    expect(any(f, t)(setup())).toBe(true);
    expect(any(f, f)(setup())).toBe(false);
  });
});

describe('filters', () => {
  const pool = [
    setup({ symbol: 'AAA', score: 85, rr1: 3, regimeFit: 'favoravel', liquidity: 'alta', setup: 'trend-continuation' }),
    setup({ symbol: 'BBB', score: 72, rr1: 2.2, regimeFit: 'favoravel', liquidity: 'media', setup: 'pullback' }),
    setup({ symbol: 'CCC', score: 65, rr1: 1.5, regimeFit: 'neutro', liquidity: 'alta', setup: 'momentum' }),
    setup({ symbol: 'DDD', score: 55, rr1: 4, regimeFit: 'favoravel', liquidity: 'alta', setup: 'breakout' }),
    setup({ symbol: 'EEE', score: 90, rr1: 1.2, regimeFit: 'contra', liquidity: 'baixa', setup: 'reversal', demandPass: false }),
  ];

  it('piso 60 no Todos e alinhamento ON por padrão', () => {
    const out = filterSetups(pool, DEFAULT_FILTERS).map((o) => o.symbol);
    expect(out).toEqual(['AAA', 'BBB']);
  });

  it('qualidade forte = 70+ e elite = 80+', () => {
    expect(filterSetups(pool, { ...DEFAULT_FILTERS, regimeAligned: false, quality: 'forte' }).map((o) => o.symbol))
      .toEqual(['AAA', 'BBB', 'EEE']);
    expect(filterSetups(pool, { ...DEFAULT_FILTERS, regimeAligned: false, quality: 'elite' }).map((o) => o.symbol))
      .toEqual(['AAA', 'EEE']);
  });

  it('R:R mínimo corta pelo alvo 1', () => {
    const out = filterSetups(pool, { ...DEFAULT_FILTERS, regimeAligned: false, minRR: 2.5 }).map((o) => o.symbol);
    expect(out).toEqual(['AAA']);
  });

  it('busca casa símbolo e nome, sem case', () => {
    const named = [...pool, setup({ symbol: 'XYZ', name: 'Solana Dreams', score: 95 })];
    expect(filterSetups(named, { ...DEFAULT_FILTERS, query: 'sol' }).map((o) => o.symbol)).toEqual(['XYZ']);
    expect(filterSetups(named, { ...DEFAULT_FILTERS, query: '  AA ' }).map((o) => o.symbol)).toEqual(['AAA']);
  });

  it('ordenação por score, R:R e confiança', () => {
    const f: FilterState = { ...DEFAULT_FILTERS, regimeAligned: false };
    expect(filterAndRank(pool, f).map((o) => o.symbol)[0]).toBe('EEE');
    // DDD tem o maior R:R mas cai no piso 60: top R:R entre os válidos é AAA
    expect(filterAndRank(pool, { ...f, sort: 'rr' }).map((o) => o.symbol)[0]).toBe('AAA');
    const byConf = [
      setup({ symbol: 'X', score: 70, confidence: 90 }),
      setup({ symbol: 'Y', score: 70, confidence: 60 }),
    ];
    expect(filterAndRank(byConf, { ...DEFAULT_FILTERS, regimeAligned: false, sort: 'conf' }).map((o) => o.symbol))
      .toEqual(['X', 'Y']);
  });

  it('presets aplicam o pacote inteiro', () => {
    expect(applyPreset(DEFAULT_FILTERS, 'elite')).toMatchObject({ quality: 'elite', minRR: 2, regimeAligned: true });
    expect(applyPreset(DEFAULT_FILTERS, 'conservador')).toMatchObject({ quality: 'forte', minRR: 2.5, liquidity: 'alta' });
    expect(applyPreset(DEFAULT_FILTERS, 'agressivo')).toMatchObject({ quality: 'all', minRR: 0, regimeAligned: false });
  });

  it('conta dimensões ativas para o badge do funil', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, query: 'btc', minRR: 2, regimeAligned: false })).toBe(3);
  });

  it('facetas ignoram a própria dimensão', () => {
    // Base: piso 60 + alinhado ON → válidos AAA e BBB
    const facets = facetCounts(pool, DEFAULT_FILTERS);
    expect(facets.quality).toEqual({ all: 2, forte: 2, elite: 1 });
    expect(facets.minRR).toEqual({ 0: 2, 2: 2, 2.5: 1, 3: 1 });
    expect(facets.setup['trend-continuation']).toBe(1);
    expect(facets.setup.pullback).toBe(1);
    expect(facets.setup.momentum).toBe(0);
    expect(facets.liquidity).toEqual({ all: 2, alta: 1, media: 1 });
  });

  it('facetas respeitam as outras dimensões ativas', () => {
    const facets = facetCounts(pool, { ...DEFAULT_FILTERS, quality: 'elite' });
    // Com elite travado, o resto conta dentro dele: só AAA passa no alinhamento
    expect(facets.minRR[0]).toBe(1);
    expect(facets.liquidity.alta).toBe(1);
  });

  it('codec URL faz roundtrip e tolera lixo', () => {
    const f: FilterState = {
      ...DEFAULT_FILTERS, query: 'sol', sort: 'rr', quality: 'forte',
      minRR: 2.5, regimeAligned: false, setup: 'pullback', liquidity: 'media',
    };
    expect(decodeFilters(encodeFilters(f))).toEqual(f);
    expect(decodeFilters('')).toEqual(DEFAULT_FILTERS);
    expect(decodeFilters('?sort=nope&rr=99&qual=nope')).toEqual(DEFAULT_FILTERS);
    expect(encodeFilters(DEFAULT_FILTERS)).toBe('');
  });
});

describe('pulse', () => {
  it('breadthTone usa os cortes 45/55', () => {
    expect(breadthTone(73)).toBe('alta');
    expect(breadthTone(40)).toBe('baixa');
    expect(breadthTone(50)).toBe('neutra');
  });

  it('buildMarketPulse deriva direção e tom, nulo sem input', () => {
    expect(buildMarketPulse(null)).toBeNull();
    const p = buildMarketPulse({
      btc: { ret7d: -3.2, ret30d: 21.8, trend30: 'Alta' },
      br: { ret7d: 4.2, ret30d: 5.7, trend30: 'Neutra' },
      us: { ret7d: 0.3, ret30d: 2.9, trend30: 'Neutra' },
      breadth: 73,
      regimeLabel: 'STRONG RISK-ON',
    });
    expect(p?.btc.up7d).toBe(false);
    expect(p?.btc.up30d).toBe(true);
    expect(p?.breadthTone).toBe('alta');
    expect(p?.regimeTone).toBe('on');
  });
});
