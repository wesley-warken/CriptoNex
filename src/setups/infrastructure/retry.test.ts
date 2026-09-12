import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
  it('resolve de primeira sem dormir', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const out = await withRetry(async () => 42, { sleep });
    expect(out).toBe(42);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('tenta de novo e vence na segunda', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error('rede');
        return 'ok';
      },
      { tries: 3, baseMs: 100, sleep },
    );
    expect(out).toBe('ok');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('estoura as tentativas e relança o último erro', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    await expect(
      withRetry(async () => { throw new Error('caiu'); }, { tries: 2, baseMs: 10, sleep }),
    ).rejects.toThrow('caiu');
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
