import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Painel principal do terminal (Card 10px radius, 1px border sutil 8-12%, superfície-1).
 */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-4 transition-colors duration-150', className)}>
      {children}
    </section>
  );
}

/**
 * Cabeçalho de painel com título micro maiúsculo e ação opcional à direita.
 */
export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {children}
      </h2>
      {right}
    </div>
  );
}

/** Micro-rótulo condensado maiúsculo do terminal. */
export function Micro({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]', className)}>
      {children}
    </span>
  );
}

/**
 * Métrica individual (Stat) com valor mono tabular e suporte a cores semânticas.
 */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'up' | 'down' | 'warn' | 'bull' | 'bear';
}) {
  const color =
    tone === 'up' || tone === 'bull'
      ? 'text-[var(--bull-text)]'
      : tone === 'down' || tone === 'bear'
        ? 'text-[var(--bear-text)]'
        : tone === 'warn'
          ? 'text-[var(--warn-text)]'
          : 'text-[var(--text-primary)]';

  return (
    <div className="border-b border-[var(--border-subtle)] pb-2.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
      <div className={cn('font-mono-tabular text-2xl font-bold leading-tight tracking-tight', color)}>{value}</div>
      {sub && <div className="font-mono-tabular text-xs text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Badge do terminal — fundo a 12% de opacidade + texto a 100%.
 */
export function Badge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: 'up' | 'down' | 'warn' | 'accent' | 'bull' | 'bear' | 'neutral' | 'brand';
  className?: string;
}) {
  const cls =
    tone === 'up' || tone === 'bull'
      ? 'bg-[var(--bull-bg)] text-[var(--bull-text)]'
      : tone === 'down' || tone === 'bear'
        ? 'bg-[var(--bear-bg)] text-[var(--bear-text)]'
        : tone === 'warn'
          ? 'bg-[var(--warn-bg)] text-[var(--warn-text)]'
          : tone === 'brand' || tone === 'accent'
            ? 'bg-[var(--brand-muted)] text-[var(--brand)]'
            : 'bg-[var(--neutral-bg)] text-[var(--neutral-text)]';

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide transition-colors', cls, className)}>
      {children}
    </span>
  );
}

/**
 * Botão padrão do terminal (6px radius, foco nítido, 150ms).
 */
export function Btn({
  children,
  onClick,
  title,
  variant = 'ghost',
  type = 'button',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-[var(--brand)] font-bold text-black hover:brightness-110 shadow-sm'
      : variant === 'danger'
        ? 'border border-[var(--bear)]/40 bg-[var(--bear-bg)] text-[var(--bear-text)] hover:bg-[var(--bear-bg)]/80'
        : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]';

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn('inline-flex items-center justify-center rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-all duration-150 select-none disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]', cls, className)}
    >
      {children}
    </button>
  );
}

/**
 * Controle segmentado em banco (abas de opção): um segmento aceso por vez.
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  title,
  className,
}: {
  options: readonly { k: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={cn(
            'rounded-[4px] px-2.5 py-1 text-xs font-semibold transition-all duration-150 select-none',
            o.k === value
              ? 'bg-[var(--brand)] text-black font-bold shadow-sm'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * EmptyState: Ensina a interface e orienta o usuário quando não há dados.
 */
export function Empty({ title, hint, className }: { title: string; hint?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] p-10 text-center', className)}>
      <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
      {hint && <div className="max-w-[60ch] text-xs text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
}

/**
 * ErrorBox: Exibe falha com motivo claro e botão de ação para tentar novamente.
 */
export function ErrorBox({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-[10px] border border-[var(--bear)]/40 bg-[var(--bear-bg)] p-3.5 text-xs text-[var(--text-primary)]', className)}>
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--bear)]" />
        <div>
          <strong className="text-[var(--bear-text)]">Fonte indisponível: </strong>
          <span className="text-[var(--text-secondary)]">{message}</span>
        </div>
      </div>
      {onRetry && (
        <Btn onClick={onRetry} className="shrink-0">
          <RefreshCw className="mr-1 h-3 w-3" /> Tentar de novo
        </Btn>
      )}
    </div>
  );
}

/**
 * Skeleton loader com animação suave de pulso.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[6px] bg-[var(--surface-2)]', className ?? 'h-24')} />;
}
