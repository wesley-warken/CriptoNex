import type { ReactNode } from 'react';
import { PRESETS, type FacetCounts, type FilterState, type MinRR, type PresetKey, type QualityFilter } from '../domain/filters';
import { setupShort } from './format';

export interface FilterPopoverProps {
  filters: FilterState;
  facets: FacetCounts;
  onPatch: (patch: Partial<FilterState>) => void;
  onPreset: (key: PresetKey) => void;
}

function Option({ selected, onClick, label, count }: {
  selected: boolean; onClick: () => void; label: string; count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border px-2.5 py-1.5 text-sm tabular-nums transition-all duration-150 ease-out active:scale-[0.98] ${
        selected
          ? 'border-[var(--brand)] bg-[var(--surface-2)] font-semibold text-[var(--brand)]'
          : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label} <span className="text-xs text-[var(--text-muted)]">{count}</span>
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Popover do funil: presets, qualidade+R:R com contagens facetadas,
 * toggle de alinhamento ao regime e avançado (tipo, liquidez).
 * Aplica ao vivo; fecha com Escape ou clique fora (ver FilterBar).
 */
export function FilterPopover({ filters, facets, onPatch, onPreset }: FilterPopoverProps) {
  return (
    <div className="w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-lg">
      <div className="flex gap-1.5">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            title={PRESETS[k].hint}
            onClick={() => onPreset(k)}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-all duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--text-primary)] active:scale-[0.98]"
          >
            {PRESETS[k].label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Group label="Qualidade · score">
          <Option selected={filters.quality === 'all'} onClick={() => onPatch({ quality: 'all' as QualityFilter })} label="Todos" count={facets.quality.all} />
          <Option selected={filters.quality === 'forte'} onClick={() => onPatch({ quality: 'forte' as QualityFilter })} label="Forte 70+" count={facets.quality.forte} />
          <Option selected={filters.quality === 'elite'} onClick={() => onPatch({ quality: 'elite' as QualityFilter })} label="Elite 80+" count={facets.quality.elite} />
        </Group>

        <Group label="R:R mínimo · alvo 1">
          {([0, 2, 2.5, 3] as MinRR[]).map((r) => (
            <Option
              key={r}
              selected={filters.minRR === r}
              onClick={() => onPatch({ minRR: r })}
              label={r === 0 ? 'Todos' : `≥ ${r}`}
              count={facets.minRR[r]}
            />
          ))}
        </Group>

        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-secondary)]" id="align-label">Alinhado ao regime</span>
          <button
            type="button"
            role="switch"
            aria-checked={filters.regimeAligned}
            aria-labelledby="align-label"
            onClick={() => onPatch({ regimeAligned: !filters.regimeAligned })}
            className={`relative h-5 w-9 rounded-full transition-colors duration-150 ease-out ${
              filters.regimeAligned ? 'bg-[var(--brand)]' : 'border border-[var(--border)] bg-[var(--surface-2)]'
            }`}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-150 ease-out shadow-xs"
              style={{ transform: filters.regimeAligned ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)]">
            Avançado · tipo e liquidez
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block text-sm text-[var(--text-secondary)]">
              Tipo de setup
              <select
                value={filters.setup}
                onChange={(e) => onPatch({ setup: e.target.value as FilterState['setup'] })}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              >
                <option value="all">Todos ({facets.setup.all})</option>
                {(Object.keys(facets.setup) as (keyof typeof facets.setup)[])
                  .filter((s) => s !== 'all')
                  .map((s) => (
                    <option key={s} value={s}>{setupShort(s)} ({facets.setup[s]})</option>
                  ))}
              </select>
            </label>
            <label className="block text-sm text-[var(--text-secondary)]">
              Liquidez
              <select
                value={filters.liquidity}
                onChange={(e) => onPatch({ liquidity: e.target.value as FilterState['liquidity'] })}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              >
                <option value="all">Todas ({facets.liquidity.all})</option>
                <option value="alta">Alta ({facets.liquidity.alta})</option>
                <option value="media">Média ({facets.liquidity.media})</option>
              </select>
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}
