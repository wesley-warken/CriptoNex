/**
 * Rate-limiter por host com backoff em 429.
 * Centraliza o ritmo das chamadas CoinGecko (o gargalo real) para evitar
 * espirais de 429 que travam universo + histórico + scanner ao mesmo tempo.
 */
interface HostState {
  lastStart: number;
  backoffUntil: number;
}

const states = new Map<string, HostState>();
let MIN_GAP_MS = 900;

export function setMinGap(ms: number): void {
  MIN_GAP_MS = ms;
}

function stateFor(host: string): HostState {
  let s = states.get(host);
  if (!s) {
    s = { lastStart: 0, backoffUntil: 0 };
    states.set(host, s);
  }
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function acquire(host: string): Promise<void> {
  const s = stateFor(host);
  for (;;) {
    const now = Date.now();
    const wait = Math.max(s.backoffUntil - now, s.lastStart + MIN_GAP_MS - now);
    if (wait <= 0) {
      s.lastStart = Date.now();
      return;
    }
    await sleep(Math.min(wait, 5000));
  }
}

/**
 * Como `acquire`, mas desiste após `maxWaitMs` (retorna false) em vez de
 * esperar indefinidamente. Evita que um backoff em espiral congele lotes
 * inteiros: o chamador segue sem aquele dado (vira "—", preenche depois).
 */
export async function tryAcquire(host: string, maxWaitMs: number): Promise<boolean> {
  const s = stateFor(host);
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const now = Date.now();
    if (now >= deadline) return false;
    const wait = Math.max(s.backoffUntil - now, s.lastStart + MIN_GAP_MS - now);
    if (wait <= 0) {
      s.lastStart = Date.now();
      return true;
    }
    await sleep(Math.min(wait, deadline - now));
  }
}

/** Chamado ao receber 429: segura o host por `ms` (padrão 15s). */
export function report429(host: string, ms = 15000): void {
  stateFor(host).backoffUntil = Date.now() + ms;
}

export function rateLimitedError(message: string): Error & { rateLimited?: boolean } {
  const err = new Error(message) as Error & { rateLimited?: boolean };
  err.rateLimited = true;
  return err;
}
