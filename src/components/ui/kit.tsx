import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('panel p-4', className)}>{children}</section>;
}
export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{children}</h2>
      {right}
    </div>
  );
}
/** Micro-rótulo condensado maiúsculo da parede LED. */
export function Micro({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[11px] font-bold uppercase tracking-[0.14em] text-muted', className)}>{children}</span>;
}
export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' | 'warn' }) {
  const color = tone === 'up' ? 'text-[var(--up)]' : tone === 'down' ? 'text-[var(--down)]' : tone === 'warn' ? 'text-[var(--warn)]' : '';
  return (
    <div className="border-b border-[var(--border)] pb-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={cn('tabular text-2xl font-bold leading-tight', color)}>{value}</div>
      {sub && <div className="tabular text-xs text-muted">{sub}</div>}
    </div>
  );
}
export function Badge({ children, tone }: { children: ReactNode; tone?: 'up' | 'down' | 'warn' | 'accent' }) {
  const cls = tone === 'up' ? 'bg-[var(--up)]/15 text-[var(--up)]' : tone === 'down' ? 'bg-[var(--down)]/15 text-[var(--down)]' : tone === 'warn' ? 'bg-[var(--warn)]/15 text-[var(--warn)]' : 'bg-[var(--accent)]/15 text-[var(--accent)]';
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold', cls)}>{children}</span>;
}
/** Botão padrão do terminal: mesma forma em todas as telas. */
export function Btn({ children, onClick, title, variant = 'ghost', type = 'button', disabled }: {
  children: ReactNode; onClick?: () => void; title?: string; variant?: 'primary' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean;
}) {
  const cls = variant === 'primary'
    ? 'bg-[var(--accent)] font-bold text-black hover:opacity-85 disabled:opacity-40'
    : variant === 'danger'
      ? 'border-[var(--down)] text-[var(--down)] hover:bg-[var(--down)]/10 disabled:opacity-40'
      : 'border-[var(--border)] text-muted hover:text-white disabled:opacity-40';
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick}
      className={cn('rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold', cls)}>
      {children}
    </button>
  );
}
/** Controle segmentado em banco (abas de opção): um segmento aceso por vez. */
export function Seg<T extends string>({ options, value, onChange, title }: {
  options: readonly { k: T; label: string }[]; value: T; onChange: (k: T) => void; title?: string;
}) {
  return (
    <span title={title} className="inline-flex items-center overflow-hidden rounded-md border border-[var(--border)]">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={o.k === value
            ? 'bg-[var(--accent)] px-2.5 py-1.5 text-xs font-bold text-black'
            : 'px-2.5 py-1.5 text-xs font-semibold text-muted hover:text-white'}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-1 p-10 text-center">
      <div className="text-lg font-bold">{title}</div>
      {hint && <div className="max-w-[60ch] text-sm text-muted">{hint}</div>}
    </div>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel flex items-center justify-between gap-3 border-[var(--down)] p-4">
      <div className="text-sm"><strong>Fonte indisponível:</strong> {message}</div>
      {onRetry && <Btn onClick={onRetry}>Tentar de novo</Btn>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--surface-2)]', className ?? 'h-24')} />;
}
