import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export interface TerminalTabsProps<T extends string = string> {
  tabs: readonly TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  variant?: 'underline' | 'pill' | 'segmented';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * TerminalTabs: Abas de navegação padronizadas para o terminal.
 * Variantes:
 * - 'underline': Linha ativa inferior com brilho sutil (padrão para abas principais como o Radar).
 * - 'segmented': Segmentos conectados com fundo elevado para seletores de universo e timeframe.
 * - 'pill': Pílulas discretas independentes.
 */
export function TerminalTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'sm',
  className,
}: TerminalTabsProps<T>) {
  if (variant === 'segmented') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] p-0.5',
          className
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs font-semibold transition-all duration-150 select-none disabled:opacity-40',
                isActive
                  ? 'bg-[var(--brand)] text-white font-semibold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-mono-tabular font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 select-none disabled:opacity-40',
                isActive
                  ? 'bg-[var(--brand)] text-white font-semibold'
                  : 'border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-mono-tabular font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Underline variant (Default)
  return (
    <div
      className={cn(
        'flex items-center gap-2 overflow-x-auto border-b border-[var(--border)] scrollbar-none',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              'group relative inline-flex items-center gap-1.5 whitespace-nowrap pb-2.5 pt-1 text-xs font-semibold transition-colors duration-150 select-none disabled:opacity-40',
              size === 'sm' ? 'px-2.5 text-xs' : 'px-3.5 text-sm',
              isActive
                ? 'text-[var(--text-primary)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-mono-tabular font-bold',
                  isActive
                    ? 'bg-[var(--brand-muted)] text-[var(--brand)]'
                    : 'bg-[var(--surface-2)] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                )}
              >
                {tab.badge}
              </span>
            )}

            {/* Active underline indicator */}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[var(--brand)] shadow-[0_0_8px_var(--brand-glow)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
