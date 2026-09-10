// Cache em memória (TTL 60s) + snapshot diário em localStorage.
const mem = new Map<string, { data: unknown; exp: number }>();
export const TTL_MS = 60_000;
export function cacheGet<T>(key: string): T | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { mem.delete(key); return null; }
  return e.data as T;
}
export function cacheSet(key: string, data: unknown, ttl = TTL_MS): void {
  mem.set(key, { data, exp: Date.now() + ttl });
}
export function snapshotGet<T>(key: string): { data: T; ts: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function snapshotSet(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* armazenamento cheio */ }
}
export async function withCache<T>(key: string, fn: () => Promise<T>, ttl = TTL_MS, snapshotKey?: string): Promise<{ data: T; stale: boolean; ts: number }> {
  const hit = cacheGet<T>(key);
  if (hit) return { data: hit, stale: false, ts: Date.now() };
  try {
    const data = await fn();
    cacheSet(key, data, ttl);
    if (snapshotKey) snapshotSet(snapshotKey, data);
    return { data, stale: false, ts: Date.now() };
  } catch (err) {
    if (snapshotKey) {
      const snap = snapshotGet<T>(snapshotKey);
      if (snap) return { data: snap.data, stale: true, ts: snap.ts };
    }
    throw err;
  }
}
export async function fetchWithTimeout(url: string, ms = 12_000, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}
export async function retry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= attempts; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
  }
  throw last;
}
