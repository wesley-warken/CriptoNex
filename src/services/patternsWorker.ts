import type { Candle } from '@/types';
import type { DetectedPattern } from '@/engine/patterns';
import type { PatternsRequest, PatternsOut } from '@/workers/patterns';

export function runPatterns(
  candles: Record<string, Candle[]>,
  opts: { limit?: number } = {},
  onProgress?: (done: number, total: number) => void,
): { promise: Promise<Record<string, DetectedPattern[]>>; cancel: () => void } {
  const req: PatternsRequest = { candles, limit: opts.limit ?? 4 };
  let worker: Worker | null = null;
  let settled = false;
  const cancel = () => {
    try { worker?.terminate(); } catch {}
    worker = null;
  };
  const promise = (async () => {
    try {
      const mod = await import('@/workers/patterns?worker');
      const WorkerCtor = mod.default as new () => Worker;
      worker = new WorkerCtor();
    } catch {
      // Fallback síncrono se worker não disponível (testes node, fallback)
      const { detectPatterns } = await import('@/engine/patterns');
      const out: Record<string, DetectedPattern[]> = {};
      for (const [sym, kl] of Object.entries(candles)) {
        try { out[sym] = detectPatterns(kl as Candle[]).slice(0, req.limit); } catch { out[sym] = []; }
      }
      return out;
    }
    const w = worker!;
    return new Promise<Record<string, DetectedPattern[]>>((resolve, reject) => {
      const guard = setTimeout(() => {
        cancel();
        if (!settled) { settled = true; reject(new Error('patterns worker timeout')); }
      }, 30_000);
      w.onmessage = (ev: MessageEvent<PatternsOut>) => {
        const m = ev.data;
        if (m.type === 'progress') onProgress?.(m.done, m.total);
        else if (m.type === 'done') {
          clearTimeout(guard);
          if (!settled) { settled = true; cancel(); resolve(m.results); }
        } else {
          clearTimeout(guard);
          if (!settled) { settled = true; cancel(); reject(new Error(m.message)); }
        }
      };
      w.onerror = (e) => {
        clearTimeout(guard);
        if (!settled) { settled = true; cancel(); reject(e instanceof Error ? e : new Error('worker falhou')); }
      };
      w.postMessage(req);
    });
  })();
  return { promise, cancel };
}
