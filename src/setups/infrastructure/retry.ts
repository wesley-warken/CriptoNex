/**
 * infrastructure/retry — backoff exponencial com jitter, puro e testado.
 * `sleep` injetável para testes não esperarem de verdade.
 */

export interface RetryOptions {
  tries?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 3);
  const baseMs = opts.baseMs ?? 1500;
  const maxMs = opts.maxMs ?? 15000;
  const sleep = opts.sleep ?? defaultSleep;
  let last: unknown = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt < tries - 1) {
        const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
        const jitter = Math.random() * baseMs * 0.25;
        await sleep(backoff + jitter);
      }
    }
  }
  throw last;
}
