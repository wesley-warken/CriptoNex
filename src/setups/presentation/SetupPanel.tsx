import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { CoinLogo } from '@/components/ui/coin-logo';
import type { Setup } from '../domain/entities';
import type { AiState } from '../application/useMarketPulse';
import { price, setupShort, signedPct } from './format';

export interface SetupPanelProps {
  setup: Setup;
  logo: string | undefined;
  ai: AiState;
  onAnalyze: () => void;
  onClose: () => void;
}

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-1.5 text-sm">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
      <dd className="text-right tabular-nums text-[var(--text-primary)]">
        {v}
        {sub && <span className="text-xs text-[var(--text-muted)]"> · {sub}</span>}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h4>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/**
 * Painel lateral do setup: tese, invalidação e evidência.
 * Estático e estreito — sem modal, sem animação de entrada.
 */
export function SetupPanel({ setup: o, logo, ai, onAnalyze, onClose }: SetupPanelProps) {
  const ev = o.evidence;
  return (
    <aside aria-label={`Detalhe de ${o.symbol}`} className="xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CoinLogo symbol={o.symbol} image={logo} size={28} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
              {o.symbol} <span className="tabular-nums font-normal text-[var(--text-secondary)]">{price(o.price)}</span>
            </h3>
            <p className="truncate text-xs text-[var(--text-muted)]">{o.name} · {setupShort(o.setup)} · score {o.score}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhe"
          className="rounded-md p-1.5 text-[var(--text-muted)] transition-all duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 space-y-5">
        <Section title="Plano">
          <dl>
            <Row k="Entrada" v={o.entryLow != null ? `${price(o.entryLow)} – ${price(o.entryHigh)}` : '—'} sub={o.entryIdeal != null ? `ideal ${price(o.entryIdeal)}` : undefined} />
            <Row k="Stop" v={price(o.stop)} sub={o.stopPct != null ? signedPct(o.stopPct) : undefined} />
            <Row k="Alvos" v={`${price(o.t1)} / ${price(o.t2)} / ${price(o.t3)}`} />
            <Row
              k="R:R"
              v={`${o.rr1 != null ? o.rr1.toFixed(1) : '—'} / ${o.rr2 != null ? o.rr2.toFixed(1) : '—'} / ${o.rr3 != null ? o.rr3.toFixed(1) : '—'}`}
            />
            <Row k="Base" v={o.basePct != null ? signedPct(o.basePct) : '—'} sub="entrada → alvo 2" />
          </dl>
        </Section>

        <Section title="Tese">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
            {o.why.map((w) => <li key={w}>{w}</li>)}
          </ul>
          {o.risks.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--text-muted)]">
              {o.risks.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </Section>

        <Section title="Invalidação">
          {o.invalidation.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--text-secondary)]">
              {o.invalidation.map((w) => <li key={w}>{w}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Sem base (plano inválido).</p>
          )}
        </Section>

        <Section title="Evidência">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {ev == null || ev.n < 30 ? (
              <span className="text-[var(--text-muted)]">Insuficiente (N={ev?.n ?? 0}, mínimo 30).</span>
            ) : (
              <span className="tabular-nums">
                {ev.label}: N={ev.n} · hit {ev.hit != null ? `${(ev.hit * 100).toFixed(0)}%` : '—'} · R:R {ev.rr != null ? ev.rr.toFixed(2) : '—'}
              </span>
            )}
          </p>
          {!o.demandPass && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">Sem demanda comprovada{o.demandNote ? `: ${o.demandNote}` : ''}.</p>
          )}
        </Section>

        <Section title="Análise IA">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={ai.busy}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-all duration-150 ease-out hover:text-[var(--brand)] active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles size={14} aria-hidden="true" />
            {ai.busy ? 'Analisando…' : ai.text ? 'Analisar de novo' : 'Analisar setup'}
          </button>
          {ai.error && <p className="mt-1 text-sm text-[var(--bear)]">{ai.error}</p>}
          {ai.badge && ai.text && <p className="mt-1 text-xs text-[var(--text-muted)]">({ai.badge})</p>}
          {ai.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{ai.text}</p>}
        </Section>

        <Link
          to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`}
          className="inline-block text-sm text-[var(--brand)] underline underline-offset-4 transition-colors duration-150 ease-out hover:opacity-80"
        >
          Abrir no monitor
        </Link>
      </div>
    </aside>
  );
}
