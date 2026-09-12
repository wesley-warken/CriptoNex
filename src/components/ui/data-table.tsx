import { useRef, useState, useMemo, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

export interface ColumnDef<T> {
  id: string;
  header: ReactNode;
  accessor?: (row: T) => string | number | null | undefined;
  cell?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  minWidth?: string;
  sortable?: boolean;
  pinned?: 'left';
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId?: (row: T, index: number) => string;
  density?: 'compact' | 'comfortable';
  isLoading?: boolean;
  loadingRowCount?: number;
  emptyTitle?: string;
  emptySubtitle?: string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  className?: string;
  tableHeight?: string | number;
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSortChange?: (columnId: string, direction: SortDirection) => void;
  pinnedColumnWidth?: string;
}

/**
 * DataTable virtualizada e data-dense do terminal financeiro.
 * - Virtualização com TanStack Virtual
 * - Header sticky
 * - Coluna "Moeda" / primeira coluna pinned à esquerda
 * - Alinhamento mono à direita para numerais
 * - Hover de linha instantâneo e sutil
 * - Skeleton por linha
 * - "—" elegante para campos vazios
 * - Suporte nativo a densidade Compacta (36px) e Confortável (48px)
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  density = 'compact',
  isLoading = false,
  loadingRowCount = 8,
  emptyTitle = 'Nenhum ativo encontrado',
  emptySubtitle = 'Tente ajustar os filtros ou termo de busca.',
  onRowClick,
  selectedRowId,
  className,
  tableHeight = '650px',
  sortColumn: controlledSortColumn,
  sortDirection: controlledSortDirection,
  onSortChange,
  pinnedColumnWidth = '180px',
}: DataTableProps<T>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Internal sort state if not controlled
  const [internalSortCol, setInternalSortCol] = useState<string | undefined>(undefined);
  const [internalSortDir, setInternalSortDir] = useState<SortDirection>('desc');

  const currentSortCol = controlledSortColumn !== undefined ? controlledSortColumn : internalSortCol;
  const currentSortDir = controlledSortDirection !== undefined ? controlledSortDirection : internalSortDir;

  const handleSort = (colId: string) => {
    let nextDir: SortDirection = 'desc';
    if (currentSortCol === colId) {
      nextDir = currentSortDir === 'desc' ? 'asc' : 'desc';
    }

    if (onSortChange) {
      onSortChange(colId, nextDir);
    } else {
      setInternalSortCol(colId);
      setInternalSortDir(nextDir);
    }
  };

  // Sort data internally if not controlled from outside
  const sortedData = useMemo(() => {
    if (onSortChange || !currentSortCol) return data;

    const col = columns.find((c) => c.id === currentSortCol);
    if (!col || !col.accessor) return data;

    return [...data].sort((a, b) => {
      const valA = col.accessor!(a);
      const valB = col.accessor!(b);

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return currentSortDir === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return currentSortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [data, columns, currentSortCol, currentSortDir, onSortChange]);

  const rowHeight = density === 'compact' ? 38 : 48;

  const virtualizer = useVirtualizer({
    count: isLoading ? loadingRowCount : sortedData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)]',
        className
      )}
    >
      <div
        ref={tableContainerRef}
        style={{ height: tableHeight, maxHeight: 'calc(100vh - 280px)' }}
        className="overflow-auto scrollbar-thin"
      >
        <table className="w-full border-collapse text-left">
          {/* Header Sticky */}
          <thead className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface-2)]">
            <tr>
              {columns.map((col, colIdx) => {
                const isPinned = col.pinned === 'left' || colIdx === 0;
                const isSorted = currentSortCol === col.id;

                return (
                  <th
                    key={col.id}
                    style={{
                      width: col.width,
                      minWidth: col.minWidth || (isPinned ? pinnedColumnWidth : undefined),
                      left: isPinned ? 0 : undefined,
                    }}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] select-none',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      col.sortable ? 'cursor-pointer hover:text-[var(--text-primary)] transition-colors' : '',
                      isPinned ? 'sticky z-30 bg-[var(--surface-2)] shadow-[2px_0_4px_rgba(0,0,0,0.3)] border-r border-[var(--border)]' : '',
                      col.headerClassName
                    )}
                    onClick={() => col.sortable && handleSort(col.id)}
                  >
                    <div
                      className={cn(
                        'inline-flex items-center gap-1',
                        col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="shrink-0 text-[var(--text-muted)]">
                          {isSorted ? (
                            currentSortDir === 'asc' ? (
                              <ChevronUp className="h-3 w-3 text-[var(--brand)]" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-[var(--brand)]" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {isLoading ? (
              // Skeletons
              Array.from({ length: loadingRowCount }).map((_, idx) => (
                <tr key={`skeleton-${idx}`} style={{ height: `${rowHeight}px` }}>
                  {columns.map((col, colIdx) => (
                    <td
                      key={`skel-col-${colIdx}`}
                      className={cn(
                        'px-3 py-2',
                        colIdx === 0 ? 'sticky left-0 bg-[var(--surface-1)] border-r border-[var(--border)]' : ''
                      )}
                    >
                      <div className="h-4 w-full max-w-[80%] animate-pulse rounded bg-[var(--surface-2)]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              // Empty State
              <tr>
                <td colSpan={columns.length} className="p-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-1.5">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{emptyTitle}</p>
                    <p className="text-xs text-[var(--text-muted)]">{emptySubtitle}</p>
                  </div>
                </td>
              </tr>
            ) : (
              // Virtualized Data Rows
              virtualizer.getVirtualItems().map((virtualRow) => {
                const row = sortedData[virtualRow.index];
                const rowKey = getRowId ? getRowId(row, virtualRow.index) : `row-${virtualRow.index}`;
                const isSelected = selectedRowId !== undefined && selectedRowId === rowKey;

                return (
                  <tr
                    key={rowKey}
                    data-index={virtualRow.index}
                    onClick={() => onRowClick && onRowClick(row)}
                    style={{
                      height: `${rowHeight}px`,
                      transform: `translateY(${virtualRow.start - virtualRow.index * rowHeight}px)`,
                    }}
                    className={cn(
                      'group transition-colors duration-100',
                      onRowClick ? 'cursor-pointer' : '',
                      isSelected
                        ? 'bg-[var(--surface-3)] font-semibold text-[var(--brand)]'
                        : 'hover:bg-[var(--surface-2)]/70'
                    )}
                  >
                    {columns.map((col, colIdx) => {
                      const isPinned = col.pinned === 'left' || colIdx === 0;
                      let cellContent: ReactNode = '—';

                      if (col.cell) {
                        cellContent = col.cell(row, virtualRow.index);
                      } else if (col.accessor) {
                        const val = col.accessor(row);
                        cellContent = val !== null && val !== undefined ? String(val) : '—';
                      }

                      return (
                        <td
                          key={col.id}
                          style={{
                            width: col.width,
                            minWidth: col.minWidth || (isPinned ? pinnedColumnWidth : undefined),
                            left: isPinned ? 0 : undefined,
                          }}
                          className={cn(
                            'whitespace-nowrap px-3 text-xs',
                            density === 'compact' ? 'py-1.5' : 'py-3',
                            col.align === 'right' ? 'text-right font-mono-tabular' : col.align === 'center' ? 'text-center' : 'text-left',
                            isPinned
                              ? 'sticky z-10 bg-[var(--surface-1)] group-hover:bg-[var(--surface-2)] shadow-[2px_0_4px_rgba(0,0,0,0.25)] border-r border-[var(--border)] transition-colors'
                              : '',
                            col.className
                          )}
                        >
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
