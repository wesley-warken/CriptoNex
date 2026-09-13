import { afterEach, describe, expect, it, vi } from 'vitest';
import { idbGet } from '@/lib/idb';
import { binanceBase } from '@/services/providers/binance';
import { isLocalhost, yahooChart, type YahooQuote } from './lookup';

vi.mock('@/lib/idb', () => ({
  idbGet: vi.fn(),
  idbSet: vi.fn(),
  IDB_KEYS: { quotes: 'cc.quotes.cache' },
}));

const mockedIdbGet = vi.mocked(idbGet);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isLocalhost (proxy dev em qualquer porta)', () => {
  it('node sem window → false', () => {
    expect(isLocalhost()).toBe(false);
  });
  it('localhost:5174 → true (antes só 5173 passava)', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', port: '5174' } });
    expect(isLocalhost()).toBe(true);
  });
  it('127.0.0.1 → true; host externo → false', () => {
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1', port: '80' } });
    expect(isLocalhost()).toBe(true);
    vi.stubGlobal('window', { location: { hostname: 'app.exemplo.com', port: '443' } });
    expect(isLocalhost()).toBe(false);
  });
  it('binanceBase usa proxy no localhost', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', port: '5174' } });
    expect(binanceBase()).toBe('/api/binance/api/v3');
  });
});

const yahooJson = {
  chart: {
    result: [{
      timestamp: [1700000000, 1700003600],
      meta: { regularMarketPrice: 100, chartPreviousClose: 99 },
      indicators: { quote: [{ open: [98, 99.5], high: [99, 100], low: [97, 99], close: [99, 100], volume: [10, 12] }] },
    }],
  },
};

const staleQuote: YahooQuote = {
  price: 100, changePct: 1.01, candles: [], currency: 'USD',
  openToday: 98, prevClose: 99, lastTime: 1700003600000,
};

describe('yahooChart com fallback de cache vencido', () => {
  it('sucesso: parseia e retorna fresco', async () => {
    mockedIdbGet.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => yahooJson }));
    const q = await yahooChart('^GSPC', '1d', '5m');
    expect(q.price).toBe(100);
    expect(q.changePct).toBeCloseTo(1.01, 2);
    expect(q.openToday).toBe(98);
  });
  it('rede fora: serve o stale em vez de N/A', async () => {
    mockedIdbGet.mockResolvedValue({ data: staleQuote, ts: Date.now() - 600_000, stale: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede fora')));
    const q = await yahooChart('^GSPC', '1d', '5m');
    expect(q.price).toBe(100);
    expect(q.prevClose).toBe(99);
  });
  it('rede fora e sem cache: lança (chamador vira N/A honesto)', async () => {
    mockedIdbGet.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede fora')));
    await expect(yahooChart('^GSPC', '1d', '5m')).rejects.toThrow();
  });
});
