import { X } from 'lucide-react';
import { DEFAULT_FILTERS, type FilterState } from '../domain/filters';
import { setupShort } from './format';

export interface FilterChipsProps {
  filters: FilterState;
  liveQuery: string;
  onRemove: (patch: Partial<FilterState>) => void;
  onClear: () => void;
}

interface Chip {
  key: string;
  label: string;
  clear: Partial<FilterState>;
}

/** Linha de chips ativos removíveis + limpar. Some quando nada está ativo. */
export function FilterChips({ filters, liveQuery, onRemove, onClear }: FilterChipsProps) {
  const chips: Chip[] = [];
  if (liveQuery.trim()) {
    chips.push({ key: 'q', label: `“${liveQuery.trim()}”`, clear: { query: '' } });
  }
  if (filters.quality !== 'all') {
    chips.push({
      key: 'qual',
      label: filters.quality === 'elite' ? 'Elite 80+' : 'Forte 70+',
      clear: { quality: 'all' },
    });
  }
  if (filters.minRR !== 0) {
    chips.push({ key: 'rr', label: `R:R ≥ ${filters.minRR}`, clear: { minRR: 0 } });
  }
  if (!filters.regimeAligned) {
    chips.push({ key: 'align', label: 'Ignora regime', clear: { regimeAligned: true } });
  }
  if (filters.setup !== 'all') {
    chips.push({ key: 'setup', label: setupShort(filters.setup), clear: { setup: 'all' } });
  }
  if (filters.liquidity !== 'all') {
    chips.push({
      key: 'liq',
      label: filters.liquidity === 'alta' ? 'Liquidez alta' : 'Liquidez média',
      clear: { liquidity: 'all' },
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] py-0.5 pl-2.5 pr-1.5 text-xs text-[var(--text-secondary)]"
        >
          {c.label}
          <button
            type="button"
            onClick={() => onRemove(c.clear)}
            aria-label={`Remover filtro ${c.label}`}
            className="rounded-full p-0.5 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="px-1 text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
      >
        limpar tudo
      </button>
    </div>
  );
}

export function hasActiveFilters(f: FilterState, liveQuery: string): boolean {
  return (
    liveQuery.trim() !== '' ||
    f.quality !== DEFAULT_FILTERS.quality ||
    f.minRR !== DEFAULT_FILTERS.minRR ||
    f.regimeAligned !== DEFAULT_FILTERS.regimeAligned ||
    f.setup !== DEFAULT_FILTERS.setup ||
    f.liquidity !== DEFAULT_FILTERS.liquidity
  );
}
