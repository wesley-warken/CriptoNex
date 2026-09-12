import { describe, expect, it } from 'vitest';
import { orderCandidates } from './horizon';

const mk = (symbol: string) => ({ symbol, name: symbol, change7d: null, marketCap: null, volume24h: null });

describe('orderCandidates — pares conhecidos primeiro, com teto', () => {
  it('BTC/ETH antes de ticker obscuro; cap respeitado', () => {
    const out = orderCandidates([mk('ZZZ9'), mk('BTC'), mk('ETH')], 10);
    expect(out.map((c) => c.symbol)).toEqual(['BTC', 'ETH', 'ZZZ9']);
    expect(orderCandidates([mk('BTC'), mk('ETH')], 1)).toHaveLength(1);
  });
});
