import { get, set, del, keys } from 'idb-keyval';

export const IDB_KEYS = {
  cryptoUniverse: 'cc.universe.crypto',
  usStocks: 'cc.universe.stocks.us',
  b3Stocks: 'cc.universe.stocks.b3',
  quotes: 'cc.quotes.cache',
} as const;

interface Envelope<T> {
  ts: number;
  ttl: number;
  data: T;
}

export async function idbGet<T>(key: string): Promise<{ data: T; ts: number; stale: boolean } | null> {
  try {
    const env = await get(key) as Envelope<T> | undefined;
    if (!env || typeof env.ts !== 'number') return null;
    return { data: env.data, ts: env.ts, stale: Date.now() - env.ts > env.ttl };
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, data: T, ttlMs: number): Promise<void> {
  try {
    await set(key, { ts: Date.now(), data, ttl: ttlMs } satisfies Envelope<T>);
  } catch {
    /* quota cheia: mantém o que houver */
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    /* ignora */
  }
}

export async function idbCount(key: string): Promise<number> {
  const hit = await idbGet<unknown[]>(key);
  if (!hit || !Array.isArray(hit.data)) return 0;
  return hit.data.length;
}

export async function idbKeys(): Promise<string[]> {
  try {
    return ((await keys()) as unknown[]).map(String);
  } catch {
    return [];
  }
}
