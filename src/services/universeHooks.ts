import { useEffect, useState } from 'react';
import { fetchCryptoUniverse, loadCachedCryptoUniverse, CRYPTO_TTL_MS } from '@/services/universe';
import { fetchUsUniverse, loadCachedUsUniverse } from '@/services/nasdaq';
import { fetchB3List } from '@/services/brapi';
import type { B3Entry } from '@/services/brapi';
import type { NasdaqRow } from '@/services/universeTypes';
import type { UniverseCoin } from '@/services/universeTypes';
import b3seed from '@/data/b3-seed.json';

export interface CryptoUniverseState {
  coins: UniverseCoin[];
  loaded: number;
  page: number;
  done: boolean;
  rateLimited: boolean;
  cacheTs: number | null;
  fromCache: boolean;
  error: string | null;
}

// Singleton por sessão: evita loop duplo do StrictMode e compartilha entre páginas.
const shared: CryptoUniverseState = {
  coins: [], loaded: 0, page: 0, done: false, rateLimited: false, cacheTs: null, fromCache: false, error: null,
};
const listeners = new Set<(s: CryptoUniverseState) => void>();
let started = false;

function emit() {
  for (const l of listeners) l({ ...shared });
}

async function boot() {
  if (started) return;
  started = true;
  try {
    const cached = await loadCachedCryptoUniverse();
    if (cached && cached.data.length) {
      shared.coins = cached.data;
      shared.loaded = cached.data.length;
      shared.cacheTs = cached.ts;
      shared.fromCache = true;
      shared.done = !cached.stale;
      emit();
      if (!cached.stale) return;
    }
    await fetchCryptoUniverse(
      (acc, page) => {
        shared.coins = [...acc];
        shared.loaded = acc.length;
        shared.page = page;
        shared.rateLimited = false;
        shared.error = null;
        emit();
      },
      undefined,
    );
    shared.done = true;
    shared.rateLimited = false;
    emit();
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Falha no universo crypto';
    // Mensagem amigável: evita "Failed to fetch" técnico em inglês
    const friendly = /Failed to fetch|NetworkError|fetch|load failed/i.test(raw)
      ? 'rede indisponível'
      : /429|rate limit/i.test(raw)
        ? 'rate limit (CoinGecko)'
        : raw;
    shared.error = friendly;
    shared.rateLimited = /429|rate limit/i.test(raw);
    shared.done = true;
    emit();
  }
}

export function useUniverseCrypto(): CryptoUniverseState & { reload: () => void; ttlMin: number } {
  const [snap, setSnap] = useState<CryptoUniverseState>({ ...shared });
  useEffect(() => {
    const l = (s: CryptoUniverseState) => setSnap(s);
    listeners.add(l);
    setSnap({ ...shared });
    void boot();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    ...snap,
    ttlMin: Math.round(CRYPTO_TTL_MS / 60000),
    reload: () => {
      started = false;
      shared.done = false;
      shared.error = null;
      void boot();
    },
  };
}

export interface StocksUniverseState {
  b3: B3Entry[];
  us: NasdaqRow[];
  loading: boolean;
  error: string | null;
}

const sShared: StocksUniverseState = { b3: [], us: [], loading: true, error: null };
const sListeners = new Set<(s: StocksUniverseState) => void>();
let sStarted = false;

function sEmit() {
  for (const l of sListeners) l({ ...sShared });
}

async function sBoot() {
  if (sStarted) return;
  sStarted = true;
  try {
    const [b3, us] = await Promise.all([
      fetchB3List(b3seed as B3Entry[]),
      (async () => {
        const c = await loadCachedUsUniverse();
        if (c && c.data.length && !c.stale) return c.data;
        try {
          return await fetchUsUniverse();
        } catch {
          return c?.data ?? [];
        }
      })(),
    ]);
    sShared.b3 = b3;
    sShared.us = us;
    sShared.loading = false;
    sEmit();
  } catch (e) {
    // Degradação parcial: usa seed B3 mesmo sem rede
    sShared.b3 = b3seed as B3Entry[];
    sShared.error = e instanceof Error ? e.message : 'Falha no universo de ações';
    sShared.loading = false;
    sEmit();
  }
}

export function useUniverseStocks(): StocksUniverseState & { reload: () => void } {
  const [snap, setSnap] = useState<StocksUniverseState>({ ...sShared });
  useEffect(() => {
    const l = (s: StocksUniverseState) => setSnap(s);
    sListeners.add(l);
    setSnap({ ...sShared });
    void sBoot();
    return () => {
      sListeners.delete(l);
    };
  }, []);
  return {
    ...snap,
    reload: () => {
      sStarted = false;
      sShared.loading = true;
      sShared.error = null;
      void sBoot();
    },
  };
}
