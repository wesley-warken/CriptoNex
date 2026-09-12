import { describe, expect, it } from 'vitest';
import { needsRefresh, MCTX_TTL_MS } from './marketContext';

describe('needsRefresh — cadência semanal automática', () => {
  const now = 1_700_000_000_000;
  it('vencido, ausente e inválido pedem refresh', () => {
    expect(needsRefresh(null, now)).toBe(true);
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh(0, now)).toBe(true);
    expect(needsRefresh(now - MCTX_TTL_MS - 1, now)).toBe(true);
  });
  it('dentro da janela não pede', () => {
    expect(needsRefresh(now - 1000, now)).toBe(false);
    expect(needsRefresh(now - MCTX_TTL_MS + 1000, now)).toBe(false);
  });
});
