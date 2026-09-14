import { describe, expect, it } from 'vitest';
import { canonicalSymbol, normalizeTickerKey, sameTicker } from './symbols';

describe('canonicalSymbol — mesmo instrumento econômico, uma identidade', () => {
  it('variantes de BTC colapsam para BTC', () => {
    for (const s of ['BTC', 'btc', 'BTCUSDT', 'BTC-USD', 'BTC/USD', 'BTCUSD', 'XBTUSD', 'XBTUSDT']) {
      expect(canonicalSymbol(s)).toBe('BTC');
    }
  });
  it('ações mantêm ticker (sem quote/sufixo de exchange)', () => {
    expect(canonicalSymbol('PETR4.SA')).toBe('PETR4');
    expect(canonicalSymbol('PETR4')).toBe('PETR4');
    expect(canonicalSymbol('AAPL')).toBe('AAPL');
    expect(canonicalSymbol('VWRA.L')).toBe('VWRA');
  });
  it('casos especiais preservados', () => {
    expect(canonicalSymbol('GC=F')).toBe('GC');
    expect(canonicalSymbol('^BVSP')).toBe('^BVSP');
    expect(canonicalSymbol('EURUSD=X')).toBe('EUR');
  });
});

describe('normalizeTickerKey — matching case-insensitive WS ↔ REST', () => {
  it('BTCUSDT vs btcusdt vs BTC/USDT são iguais', () => {
    expect(normalizeTickerKey('BTCUSDT')).toBe('BTCUSDT');
    expect(normalizeTickerKey('btcusdt')).toBe('BTCUSDT');
    expect(normalizeTickerKey('BTC/USDT')).toBe('BTCUSDT');
    expect(normalizeTickerKey('BTC-USDT')).toBe('BTCUSDT');
    expect(normalizeTickerKey('btc_usdt')).toBe('BTCUSDT');
    expect(sameTicker('BTCUSDT', 'btcusdt')).toBe(true);
    expect(sameTicker('BTC/USDT', 'btcusdt')).toBe(true);
  });
  it('normalização não colapsa base vs par quando não deve', () => {
    expect(normalizeTickerKey('BTC')).toBe('BTC');
    expect(sameTicker('BTC', 'BTCUSDT')).toBe(false);
  });
});
