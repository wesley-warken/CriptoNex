import { describe, it, expect } from 'vitest';
import { H4_MS, resampleCandles } from '@/services/assetCandles';
import type { Candle } from '@/types';

const H = 3600_000;
const c = (time: number, o: number, h: number, l: number, cl: number, v = 10): Candle =>
  ({ time, open: o, high: h, low: l, close: cl, volume: v });
// 10/09/2026 00:00Z = 09/09 21:00 BRT (abertura de sessão 4h)
const T0 = Date.parse('2026-09-10T00:00:00Z');

describe('sessões reais de 4h', () => {
  it('agrupa 00–04 e 04–08 UTC com OHLCV certos', () => {
    const kl = Array.from({ length: 8 }, (_, i) =>
      c(T0 + i * H, 100 + i, 101 + i, 99 + i, 100.5 + i));
    const out = resampleCandles(kl, H4_MS);
    expect(out).toHaveLength(2);
    expect(out[0].time).toBe(T0);
    expect(out[0]).toMatchObject({ open: 100, high: 104, low: 99, close: 103.5, volume: 40 });
    expect(out[1].time).toBe(T0 + 4 * H);
    expect(out[1].close).toBe(107.5);
  });
  it('sessão parcial vira candle em formação (fecha 21:00 BRT)', () => {
    // 17:00–20:00 BRT = 20:00–23:00Z: 3 horas da sessão 20–00Z
    const kl = [20, 21, 22].map((h) => c(Date.parse(`2026-09-10T${h}:00:00Z`), 500, 510, 495, 505));
    const out = resampleCandles(kl, H4_MS);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(Date.parse('2026-09-10T20:00:00Z'));
    // às 20h BRT a sessão das 17h BRT segue aberta: último fechamento foi 17:00 BRT
  });
  it('vazio retorna vazio', () => {
    expect(resampleCandles([], H4_MS)).toEqual([]);
  });
});
