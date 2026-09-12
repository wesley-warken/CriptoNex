import { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { HORIZON_ORDER, HORIZONS, type HorizonKey } from '@/engine/horizon/horizons';
import { activeFilterCount, type FacetCounts, type FilterState, type SortKey } from '../domain/filters';
import { FilterPopover } from './FilterPopover';

export interface FilterBarProps {
  filters: FilterState;
  facets: FacetCounts;
  liveStatus: string | null;
  onPatch: (patch: Partial<FilterState>) => void;
  onPreset: (key: 'elite' | 'conservador' | 'agressivo') => void;
}

const SORT_LABELS: Record<SortKey, string> = {
  score: 'Score',
  rr: 'R:R',
  conf: 'Confiança',
};

/**
 * Funil em linha única: tabs de horizonte, busca, ordenação e funil.
 * Popover origin-aware (150ms, ease-out) com presets e facetas ao vivo.
 */
export function FilterBar({ filters, facets, liveStatus, onPatch, onPreset }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-center gap-4 border-b border-[var(--border)]" role="tablist" aria-label="Horizonte">
        {HORIZON_ORDER.map((h: HorizonKey) => (
          <button
            key={h}
            role="tab"
            aria-selected={filters.horizon === h}
            onClick={() => onPatch({ horizon: h })}
            className={`-mb-px border-b pb-2 text-sm transition-colors duration-150 ease-out active:scale-[0.98] ${
              filters.horizon === h
                ? 'border-[var(--brand)] font-semibold text-[var(--brand)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {HORIZONS[h].label}
          </button>
        ))}
      </div>

      <label className="relative ml-auto flex min-w-44 flex-1 items-center sm:max-w-64">
        <Search size={14} className="pointer-events-none absolute left-2.5 text-[var(--text-muted)]" aria-hidden="true" />
        <input
          value={filters.query}
          onChange={(e) => onPatch({ query: e.target.value })}
          placeholder="Buscar símbolo…"
          aria-label="Buscar símbolo"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] py-1.5 pl-8 pr-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        Ordenar
        <select
          value={filters.sort}
          onChange={(e) => onPatch({ sort: e.target.value as SortKey })}
          aria-label="Ordenar por"
          className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
            <option key={s} value={s}>{SORT_LABELS[s]}</option>
          ))}
        </select>
      </label>

      <div ref={boxRef} className="relative">
        <FilterFunnelButton filters={filters} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && (
          <div className="animate-popover absolute right-0 top-full z-20 mt-2">
            <FilterPopover filters={filters} facets={facets} onPatch={onPatch} onPreset={onPreset} />
          </div>
        )}
      </div>

      {liveStatus && (
        <span className="tabular-nums w-full text-xs text-[var(--text-muted)] sm:w-auto sm:text-right" role="status">
          {liveStatus}
        </span>
      )}
    </div>
  );
}

function FilterFunnelButton({ filters, open, onToggle }: {
  filters: FilterState; open: boolean; onToggle: () => void;
}) {
  const n = activeFilterCount(filters);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Filtros${n > 0 ? `, ${n} ativos` : ''}`}
      className={`relative rounded-md border p-2 transition-all duration-150 ease-out active:scale-[0.98] ${
        open || n > 0
          ? 'border-[var(--brand)] bg-[var(--surface-2)] text-[var(--brand)]'
          : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--text-primary)]'
      }`}
    >
      <SlidersHorizontal size={16} aria-hidden="true" />
      {n > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold tabular-nums text-white">
          {n}
        </span>
      )}
    </button>
  );
}
