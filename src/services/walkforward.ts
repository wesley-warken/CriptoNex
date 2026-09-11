import { idbGet, idbSet } from '@/lib/idb';
import type { Candle } from '@/types';
import type { WFRequest, WFStats } from '@/workers/walkforward';

export const WF_KEY = 'cc.walkforward:v1';
export const WF_TTL_MS = 7 * 24 * 3600 * 1000;

export interface WFReport {
  stats: WFStats;
  ts: number;
  symbols: string[];
}

export async function loadWalkforward(): Promise<WFReport | null> {
  try {
    const r = await idbGet<WFReport>(WF_KEY);
    return r && !r.stale ? r.data : null;
  } catch {
    return null;
  }
}

/** Roda o walk-forward em worker (puro CPU, cancelável via terminate). */
export function runWalkforward(
  candles: Record<string, Candle[]>,
  opts: { horizons?: number[]; stride?: number; minScore?: number } = {},
  onProgress?: (done: number, total: number) => void,
): { promise: Promise<WFReport>; cancel: () => void } {
  const req: WFRequest = {
    candles,
    horizons: opts.horizons ?? [10, 20],
    stride: opts.stride ?? 2,
    minScore: opts.minScore ?? 60,
  };
  let worker: Worker | null = null;
  let settled = false;
  const cancel = () => {
    try {
      worker?.terminate();
    } catch {
      /* já encerrado */
    }
    worker = null;
  };
  const promise = (async (): Promise<WFReport> => {
    const mod = await import('@/workers/walkforward?worker');
    const WorkerCtor = mod.default as new () => Worker;
    worker = new WorkerCtor();
    const w: Worker = worker;
    const report = await new Promise<WFReport>((resolve, reject) => {
      const guard = setTimeout(() => {
        cancel();
        if (!settled) {
          settled = true;
          reject(new Error('walk-forward excedeu o tempo limite'));
        }
      }, 8 * 60 * 1000);
      w.onmessage = (ev: MessageEvent) => {
        const m = ev.data as
          | { type: 'progress'; done: number; total: number }
          | { type: 'done'; stats: WFStats }
          | { type: 'error'; message: string };
        if (m.type === 'progress') {
          onProgress?.(m.done, m.total);
        } else if (m.type === 'done') {
          clearTimeout(guard);
          if (!settled) {
            settled = true;
            const rep: WFReport = { stats: m.stats, ts: Date.now(), symbols: Object.keys(candles) };
            void idbSet(WF_KEY, rep, WF_TTL_MS).catch(() => undefined);
            resolve(rep);
          }
        } else {
          clearTimeout(guard);
          if (!settled) {
            settled = true;
            reject(new Error(m.message));
          }
        }
      };
      w.onerror = (e) => {
        clearTimeout(guard);
        if (!settled) {
          settled = true;
          reject(e instanceof Error ? e : new Error('worker falhou'));
        }
      };
      w.postMessage(req);
    });
    cancel();
    return report;
  })();
  return { promise, cancel };
}

/** Hit rate de um tier num horizonte (null sem amostra n≥30). */
export function tierHit(stats: WFStats, tier: string, h: number): { hit: number; n: number } | null {
  const b = stats.perTier[tier];
  const hb = b?.byHorizon[h];
  if (!hb || hb.n < 30) return null;
  return { hit: hb.wins / hb.n, n: hb.n };
}

/** R:R médio realizado de um tier (alvo-antes-stop; null sem amostra). */
export function tierAvgRR(stats: WFStats, tier: string): { rr: number; n: number } | null {
  const b = stats.perTier[tier];
  if (!b || b.rrN < 30) return null;
  return { rr: b.rrSum / b.rrN, n: b.rrN };
}

/** Sugere gates a partir do walk-forward (regras simples e reversíveis). */
export function suggestGates(stats: WFStats): { eliteMinScore: number; forteMinScore: number; notes: string[] } {
  const h = Math.max(...stats.horizons);
  let eliteMinScore = 75;
  let forteMinScore = 65;
  const notes: string[] = [];
  const e = tierHit(stats, 'ELITE', h);
  if (e == null) notes.push('ELITE sem amostra suficiente (n<30) — mantido gate 75.');
  else if (e.hit < 0.45) {
    eliteMinScore = 80;
    notes.push(`ELITE hit ${(e.hit * 100).toFixed(0)}% (n=${e.n}) < 45% → gate 80.`);
  } else notes.push(`ELITE hit ${(e.hit * 100).toFixed(0)}% (n=${e.n}) — gate 75 mantido.`);
  const f = tierHit(stats, 'FORTE', h);
  if (f == null) notes.push('FORTE sem amostra suficiente (n<30) — mantido gate 65.');
  else if (f.hit < 0.4) {
    forteMinScore = 70;
    notes.push(`FORTE hit ${(f.hit * 100).toFixed(0)}% (n=${f.n}) < 40% → gate 70.`);
  } else notes.push(`FORTE hit ${(f.hit * 100).toFixed(0)}% (n=${f.n}) — gate 65 mantido.`);
  return { eliteMinScore, forteMinScore, notes };
}
