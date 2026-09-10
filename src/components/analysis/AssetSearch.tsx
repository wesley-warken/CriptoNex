import { useEffect, useMemo, useState } from 'react';
import { yahooLookup } from '@/services/lookup';
import type { LookupResult } from '@/services/universeTypes';
import { useUniverseCrypto, useUniverseStocks } from '@/services/universeHooks';
import { useStore } from '@/stores/useStore';

/** Busca local instantânea nos universos já carregados (crypto + B3 + EUA). */
export function searchLocal<T>(
  arr: T[], needle: string,
  getSym: (t: T) => string, getName: (t: T) => string,
  toResult: (t: T) => LookupResult, capStarts: number, capContains: number,
): LookupResult[] {
  const starts: LookupResult[] = [];
  const contains: LookupResult[] = [];
  for (const t of arr) {
    const s = getSym(t).toLowerCase();
    const n = (getName(t) ?? '').toLowerCase();
    if (!s) continue;
    if (s.startsWith(needle) || (n && n.startsWith(needle))) {
      if (starts.length < capStarts) starts.push(toResult(t));
    } else if (s.includes(needle) || (n && n.includes(needle))) {
      if (contains.length < capContains) contains.push(toResult(t));
    }
    if (starts.length >= capStarts && contains.length >= capContains) break;
  }
  return [...starts, ...contains];
}

export function useLookup(query: string): { results: LookupResult[]; loading: boolean; error: string | null } {
  const [online, setOnline] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crypto = useUniverseCrypto();
  const stocks = useUniverseStocks();

  // Local primeiro: instantâneo, funciona até com Yahoo fora do ar
  const local = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: LookupResult[] = [];
    const seen = new Set<string>();
    const push = (r: LookupResult) => {
      const k = r.symbol.toUpperCase();
      if (seen.has(k) || out.length >= 20) return;
      seen.add(k);
      out.push(r);
    };
    for (const r of searchLocal(crypto.coins, needle, (c) => c.symbol, (c) => c.name,
      (c) => ({ symbol: c.symbol, name: c.name, exchange: 'Crypto', quoteType: 'CRYPTOCURRENCY', kind: 'crypto' }), 8, 8)) push(r);
    for (const r of searchLocal(stocks.b3, needle, (b) => b.symbol, (b) => b.name,
      (b) => ({ symbol: b.symbol, name: b.name, exchange: 'B3', quoteType: 'EQUITY', kind: 'stock' }), 6, 6)) push(r);
    for (const r of searchLocal(stocks.us, needle, (x) => x.symbol, (x) => x.name,
      (x) => ({ symbol: x.symbol, name: x.name, exchange: x.exchange || 'US', quoteType: 'EQUITY', kind: 'stock' }), 6, 6)) push(r);
    return out;
  }, [query, crypto.coins, stocks.b3, stocks.us]);

  // Yahoo online complementa (dedup): pega o que não está no local
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setOnline([]);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await yahooLookup(q, 25);
        if (alive) {
          setOnline(r);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Busca indisponível');
      } finally {
        if (alive) setLoading(false);
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const results = useMemo(() => {
    const out = [...local];
    const seen = new Set(out.map((r) => r.symbol.toUpperCase()));
    for (const r of online) {
      if (out.length >= 30) break;
      const k = r.symbol.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }, [local, online]);

  return { results, loading, error };
}

/** Busca global com ação de adicionar à watchlist / Meus ativos. */
export function AssetSearch({ compact }: { compact?: boolean }) {
  const [q, setQ] = useState('');
  const { results, loading, error } = useLookup(q);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const watchlist = useStore((s) => s.watchlist);
  const addCustomAsset = useStore((s) => s.addCustomAsset);
  const [added, setAdded] = useState<string | null>(null);
  return (
    <div className={compact ? '' : 'panel p-3'}>
      {!compact && <div className="mb-2 text-sm font-semibold">Adicionar qualquer ativo do mundo</div>}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar: TSM, PETR4.SA, ^BVSP, GC=F, EURUSD=X, VWRA.L…"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none"
      />
      {loading && <div className="mt-1 text-xs text-muted">Buscando…</div>}
      {error && <div className="mt-1 text-xs text-[var(--down)]">Busca indisponível ({error}). <span className="text-muted">Tente de novo em instantes.</span></div>}
      {results.length > 0 && (
        <div className="mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--border)]">
          {results.map((r) => (
            <div key={r.symbol} className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 text-sm last:border-0">
              <div className="min-w-0">
                <strong>{r.symbol}</strong> <span className="text-xs text-muted">{r.name}</span>
                <div className="text-[11px] text-muted">{r.kind} · {r.exchange}</div>
              </div>
              <button
                onClick={() => {
                  if (!watchlist.includes(r.symbol)) toggleWatch(r.symbol);
                  addCustomAsset({ symbol: r.symbol, name: r.name, exchange: r.exchange, kind: r.kind });
                  setAdded(r.symbol);
                  setTimeout(() => setAdded(null), 2000);
                }}
                className="ml-auto shrink-0 rounded-lg bg-[var(--accent)] px-2 py-1 text-xs font-bold text-black"
              >
                {added === r.symbol ? 'Adicionado ✓' : '+ Watchlist'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
