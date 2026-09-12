import type { ReactNode } from 'react';

/**
 * Seção minimalista: eyebrow tipográfico + ação opcional à direita.
 * Substitui Panel/PanelTitle na exibição de dados (sem caixas).
 */
export function MSection({ title, right, children, label }: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label ?? title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</h2>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
