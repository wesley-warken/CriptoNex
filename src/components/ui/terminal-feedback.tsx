import { useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Skeleton Loader para dados tabulares e cards.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[4px] bg-[var(--surface-2)]',
        className || 'h-4 w-full'
      )}
    />
  );
}

/**
 * EmptyState: Exibido quando buscas ou filtros não encontram registros.
 */
export function EmptyState({
  title = 'Nenhum resultado encontrado',
  description = 'Ajuste os filtros ou o termo de busca para visualizar os ativos.',
  icon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-8 text-center',
        className
      )}
    >
      {icon && <div className="mb-3 text-[var(--text-muted)]">{icon}</div>}
      <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * ErrorState: Alerta com explicação objetiva e ação de recuperação (retry).
 */
export function ErrorState({
  title = 'Falha ao carregar dados',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-[8px] border border-[var(--bear)]/40 bg-[var(--bear-bg)] p-3.5 text-xs text-[var(--text-primary)]',
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--bear)]" />
        <div>
          <strong className="font-semibold text-[var(--bear-text)]">{title}: </strong>
          <span className="text-[var(--text-secondary)]">{message || 'Serviço temporariamente indisponível.'}</span>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Tentar novamente</span>
        </button>
      )}
    </div>
  );
}

/**
 * Tooltip nativo ultra-leve sem dependências pesadas.
 */
export function Tooltip({
  content,
  children,
  position = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [visible, setVisible] = useState(false);

  const posClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[position];

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-lg animate-in fade-in zoom-in-95 duration-100',
            posClasses
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/**
 * Toast simples do terminal.
 */
export function Toast({
  message,
  tone = 'neutral',
  onClose,
}: {
  message: string;
  tone?: 'bull' | 'bear' | 'neutral' | 'warn' | 'brand';
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-3)] px-3 py-2 text-xs font-semibold shadow-xl'
      )}
    >
      <span className="text-[var(--text-primary)]">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Botão padrão do terminal financeiro com 6px border-radius e estados de foco.
 */
export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'sm',
  disabled = false,
  title,
  icon,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}) {
  const variantStyles = {
    primary: 'bg-[var(--brand)] text-black font-bold hover:brightness-110 shadow-sm',
    secondary: 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--border-strong)]',
    ghost: 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
    danger: 'border border-[var(--bear)]/40 bg-[var(--bear-bg)] text-[var(--bear-text)] hover:bg-[var(--bear-bg)]/80',
    brand: 'bg-[var(--brand)] text-black font-bold hover:bg-[var(--brand-hover)]',
  }[variant];

  const sizeStyles = {
    xs: 'px-2 py-0.5 text-[11px] gap-1 rounded-[4px]',
    sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-[6px]',
    md: 'px-3.5 py-1.5 text-xs font-semibold gap-2 rounded-[6px]',
  }[size];

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-150 select-none disabled:opacity-40 disabled:pointer-events-none',
        variantStyles,
        sizeStyles,
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
