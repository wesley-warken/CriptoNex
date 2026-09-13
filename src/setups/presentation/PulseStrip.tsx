import { RefreshCw, Sparkles } from 'lucide-react';
import type { MarketPulse } from '../domain/pulse';
import type { AiState } from '../application/useMarketPulse';
import { shortTime, signedPct } from './format';

export interface PulseStripProps {
  pulse: MarketPulse | null;
  updatedAt: number | null;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  ai: AiState;
  aiQuota: string;
  onAiSummary: () => void;
}

function Metric({ label, value, trend }: { label: string; value: number | null; trend: string | null }) {
  const tone = value == null ? 'text-[var(--text-muted)]' : value >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]';
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="flex items-baseline gap-2">
        {trend && <span className={`text-xs ${tone}`}>{trend}</span>}
        <span className={`tabular-nums text-sm font-semibold ${tone}`}>{signedPct(value)}</span>
      </dd>
    </div>
  );
}

function Leg({ title, source, d7, d30, t30, foot }: {
  title: string; source: string;
  d7: number | null; d30: number | null; t30: string | null;
  foot: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        <span className="text-xs text-[var(--text-muted)]">{source}</span>
      </div>
      <dl className="mt-1 divide-y divide-[var(--border)]">
        <Metric label="7 dias · semanal" value={d7} trend={null} />
        <Metric label="30 dias · mensal" value={d30} trend={t30} />
      </dl>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{foot}</p>
    </div>
  );
}

/**
 * Pulso do mercado: três pernas comparáveis, separadas por divisória.
 * Sem cards, sem pills coloridas — só número, tom semântico e fonte.
 */
export function PulseStrip(props: PulseStripProps) {
  const { pulse, updatedAt, stale, refreshing, onRefresh, ai, aiQuota, onAiSummary } = props;
  return (
    <section aria-label="Pulso do mercado">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Pulso do mercado · 7d e 30d
        </h2>
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          {updatedAt != null && <span className="tabular-nums">atualizado {shortTime(updatedAt)}{stale ? ' · vencido' : ''}</span>}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
            {refreshing ? 'Atualizando' : 'Atualizar'}
          </button>
          <button
            type="button"
            onClick={onAiSummary}
            disabled={ai.busy}
            title="Resumo em linguagem natural (conta na cota diária)"
            className="inline-flex items-center gap-1.5 transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles size={14} />
            {ai.busy ? 'Resumindo' : 'Resumo IA'}
          </button>
          <span className="tabular-nums" title="Teto diário do plano gratuito">IA {aiQuota}</span>
        </div>
      </div>
      {pulse ? (
        <div className="mt-4 grid gap-6 md:grid-cols-3 md:divide-x md:divide-[var(--border)] md:[&>*:not(:first-child)]:pl-6">
          <Leg
            title="Cripto · BTC" source="candles locais"
            d7={pulse.btc.ret7d} d30={pulse.btc.ret30d} t30={pulse.btc.trend30}
            foot={`Amplitude das altcoins: breadth ${pulse.breadth} (${pulse.breadthTone}).`}
          />
          <Leg
            title="Ações BR · Ibovespa" source="Yahoo · 6m diário"
            d7={pulse.br.ret7d} d30={pulse.br.ret30d} t30={pulse.br.trend30}
            foot="Recalcula sozinho após 7 dias."
          />
          <Leg
            title="Ações EUA · S&P 500" source="Yahoo · 6m diário"
            d7={pulse.us.ret7d} d30={pulse.us.ret30d} t30={pulse.us.trend30}
            foot="Recalcula sozinho após 7 dias."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-[var(--surface-2)]" />)}
        </div>
      )}
      {(ai.busy || ai.text || ai.error) && (
        <div className="mt-4 rounded border-l-2 border-[var(--brand)] bg-[var(--surface-2)] p-3">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Resumo IA · os números acima valem</p>
          {ai.busy && <p className="mt-1 text-sm text-[var(--text-muted)]">Resumindo…</p>}
          {ai.error && <p className="mt-1 text-sm text-[var(--bear)]">{ai.error}</p>}
          {ai.badge && ai.text && <p className="mt-1 text-xs text-[var(--text-muted)]">({ai.badge})</p>}
          {ai.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{ai.text}</p>}
        </div>
      )}
    </section>
  );
}
