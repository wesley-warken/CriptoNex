import { idbGet, idbSet } from '@/lib/idb';
import type { Conviction } from '@/engine/ranking';

/** Snapshot das métricas de um símbolo no momento da pontuação (Fase 4). */
export interface EntrySnapshot {
  symbol: string;
  tier: Conviction;
  score: number;
  rr: number | null;
  stretch: number | null;
  confFull: boolean;
  ts: number;
}

const KEY = 'cc.metrics:last';
const MEM_CAP = 2000;
const mem = new Map<string, EntrySnapshot>();
let lastPersist = 0;

/** Ring buffer em memória (cap 2000) + último estado em IDB (throttle 30s). */
export function recordSnapshots(list: EntrySnapshot[]): void {
  for (const s of list) {
    if (mem.size >= MEM_CAP && !mem.has(s.symbol)) {
      const first = mem.keys().next();
      if (!first.done) mem.delete(first.value);
    }
    mem.set(s.symbol, s);
  }
  const now = Date.now();
  if (now - lastPersist > 30_000) {
    lastPersist = now;
    void idbSet(KEY, [...mem.values()].slice(-500), 24 * 3600 * 1000).catch(() => undefined);
  }
}

export function getSnapshot(symbol: string): EntrySnapshot | null {
  return mem.get(symbol) ?? null;
}

export async function loadSnapshots(): Promise<void> {
  try {
    const r = await idbGet<EntrySnapshot[]>(KEY);
    if (r && !r.stale) for (const s of r.data) mem.set(s.symbol, s);
  } catch {
    /* sem cache: segue só com memória */
  }
}
