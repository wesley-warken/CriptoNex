import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('panel p-4', className)}>{children}</section>;
}
export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {right}
    </div>
  );
}
export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' | 'warn' }) {
  const color = tone === 'up' ? 'text-[var(--up)]' : tone === 'down' ? 'text-[var(--down)]' : tone === 'warn' ? 'text-[var(--warn)]' : '';
  return (
    <div className="panel p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('tabular text-xl font-bold', color)}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
export function Badge({ children, tone }: { children: ReactNode; tone?: 'up' | 'down' | 'warn' | 'accent' }) {
  const cls = tone === 'up' ? 'bg-[var(--up)]/15 text-[var(--up)]' : tone === 'down' ? 'bg-[var(--down)]/15 text-[var(--down)]' : tone === 'warn' ? 'bg-[var(--warn)]/15 text-[var(--warn)]' : 'bg-[var(--accent)]/15 text-[var(--accent)]';
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{children}</span>;
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-1 p-10 text-center">
      <div className="font-display text-lg font-semibold">{title}</div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel flex items-center justify-between gap-3 border-[var(--down)] p-4">
      <div className="text-sm"><strong>Fonte indisponível:</strong> {message}</div>
      {onRetry && <button onClick={onRetry} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:opacity-80">Tentar de novo</button>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-[var(--surface-2)]', className ?? 'h-24')} />;
}
