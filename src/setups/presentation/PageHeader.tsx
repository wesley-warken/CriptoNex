import type { RegimeTone } from '../domain/entities';
import { signedPct } from './format';

export interface HeaderStats {
  btcLabel: string;
  btcDelta30d: number | null;
  altLabel: string;
  breadth: number;
  regimeLabel: string;
  regimeTone: RegimeTone;
  qualityCount: number;
  horizonLabel: string;
}

const DOT: Record<RegimeTone, string> = {
  on: 'bg-[var(--bull)]',
  off: 'bg-[var(--bear)]',
  flat: 'bg-[var(--text-muted)]',
};

/**
 * Cabeçalho: título por tipografia + faixa inline de stats.
 * Hierarquia por tamanho/peso/tracking — nenhuma caixa, nenhum card.
 */
export function PageHeader({ stats }: { stats: HeaderStats }) {
  return (
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Terminal · Setups técnicos
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        Setups <span className="font-normal text-[var(--text-muted)]">· {stats.horizonLabel}</span>
      </h1>
      <p className="mt-1 max-w-[62ch] text-sm leading-6 text-[var(--text-muted)]">
        Plano hipotético por ativo. Score é ranking técnico, não probabilidade de lucro.
      </p>
      <dl className="mt-5 flex flex-wrap divide-x divide-[var(--border)] border-y border-[var(--border)] py-4">
        <div className="pr-6">
          <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Bitcoin</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {stats.btcLabel}{' '}
            <span className={`tabular-nums font-normal ${stats.btcDelta30d != null && stats.btcDelta30d < 0 ? 'text-[var(--bear)]' : 'text-[var(--bull)]'}`}>
              {signedPct(stats.btcDelta30d)} · 30d
            </span>
          </dd>
        </div>
        <div className="px-6">
          <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Altcoins</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {stats.altLabel}{' '}
            <span className="tabular-nums font-normal text-[var(--text-secondary)]">breadth {stats.breadth}</span>
          </dd>
        </div>
        <div className="px-6">
          <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Regime</dt>
          <dd className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[stats.regimeTone]}`} aria-hidden="true" />
            {stats.regimeLabel}
          </dd>
        </div>
        <div className="pl-6">
          <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Qualidade</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            <span className="tabular-nums">{stats.qualityCount}</span>{' '}
            <span className="font-normal text-[var(--text-secondary)]">elite + forte</span>
          </dd>
        </div>
      </dl>
    </header>
  );
}
