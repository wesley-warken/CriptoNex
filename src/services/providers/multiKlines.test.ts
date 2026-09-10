import { describe, it, expect } from 'vitest';
import { krakenPair, parseCoinbase, parseKraken } from '@/services/providers/multiKlines';

describe('multiKlines (parse + pares)', () => {
  it('mapeia pares especiais da Kraken com fallback direto', () => {
    expect(krakenPair('BTC')).toEqual(['XBTUSD', 'BTCUSD']);
    expect(krakenPair('USDT')).toEqual(['USDTZUSD', 'USDTUSD']);
    expect(krakenPair('SOL')).toEqual(['SOLUSD']);
  });
  it('parseia OHLC da Kraken ([time,o,h,l,c,vwap,vol,count])', () => {
    const kl = parseKraken({
      error: [],
      result: {
        XXBTZUSD: [[1788998400, '76743.7', '78554.1', '76630.1', '78455.8', '77500.0', '100.5', 50]],
        last: 1788998400,
      },
    });
    expect(kl).toHaveLength(1);
    expect(kl[0]).toMatchObject({ time: 1788998400000, open: 76743.7, high: 78554.1, low: 76630.1, close: 78455.8 });
  });
  it('rejeita erro da Kraken sem quebrar', () => {
    expect(parseKraken({ error: ['EQuery:Unknown asset pair'], result: {} })).toEqual([]);
    expect(parseKraken(null)).toEqual([]);
  });
  it('parseia candles da Coinbase ([time,low,high,open,close,vol]) e ordena', () => {
    const kl = parseCoinbase([
      [1788998400, 76630.13, 78554.18, 78283.98, 76743.77, 2852.22],
      [1788912000, 76000.0, 77000.0, 76500.0, 76630.13, 1000.0],
    ]);
    expect(kl).toHaveLength(2);
    expect(kl[0].time).toBeLessThan(kl[1].time);
    expect(kl[1]).toMatchObject({ open: 78283.98, high: 78554.18, low: 76630.13, close: 76743.77 });
  });
});
