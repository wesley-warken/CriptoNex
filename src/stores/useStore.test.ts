import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('radarTopN compartilhado (Monitor + vigia)', () => {
  it('default 100 e setter persiste', async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    });
    const { useStore } = await import('./useStore');
    expect(useStore.getState().radarTopN).toBe(100);
    useStore.getState().setRadarTopN(300);
    expect(useStore.getState().radarTopN).toBe(300);
    useStore.getState().setRadarTopN(null);
    expect(useStore.getState().radarTopN).toBeNull();
  });
});
