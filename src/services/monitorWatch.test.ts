import { describe, it, expect } from 'vitest';
import { diffNewMatches, notifyMatch } from '@/services/monitorWatch';
import type { MonMatch } from '@/engine/monitor';

describe('vigia do monitor', () => {
  it('separa estreias e preserva firstSeen antigo', () => {
    const prev = { 'f1:BTC': 1000 };
    const matches: MonMatch[] = [{ symbol: 'BTC', filterId: 'f1' }, { symbol: 'ETH', filterId: 'f1' }];
    const { merged, news, changed } = diffNewMatches(prev, matches, 2000);
    expect(news).toEqual([{ symbol: 'ETH', filterId: 'f1' }]);
    expect(merged['f1:BTC']).toBe(1000);
    expect(merged['f1:ETH']).toBe(2000);
    expect(changed).toBe(true);
  });
  it('sem estreias não muda nada', () => {
    const { news, changed } = diffNewMatches({ 'f1:BTC': 1000 }, [{ symbol: 'BTC', filterId: 'f1' }], 2000);
    expect(news).toEqual([]);
    expect(changed).toBe(false);
  });
  it('notificação sem permissão não quebra', () => {
    expect(() => notifyMatch('Teste', '✅', 'BTC')).not.toThrow();
  });
});
