import { describe, it, expect } from 'vitest';
import { diffEdgeEvents } from '@/engine/monitor';
import { notifyMatch } from '@/services/monitorWatch';

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
