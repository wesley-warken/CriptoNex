import { describe, it, expect, vi } from 'vitest';
import { mergeCandle, mergeCandleCapped, subscribeKline } from '@/services/liveKlines';
import { normalizeTickerKey, sameTicker } from '@/lib/symbols';
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
  it('cap rígido mantém só N recentes (memory leak guard)', () => {
    const base = Array.from({ length: 5 }, (_, i) => c((i + 1) * 1000, i));
    const out = mergeCandleCapped(base, c(6000, 99), 3);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.time)).toEqual([4000, 5000, 6000]);
  });
  it('cap padrão 300 não corta lista curta', () => {
    expect(mergeCandleCapped([c(1000, 1)], c(2000, 2))).toHaveLength(2);
  });
});

describe('normalização de tickers WS ↔ REST', () => {
  it('case-insensitive e sem barra', () => {
    expect(normalizeTickerKey('BTCUSDT')).toBe('BTCUSDT');
    expect(normalizeTickerKey('btcusdt')).toBe('BTCUSDT');
    expect(normalizeTickerKey('BTC/USDT')).toBe('BTCUSDT');
    expect(sameTicker('BTCUSDT', 'btcusdt')).toBe(true);
    expect(sameTicker('BTC/USDT', 'BTC-USDT')).toBe(true);
    expect(sameTicker('BTC', 'BTCUSDT')).toBe(false);
  });
  it('subscribeKline normaliza par e filtra k.s case-insensitive', () => {
    const instances: { url: string; onmessage: ((ev: unknown) => void) | null }[] = [];
    class MockWS {
      url: string;
      onmessage: ((ev: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(url: string) { this.url = url; instances.push(this as unknown as { url: string; onmessage: ((ev: unknown) => void) | null }); }
      close() {}
    }
    vi.stubGlobal('WebSocket', MockWS as unknown);
    const ticks: string[] = [];
    subscribeKline('BTC/USDT', '1m', (k) => ticks.push(String(k.close)), () => {});
    const ws = instances[0] as unknown as { onmessage: (ev: { data: string }) => void };
    expect(ws).toBeDefined();
    expect(instances[0].url).toContain('btcusdt@kline_1m');
    // k.s em lower deve passar, upper também, barra não existe no payload Binance
    ws.onmessage({ data: JSON.stringify({ k: { t: 1, s: 'btcusdt', o: '1', h: '2', l: '0.5', c: '1.5', v: '10', x: false } }) });
    expect(ticks).toHaveLength(1);
    ws.onmessage({ data: JSON.stringify({ k: { t: 2, s: 'BTCUSDT', o: '1', h: '2', l: '0.5', c: '2.5', v: '10', x: false } }) });
    expect(ticks).toHaveLength(2);
    // par distinto não deve passar
    ws.onmessage({ data: JSON.stringify({ k: { t: 3, s: 'ETHUSDT', o: '1', h: '2', l: '0.5', c: '9', v: '10', x: false } }) });
    expect(ticks).toHaveLength(2);
    vi.unstubAllGlobals();
  });
  it('subscribeKline retorna cleanup que fecha WS sem throw', () => {
    class MockWS { constructor(_url: string) {} close() {} onmessage: unknown = null; }
    vi.stubGlobal('WebSocket', MockWS as unknown);
    const off = subscribeKline('BTCUSDT', '1d', () => {}, () => {});
    expect(() => off()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
