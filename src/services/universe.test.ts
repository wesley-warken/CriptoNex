import { describe, it, expect } from 'vitest';
import { resolveAsset, timeframesFor } from '@/services/assetCandles';
import {
  parseNasdaqTsv,
  normalizeLookup,
  mergeUniverse,
  chunk,
  isStablecoin,
  isActiveCoin,
  type UniverseCoin,
} from '@/services/universeTypes';

const TSV = [
  'Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares',
  'AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N',
  'MSFT|Microsoft Corporation - Common Stock|Q|N|N|100|N|N',
  'File Creation Time: 01232026|',
].join('\n');

const TSV_OTHER = [
  'Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol',
  'TSM|Taiwan Semiconductor Manufacturing Company Ltd.|N|TSM|N|100|N|TSM',
  'File Creation Time: 01232026|',
].join('\n');

describe('universo crypto', () => {
  it('merge dedupe por id preservando ordem', () => {
    const mk = (id: string): UniverseCoin => ({ id, symbol: id.toUpperCase(), name: id, price: 1, marketCap: 1, volume24h: 1, change1h: null, change24h: null, change7d: null, change30d: null, change1y: null });
    const out = mergeUniverse([mk('a'), mk('b')], [mk('b'), mk('c')]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('stablecoin e ativas', () => {
    expect(isStablecoin({ symbol: 'usdt' })).toBe(true);
    expect(isStablecoin({ symbol: 'BTC' })).toBe(false);
    expect(isActiveCoin({ volume24h: 0 })).toBe(false);
    expect(isActiveCoin({ volume24h: null })).toBe(false);
    expect(isActiveCoin({ volume24h: 10 })).toBe(true);
  });
  it('chunk divide lotes Brapi', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('resolveAsset', () => {
  it('BTC vai p/ Binance', () => {
    expect(resolveAsset('btc')).toMatchObject({ symbol: 'BTC', kind: 'crypto', binanceSymbol: 'BTCUSDT' });
  });
  it('PETR4 vira PETR4.SA', () => {
    expect(resolveAsset('petr4')).toMatchObject({ symbol: 'PETR4', kind: 'stock', yahooSymbol: 'PETR4.SA' });
  });
  it('símbolos Yahoo passam direto', () => {
    expect(resolveAsset('aapl').kind).toBe('crypto');
    expect(resolveAsset('^BVSP')).toMatchObject({ kind: 'stock', yahooSymbol: '^BVSP' });
    expect(resolveAsset('GC=F').kind).toBe('stock');
  });
  it('timeframes por tipo', () => {
    expect(timeframesFor('crypto')).toEqual(['1h', '4h', '1d', '1w']);
    expect(timeframesFor('stock')).toEqual(['1h', '1d', '1w']);
  });
});

describe('nasdaq TSV', () => {
  it('parse nasdaqlisted com fallback de bolsa', () => {
    const rows = parseNasdaqTsv(TSV, 'NASDAQ');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ symbol: 'AAPL', name: 'Apple Inc. - Common Stock', exchange: 'NASDAQ' });
  });
  it('parse otherlisted lendo coluna Exchange', () => {
    const rows = parseNasdaqTsv(TSV_OTHER, 'NYSE');
    expect(rows).toHaveLength(1);
    expect(rows[0].exchange).toBe('N');
  });
  it('ignora rodapé e linhas vazias', () => {
    expect(parseNasdaqTsv('Symbol|Security Name\nFile Creation Time: x|', 'NASDAQ')).toEqual([]);
  });
});

describe('yahoo lookup', () => {
  it('normaliza tipos globais', () => {
    const out = normalizeLookup([
      { symbol: 'TSM', longname: 'Taiwan Semi', quoteType: 'EQUITY', exchDisp: 'New York' },
      { symbol: 'PETR4.SA', shortname: 'Petrobras', quoteType: 'EQUITY', exchDisp: 'Sao Paulo' },
      { symbol: '^BVSP', shortname: 'Ibovespa', quoteType: 'INDEX' },
      { symbol: 'GC=F', shortname: 'Gold', quoteType: 'FUTURE' },
      { symbol: 'EURUSD=X', shortname: 'Euro/US Dollar', quoteType: 'CURRENCY' },
      { symbol: 'VWRA.L', longname: 'Vanguard FTSE', quoteType: 'ETF', exchDisp: 'London' },
    ]);
    expect(out.map((r) => r.kind)).toEqual(['stock', 'stock', 'index', 'commodity', 'fx', 'etf']);
    expect(out[1].symbol).toBe('PETR4.SA');
  });
  it('descarta sem símbolo', () => {
    expect(normalizeLookup([{ symbol: '' }])).toEqual([]);
  });
  it('achata grupos documents do Yahoo real', () => {
    const out = normalizeLookup([
      { symbol: '', documents: [{ symbol: 'OXY', shortName: 'Occidental Petroleum', quoteType: 'equity', exchange: 'NYQ' }] } as never,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: 'OXY', name: 'Occidental Petroleum', kind: 'stock', exchange: 'NYQ' });
  });
});
