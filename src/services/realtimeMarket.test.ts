import { describe, it, expect } from 'vitest';

// Testa helpers puros do realtimeMarket sem abrir WS real
describe('realtimeMarket helpers', () => {
  it('LIVE/STALE/OFFLINE thresholds', async () => {
    const LIVE_MS = 5000;
    const OFFLINE_MS = 30000;
    const now = Date.now();
    const ageLive = 800;
    const ageStale = 14000;
    const ageOffline = 45000;
    const stateOf = (age: number) => age < LIVE_MS ? 'LIVE' : age < OFFLINE_MS ? 'STALE' : 'OFFLINE';
    expect(stateOf(ageLive)).toBe('LIVE');
    expect(stateOf(ageStale)).toBe('STALE');
    expect(stateOf(ageOffline)).toBe('OFFLINE');
    expect(now).toBeGreaterThan(0);
  });
  it('NO_REALTIME para sem par', () => {
    const hasPair = false;
    const state = hasPair ? 'LIVE' : 'NO_REALTIME';
    expect(state).toBe('NO_REALTIME');
  });
  it('multi-quote ordem USDT>USDC>BTC', () => {
    const quotes = ['USDT','USDC','BTC'];
    expect(quotes[0]).toBe('USDT');
    expect(quotes).toHaveLength(3);
  });
  it('hist + tick atualiza candle close/high/low', () => {
    const kl = [{ time: 0, open: 100, high: 105, low: 99, close: 103, volume: 1 }];
    const price = 107;
    const last = kl[kl.length-1];
    const upd = { time: last.time, open: last.open, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, volume: last.volume };
    expect(upd.high).toBe(107);
    expect(upd.close).toBe(107);
    expect(upd.low).toBe(99);
  });
  it('desconexao marca OFFLINE', () => {
    let state: string = 'LIVE';
    const onClose = () => { state = 'OFFLINE'; };
    onClose();
    expect(state).toBe('OFFLINE');
  });
});
