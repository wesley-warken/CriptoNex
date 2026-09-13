import { describe, it, expect, vi, afterEach } from 'vitest';
import { diffEdgeEvents } from '@/engine/monitor';
import { notifyMatch, subscribeMonEvents, MON_EVENTS_CHANNEL } from '@/services/monitorWatch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vigia do monitor (bordas inativo→ativo)', () => {
  it('só inativo→ativo vira evento, com timestamp da transição', () => {
    const prev = { 'f1:BTC': true as const };
    const { active, events, changed } = diffEdgeEvents(prev, [
      { key: 'f1:BTC', filterId: 'f1', symbol: 'BTC', state: 'active' },
      { key: 'f1:ETH', filterId: 'f1', symbol: 'ETH', state: 'active' },
    ], 2000);
    expect(events).toEqual([{ key: 'f1:ETH', filterId: 'f1', symbol: 'ETH', ts: 2000 }]);
    expect(active).toEqual({ 'f1:BTC': true, 'f1:ETH': true });
    expect(changed).toBe(true);
  });
  it('repetição ativa não re-dispara; saída+retorno dispara de novo', () => {
    const still = diffEdgeEvents({ 'f1:BTC': true as const }, [
      { key: 'f1:BTC', filterId: 'f1', symbol: 'BTC', state: 'active' },
    ], 2000);
    expect(still.events).toEqual([]);
    expect(still.changed).toBe(false);
    const out = diffEdgeEvents({ 'f1:BTC': true as const }, [
      { key: 'f1:BTC', filterId: 'f1', symbol: 'BTC', state: 'inactive' },
    ], 3000);
    expect(out.events).toEqual([]);
    expect(out.active).toEqual({});
    const back = diffEdgeEvents(out.active, [
      { key: 'f1:BTC', filterId: 'f1', symbol: 'BTC', state: 'active' },
    ], 4000);
    expect(back.events).toEqual([{ key: 'f1:BTC', filterId: 'f1', symbol: 'BTC', ts: 4000 }]);
  });
  it('unknown mantém ativo sem evento (falha de dado não forja borda)', () => {
    const { active, events, changed } = diffEdgeEvents({ 'f1:BTC': true as const }, [
      { key: 'f1:BTC', filterId: 'f1', symbol: 'BTC', state: 'unknown' },
    ], 2000);
    expect(events).toEqual([]);
    expect(active).toEqual({ 'f1:BTC': true as const });
    expect(changed).toBe(false);
  });
  it('notificação sem permissão não quebra', () => {
    expect(() => notifyMatch('Teste', '✅', 'BTC')).not.toThrow();
  });
});

describe('subscribeMonEvents (Radar ao vivo sem polling)', () => {
  const stubWindow = () => {
    const registry = new Map<string, ((...a: never[]) => void)[]>();
    const listeners = {
      get: (t: string) => registry.get(t) ?? [],
    };
    vi.stubGlobal('window', {
      addEventListener: vi.fn((t: string, fn: (...a: never[]) => void) => {
        registry.set(t, [...(registry.get(t) ?? []), fn]);
      }),
      removeEventListener: vi.fn((t: string, fn: (...a: never[]) => void) => {
        registry.set(t, (registry.get(t) ?? []).filter((f) => f !== fn));
      }),
      dispatchEvent: (e: { type: string }) => {
        for (const fn of registry.get(e.type) ?? []) fn();
        return true;
      },
    });
    vi.stubGlobal('CustomEvent', class CustomEvent {
      type: string;
      constructor(type: string) { this.type = type; }
    });
    return listeners;
  };
  it('CustomEvent dispara o callback; unsubscribe silencia', async () => {
    const listeners = stubWindow();
    const { subscribeMonEvents: sub } = await import('@/services/monitorWatch');
    let calls = 0;
    const unsub = sub(() => { calls += 1; });
    (window as unknown as { dispatchEvent: (e: { type: string }) => void })
      .dispatchEvent({ type: MON_EVENTS_CHANNEL });
    expect(calls).toBe(1);
    expect(listeners.get(MON_EVENTS_CHANNEL)).toHaveLength(1);
    unsub();
    (window as unknown as { dispatchEvent: (e: { type: string }) => void })
      .dispatchEvent({ type: MON_EVENTS_CHANNEL });
    expect(calls).toBe(1);
    expect(listeners.get(MON_EVENTS_CHANNEL)).toHaveLength(0);
  });
  it('storage só reage à chave dos eventos', async () => {
    const fns: Record<string, ((...a: never[]) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((t: string, fn: (...a: never[]) => void) => {
        fns[t] = [...(fns[t] ?? []), fn];
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
    });
    const { subscribeMonEvents: sub } = await import('@/services/monitorWatch');
    const { MON_EVENTS_KEY } = await import('@/engine/monitor');
    let calls = 0;
    sub(() => { calls += 1; });
    for (const fn of fns['storage'] ?? []) fn({ key: 'outra-chave' } as never);
    expect(calls).toBe(0);
    for (const fn of fns['storage'] ?? []) fn({ key: MON_EVENTS_KEY } as never);
    expect(calls).toBe(1);
  });
  it('sem window: no-op sem quebrar', async () => {
    const { subscribeMonEvents: sub } = await import('@/services/monitorWatch');
    expect(() => sub(() => { throw new Error('não deve chamar'); })()).not.toThrow();
  });
});
