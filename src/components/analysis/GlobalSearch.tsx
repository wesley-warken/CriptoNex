import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLookup } from '@/components/analysis/AssetSearch';
import { useStore } from '@/stores/useStore';

/** Busca global do header: crypto → Monitor, demais → Stocks; + adiciona à watchlist. */
export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { results, loading } = useLookup(open ? q : '');
  const nav = useNavigate();
  const toggleWatch = useStore((s) => s.toggleWatch);
  const addCustomAsset = useStore((s) => s.addCustomAsset);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (symbol: string, kind: string) => {
    const clean = kind === 'crypto' && !symbol.includes('-') && !symbol.includes('=') ? symbol.replace('-USD', '') : symbol;
    nav(`/monitor?symbol=${encodeURIComponent(clean)}`);
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && q.trim()) go(q.trim().toUpperCase(), q.includes('.') || q.startsWith('^') || q.includes('=') ? 'stock' : 'crypto');
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar qualquer ativo: SOL, TSM, ^BVSP, GC=F…"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-1.5 pl-8 pr-2 text-sm outline-none"
      />
      {open && (q.trim().length >= 2) && (
        <div className="absolute right-0 z-50 mt-1 max-h-80 w-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          {loading && <div className="px-3 py-2 text-xs text-muted">Buscando…</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-muted">Nada encontrado — tente o símbolo exato.</div>}
          {results.map((r) => (
            <div key={r.symbol} className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 text-sm last:border-0 hover:bg-[var(--surface-2)]">
              <button onClick={() => go(r.symbol, r.kind)} className="min-w-0 flex-1 truncate text-left">
                <strong>{r.symbol}</strong> <span className="text-xs text-muted">{r.name}</span>
                <span className="block text-[11px] text-muted">{r.kind} · {r.exchange}</span>
              </button>
              <button
                onClick={() => {
                  toggleWatch(r.symbol);
                  addCustomAsset({ symbol: r.symbol, name: r.name, exchange: r.exchange, kind: r.kind });
                }}
                className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-xs"
                title="Adicionar à watchlist"
              >
                +W
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
