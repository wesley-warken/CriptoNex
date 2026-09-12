import { describe, expect, it } from 'vitest';
import {
  dayKeyInTz, todayBrt, inBriefWindow, btcCorrMode, pct48h,
  computeDivergences, pickElites, composeBriefInput, type UsQuotes,
} from './morningBrief';
import type { Setup } from '@/setups/domain/entities';

describe('fuso e janela do brief (BRT)', () => {
  it('dayKeyInTz e todayBrt em pt-BR', () => {
    const ts = Date.parse('2026-09-12T10:30:00-03:00');
    expect(dayKeyInTz(ts, 'America/Sao_Paulo')).toBe('2026-09-12');
    expect(todayBrt(ts)).toBe('12/09/2026');
  });
  it('janela 10:00–11:00 BRT', () => {
    expect(inBriefWindow(Date.parse('2026-09-12T10:00:00-03:00'))).toBe(true);
    expect(inBriefWindow(Date.parse('2026-09-12T10:30:00-03:00'))).toBe(true);
    expect(inBriefWindow(Date.parse('2026-09-12T09:59:00-03:00'))).toBe(false);
    expect(inBriefWindow(Date.parse('2026-09-12T11:00:00-03:00'))).toBe(false);
  });
});

describe('correlação 48h BTC vs S&P', () => {
  it('sinais opostos = desacoplado; mesmo sinal = segue', () => {
    expect(btcCorrMode(0.2, 2.0)).toBe('desacoplado');
    expect(btcCorrMode(1.5, 3.0)).toBe('segue');
    expect(btcCorrMode(-1.0, -2.0)).toBe('segue');
    expect(btcCorrMode(null, 2.0)).toBe(null);
    expect(btcCorrMode(0.01, 0.01)).toBe('segue');
  });
  it('pct48h usa 2 sessões atrás e rejeita série curta', () => {
    expect(pct48h([100, 101, 102])).toBeCloseTo(2, 6);
    expect(pct48h([100, 101])).toBe(null);
    expect(pct48h([])).toBe(null);
  });
});

describe('divergências determinísticas', () => {
  it('VIX↑ + SPX↑, amplitude>80 em risk-on, repique contra risk-off', () => {
    expect(computeDivergences({ spxChg: 0.8, vixChg: 2.5, regime: 'RISK-ON', breadth: 60 })).toHaveLength(1);
    expect(computeDivergences({ spxChg: 0.8, vixChg: -1, regime: 'RISK-ON', breadth: 85 })[0]).toMatch(/Amplitude/);
    expect(computeDivergences({ spxChg: 1.5, vixChg: -1, regime: 'STRONG RISK-OFF', breadth: 20 })[0]).toMatch(/repique/);
    expect(computeDivergences({ spxChg: 0.5, vixChg: -2, regime: 'RISK-ON', breadth: 60 })).toEqual([]);
  });
});

describe('elites 80+ (puro)', () => {
  const opps = [
    { symbol: 'NVDA', score: 84, rr1: 2.6 },
    { symbol: 'META', score: 81, rr1: 2.2 },
    { symbol: 'TSLA', score: 74, rr1: 3.1 },
    { symbol: 'AAPL', score: 90, rr1: null },
  ] as Setup[];
  it('só elite, ordenado por score, com limite', () => {
    const out = pickElites(opps, 2);
    expect(out.map((o) => o.symbol)).toEqual(['AAPL', 'NVDA']);
    expect(pickElites(opps, 10)).toHaveLength(3);
    expect(pickElites([])).toEqual([]);
  });
});

describe('composeBriefInput amarra flags + correlação', () => {
  const quotes: UsQuotes = {
    spx: { label: 'S&P 500', price: 6487.5, chg: 0.8, gap: 0.3 },
    ndx: { label: 'Nasdaq 100', price: 23410.2, chg: 1.2, gap: 0.5 },
    dji: { label: 'Dow Jones', price: 45512.9, chg: 0.4, gap: 0.1 },
    vixLevel: 14.2, vixChg: 2.5, dxyDir: 'queda', dxyChg: -0.2,
    sectorsTop: [{ label: 'Tech (XLK)', chg: 1.5 }],
    sectorsBottom: [{ label: 'Energia (XLE)', chg: -0.6 }],
  };
  it('flags e modo de correlação calculados, não opinados', () => {
    const i = composeBriefInput({
      dateBrt: '12/09/2026', quotes,
      btc: { price: 115420, chg24: 2.1 }, eth: { price: 4521, chg24: 1.4 },
      spx48: 0.2, btc48: 2.0, regime: 'RISK-ON', breadth: 68,
      news: [{ title: 'CPI amanhã', source: 'Yahoo Finance' }],
      elites: [{ symbol: 'NVDA', score: 84, rr: 2.6 }],
    });
    expect(i.btcCorr48.mode).toBe('desacoplado');
    expect(i.flags).toHaveLength(1);
    expect(i.elites[0].symbol).toBe('NVDA');
  });
});
