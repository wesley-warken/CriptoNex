import type { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label: string;
  value: string | number;
  change?: number | null;
  changeLabel?: string;
  subtext?: ReactNode;
  tone?: 'bull' | 'bear' | 'neutral' | 'warn' | 'brand';
  icon?: ReactNode;
  rightAction?: ReactNode;
  className?: string;
}

/**
 * KpiCard executivo e data-dense para terminais financeiros.
 * Sem cards aninhados; hairline 1px sutil; numerais mono tabulares.
 */
export function KpiCard({
  label,
  value,
  change,
  changeLabel,
  subtext,
  tone,
  icon,
  rightAction,
  className,
}: KpiCardProps) {
  // Infer tone if not provided but change is provided
  let computedTone = tone;
  if (!computedTone && typeof change === 'number') {
    if (change > 0) computedTone = 'bull';
    else if (change < 0) computedTone = 'bear';
    else computedTone = 'neutral';
  }

  const toneValueColor = {
    bull: 'text-[var(--bull-text)]',
    bear: 'text-[var(--bear-text)]',
    neutral: 'text-[var(--text-primary)]',
    warn: 'text-[var(--warn-text)]',
    brand: 'text-[var(--brand)]',
  }[computedTone || 'neutral'];

  return (
    <div
      className={cn(
        'relative flex flex-col justify-between overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-3.5 transition-all duration-150 hover:border-[var(--border-strong)]',
        className
      )}
    >
      {/* Header: Label + Icon / RightAction */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {label}
        </span>
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          {icon}
          {rightAction}
        </div>
      </div>

      {/* Main Metric Value & Change Pill */}
      <div className="my-2 flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'font-mono-tabular text-2xl font-bold tracking-tight text-[var(--text-primary)]',
            computedTone && computedTone !== 'neutral' ? toneValueColor : ''
          )}
        >
          {value}
        </span>

        {typeof change === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono-tabular text-[11px] font-bold',
              change > 0
                ? 'bg-[var(--bull-bg)] text-[var(--bull-text)]'
                : change < 0
                  ? 'bg-[var(--bear-bg)] text-[var(--bear-text)]'
                  : 'bg-[var(--neutral-bg)] text-[var(--neutral-text)]'
            )}
          >
            {change > 0 ? (
              <ArrowUpRight className="h-3 w-3 shrink-0" />
            ) : change < 0 ? (
              <ArrowDownRight className="h-3 w-3 shrink-0" />
            ) : (
              <Minus className="h-3 w-3 shrink-0" />
            )}
            {change > 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Footer / Context Subtext */}
      {(subtext || changeLabel) && (
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>{subtext}</span>
          {changeLabel && <span className="opacity-70">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
