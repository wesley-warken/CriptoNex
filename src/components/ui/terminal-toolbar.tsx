import type { ReactNode } from 'react';
import { Search, X, SlidersHorizontal, ArrowDownUp, Rows3, Rows4, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TerminalTabs } from './terminal-tabs';

export interface FilterChipItem {
  id: string;
  label: string;
  count?: number;
  tone?: 'bull' | 'bear' | 'neutral' | 'warn' | 'brand';
}

export interface TerminalToolbarProps {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  resultCount?: { current: number; total: number };
  
  universe?: string;
  onUniverseChange?: (val: string) => void;
  universeOptions?: readonly { id: string; label: string }[];

  timeframe?: string;
  onTimeframeChange?: (val: string) => void;
  timeframeOptions?: readonly { id: string; label: string }[];

  filterChips?: readonly FilterChipItem[];
  selectedFilter?: string;
  onFilterChange?: (filterId: string) => void;

  density?: 'compact' | 'comfortable';
  onToggleDensity?: () => void;

  onExportCsv?: () => void;
  customActions?: ReactNode;

  className?: string;
}

/**
 * Toolbar data-dense do Radar e de tabelas financeiras.
 * Reúne seletores de universo, timeframe, chips de filtro, busca e densidade.
 */
export function TerminalToolbar({
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Buscar por ticker ou nome...',
  resultCount,
  universe = 'top100',
  onUniverseChange,
  universeOptions = [
    { id: 'top100', label: 'Top 100' },
    { id: 'top200', label: 'Top 200' },
    { id: 'all', label: 'Todas' },
    { id: 'favorites', label: 'Favoritos' },
  ],
  timeframe = '4h',
  onTimeframeChange,
  timeframeOptions = [
    { id: '1h', label: '1H' },
    { id: '4h', label: '4H' },
    { id: '1d', label: '1D' },
  ],
  filterChips = [],
  selectedFilter = 'all',
  onFilterChange,
  density = 'compact',
  onToggleDensity,
  onExportCsv,
  customActions,
  className,
}: TerminalToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-2.5',
        className
      )}
    >
      {/* Upper row: Universe selector + Timeframe selector + Search + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Universe Segment */}
          {onUniverseChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Universo:
              </span>
              <TerminalTabs
                tabs={universeOptions}
                activeTab={universe}
                onChange={onUniverseChange}
                variant="segmented"
                size="sm"
              />
            </div>
          )}

          {/* Timeframe Segment */}
          {onTimeframeChange && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                TF:
              </span>
              <TerminalTabs
                tabs={timeframeOptions}
                activeTab={timeframe}
                onChange={onTimeframeChange}
                variant="segmented"
                size="sm"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Search Box with Clear */}
          {onSearchChange && (
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-7 w-48 sm:w-56 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] pl-8 pr-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Results count indicator */}
          {resultCount && (
            <span className="hidden sm:inline-block font-mono-tabular text-[11px] text-[var(--text-muted)] whitespace-nowrap">
              <strong className="text-[var(--text-primary)]">{resultCount.current}</strong>/{resultCount.total}
            </span>
          )}

          {/* Density Toggle (Compact vs Comfortable) */}
          {onToggleDensity && (
            <button
              type="button"
              onClick={onToggleDensity}
              title={`Densidade: ${density === 'compact' ? 'Compacta (36px)' : 'Confortável (48px)'}. Clique para alternar.`}
              className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              {density === 'compact' ? (
                <>
                  <Rows3 className="h-3.5 w-3.5 text-[var(--brand)]" />
                  <span className="hidden md:inline text-[11px]">36px</span>
                </>
              ) : (
                <>
                  <Rows4 className="h-3.5 w-3.5 text-[var(--brand)]" />
                  <span className="hidden md:inline text-[11px]">48px</span>
                </>
              )}
            </button>
          )}

          {/* Export CSV */}
          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              title="Exportar dados para CSV"
              className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden md:inline text-[11px]">CSV</span>
            </button>
          )}

          {customActions}
        </div>
      </div>

      {/* Lower row: Filter chips if available */}
      {filterChips.length > 0 && onFilterChange && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] mr-1">
            Filtros:
          </span>
          {filterChips.map((chip) => {
            const isSelected = chip.id === selectedFilter;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onFilterChange(chip.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors duration-150 select-none',
                  isSelected
                    ? 'bg-[var(--brand)] text-white font-semibold'
                    : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                )}
              >
                <span>{chip.label}</span>
                {chip.count !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-1 text-[10px] font-mono-tabular',
                      isSelected ? 'bg-white/20 text-white font-bold' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                    )}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
