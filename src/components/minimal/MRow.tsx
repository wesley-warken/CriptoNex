/**
 * Linha de definição: rótulo micro à esquerda, valor tabular à direita.
 * Divisória de 1px; base para painéis de detalhe e listas densas.
 */
export function MRow({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
      <dd className="text-right tabular-nums text-[var(--text-primary)] font-medium">
        {v}
        {sub && <span className="text-xs text-[var(--text-secondary)]"> · {sub}</span>}
      </dd>
    </div>
  );
}
