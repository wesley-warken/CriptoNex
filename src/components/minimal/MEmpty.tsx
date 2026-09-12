/**
 * Estado vazio composto: nunca painel em branco. Título + motivo + ação.
 */
export function MEmpty({ title, hint, actionLabel, onAction }: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-12 text-center rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--surface-1)]">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-[52ch] text-sm leading-6 text-[var(--text-muted)]">{hint}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 text-sm font-medium text-[var(--brand)] hover:underline underline-offset-4 transition-colors duration-150 ease-out active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
