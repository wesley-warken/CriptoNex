/**
 * Faixa inline de stats: rótulo · número · delta, sem cards.
 * Hierarquia por tipografia; seções separadas por divisória de 1px.
 */
export interface StatItem {
  label: string;
  value: string;
  sub?: string;
  /** Cor semântica do valor; omitir = branco. */
  tone?: 'up' | 'down' | 'muted';
  numeric?: boolean;
}

const TONE: Record<NonNullable<StatItem['tone']>, string> = {
  up: 'text-[var(--bull)]',
  down: 'text-[var(--bear)]',
  muted: 'text-[var(--text-muted)]',
};

export function MStats({ items }: { items: StatItem[] }) {
  return (
    <dl className="flex flex-wrap divide-x divide-[var(--border)] border border-[var(--border)] bg-[var(--surface-1)] py-3 px-2 rounded-[8px] shadow-sm">
      {items.map((it) => (
        <div key={it.label} className="px-5 first:pl-2 last:pr-2 min-w-[140px] flex-1">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{it.label}</dt>
          <dd className={`mt-1 text-sm font-semibold ${it.tone ? TONE[it.tone] : 'text-[var(--text-primary)]'}`}>
            <span className={it.numeric === false ? undefined : 'tabular-nums'}>{it.value}</span>
            {it.sub && <span className="ml-1.5 text-xs font-normal tabular-nums text-[var(--text-secondary)]">{it.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Badge de texto com dot colorido (regime/status), sem gauge nem pill. */
export function MDot({ tone, children }: {
  tone: 'up' | 'down' | 'flat';
  children: string;
}) {
  const dot = tone === 'up' ? 'bg-[var(--bull)]' : tone === 'down' ? 'bg-[var(--bear)]' : 'bg-[var(--neutral)]';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] px-2 py-0.5 rounded-[4px] bg-[var(--surface-2)] border border-[var(--border)]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}
