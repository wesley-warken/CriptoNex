import { describe, it, expect } from 'vitest';
import { mergeCandle } from '@/services/liveKlines';
import type { Candle } from '@/types';

const c = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 });

describe('merge de tick ao vivo', () => {
  it('atualiza o candle aberto (mesmo tempo)', () => {
    const out = mergeCandle([c(1000, 10), c(2000, 11)], c(2000, 12));
    expect(out).toHaveLength(2);
    expect(out[1].close).toBe(12);
  });
  it('anexa candle novo (tempo maior)', () => {
    const out = mergeCandle([c(1000, 10)], c(2000, 11));
    expect(out).toHaveLength(2);
    expect(out[1].close).toBe(11);
  });
  it('ignora tick atrasado e lista vazia', () => {
    expect(mergeCandle([c(2000, 11)], c(1000, 10))).toHaveLength(1);
    expect(mergeCandle([], c(1000, 10))).toEqual([]);
  });
});
