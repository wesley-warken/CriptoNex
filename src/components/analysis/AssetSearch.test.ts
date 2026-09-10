import { describe, it, expect } from 'vitest';
import { searchLocal } from '@/components/analysis/AssetSearch';

const coins = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'WBTC', name: 'Wrapped BTC' },
  { symbol: 'SOL', name: 'Solana' },
];
const toR = (c: { symbol: string; name: string }) => ({
  symbol: c.symbol, name: c.name, exchange: 'Crypto', quoteType: 'CRYPTOCURRENCY', kind: 'crypto' as const,
});

describe('busca local de ativos', () => {
  it('prefixo vem antes de substring', () => {
    const r = searchLocal(coins, 'btc', (c) => c.symbol, (c) => c.name, toR, 10, 10);
    expect(r[0].symbol).toBe('BTC');
    expect(r.map((x) => x.symbol)).toContain('WBTC');
    expect(r.map((x) => x.symbol)).not.toContain('ETH');
  });
  it('busca por nome também encontra', () => {
    const r = searchLocal(coins, 'solan', (c) => c.symbol, (c) => c.name, toR, 10, 10);
    expect(r[0].symbol).toBe('SOL');
  });
  it('respeita os limites', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ symbol: `T${i}`, name: `Token ${i}` }));
    const r = searchLocal(many, 't', (c) => c.symbol, (c) => c.name, toR, 5, 7);
    expect(r.length).toBeLessThanOrEqual(12);
  });
});
