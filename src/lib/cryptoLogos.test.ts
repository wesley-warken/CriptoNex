import { describe, expect, it } from 'vitest';
import { coincapLogoUrl, coincapSlug, cryptoFallbackLetters, cryptoLogoSources, looksLikeCrypto } from './cryptoLogos';

describe('cryptoLogos', () => {
  it('gera slug minúsculo do CDN', () => {
    expect(coincapSlug('BTC')).toBe('btc');
    expect(coincapSlug(' render ')).toBe('render');
  });

  it('resolve aliases conhecidos', () => {
    expect(coincapSlug('WBTC')).toBe('btc');
    expect(coincapSlug('STETH')).toBe('eth');
  });

  it('monta URL do CoinCap', () => {
    expect(coincapLogoUrl('SOL')).toBe('https://assets.coincap.io/assets/icons/sol@2x.png');
  });

  it('prioriza image do CoinGecko antes do CDN', () => {
    const src = cryptoLogoSources('BTC', 'https://gecko/img/btc.png');
    expect(src[0]).toBe('https://gecko/img/btc.png');
    expect(src[1]).toBe(coincapLogoUrl('BTC'));
  });

  it('sem image, usa só o CDN', () => {
    expect(cryptoLogoSources('ETH')).toEqual([coincapLogoUrl('ETH')]);
  });

  it('não sugere CDN para ação B3/índice/forex', () => {
    expect(looksLikeCrypto('PETR4')).toBe(false);
    expect(looksLikeCrypto('PETR4.SA')).toBe(false);
    expect(looksLikeCrypto('^BVSP')).toBe(false);
    expect(looksLikeCrypto('EURUSD=X')).toBe(false);
    expect(cryptoLogoSources('PETR4')).toEqual([]);
  });

  it('fallback-letra sempre tem valor', () => {
    expect(cryptoFallbackLetters('BTC')).toBe('BT');
    expect(cryptoFallbackLetters('')).toBe('?');
  });
});
