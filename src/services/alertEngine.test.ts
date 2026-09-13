import { describe, it, expect } from 'vitest';
import { normalizeAlertSymbol, resolveAlertSymbol, UNIVERSE_EMPTY } from './alertEngine';

const coins = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana', symbol: 'SOL' },
];

describe('resolveAlertSymbol (cripto inexistente não cadastra)', () => {
  it('aceita símbolo exato, case-insensitive e por id', () => {
    expect(resolveAlertSymbol('crypto', 'BTC', coins)).toEqual({ ok: true, symbol: 'BTC' });
    expect(resolveAlertSymbol('crypto', 'btc', coins)).toEqual({ ok: true, symbol: 'BTC' });
    expect(resolveAlertSymbol('crypto', '  Eth  ', coins)).toEqual({ ok: true, symbol: 'ETH' });
    expect(resolveAlertSymbol('crypto', 'solana', coins)).toEqual({ ok: true, symbol: 'SOL' });
  });
  it('rejeita cripto inexistente com motivo', () => {
    const r = resolveAlertSymbol('crypto', 'BTCC', coins);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/não encontrada/i);
  });
  it('rejeita vazio e símbolo absurdo', () => {
    expect(resolveAlertSymbol('crypto', '   ', coins).ok).toBe(false);
    expect(resolveAlertSymbol('crypto', 'X'.repeat(21), coins).ok).toBe(false);
  });
  it('sem universo: sentinela para fallback via Binance', () => {
    expect(resolveAlertSymbol('crypto', 'BTC', [])).toEqual({ ok: false, reason: UNIVERSE_EMPTY });
  });
  it('ação: formato válido passa, lixo não', () => {
    expect(resolveAlertSymbol('stock', 'petr4', coins)).toEqual({ ok: true, symbol: 'PETR4' });
    expect(resolveAlertSymbol('stock', 'AAPL', coins)).toEqual({ ok: true, symbol: 'AAPL' });
    expect(resolveAlertSymbol('stock', '!!!', coins).ok).toBe(false);
    expect(resolveAlertSymbol('stock', '', coins).ok).toBe(false);
  });
  it('normalize: caixa alta sem espaços', () => {
    expect(normalizeAlertSymbol('  btc ')).toBe('BTC');
    expect(normalizeAlertSymbol('e t h')).toBe('ETH');
  });
});
