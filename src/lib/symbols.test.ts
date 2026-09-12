import { describe, expect, it } from 'vitest';
import { canonicalSymbol } from './symbols';

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
