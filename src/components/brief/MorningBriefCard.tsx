import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/terminal-dialogs';
import type { MorningBriefState } from './useMorningBrief';

/** Render do brief: âncoras em destaque, bullets e parágrafos longos com quebra segura. */
function BriefBody({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {text.split('\n').filter((l) => l.trim()).map((line, i) => {
        const t = line.trim();
        const head = /^[🎯📊🎨⚠️]/.test(t);
        const isBullet = /^[-•]\s/.test(t) || /^\d+\.\s/.test(t);
        return (
          <p
            key={i}
            className={
              head
                ? 'break-words text-sm font-semibold leading-6 text-[var(--text-primary)]'
                : isBullet
                  ? 'ml-4 break-words hyphens-auto text-sm leading-6 text-[var(--text-secondary)]'
                  : 'break-words hyphens-auto text-sm leading-6 text-[var(--text-secondary)]'
            }
          >
            {t}
          </p>
        );
      })}
    </div>
  );
}

/**
 * MorningBriefCard — card compacto no Dashboard; clique abre o resumo
 * completo (modal). Template determinístico imediato; IA (Flash) sob clique.
 */
export function MorningBriefCard({ brief }: { brief: MorningBriefState }) {
  return (
    <>
      <section
        role="button"
        tabIndex={0}
        aria-label="Abrir Morning Market Brief"
        onClick={() => brief.setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') brief.setOpen(true); }}
        className="cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 shadow-sm transition-colors hover:bg-[var(--surface-2)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Morning Brief · abertura US
              </span>
              {brief.isNew && (
                <span className="rounded border border-[var(--brand)] px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">
                  Abertura US
                </span>
              )}
            </div>
            {brief.loading ? (
              <div className="mt-1.5 h-4 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
            ) : brief.headline ? (
              <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">{brief.headline}</p>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-muted)]">{brief.loadError ?? 'Abrir resumo da manhã'}</p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)]">
            Abrir resumo <ChevronRight size={14} />
          </span>
        </div>
      </section>

      <Modal
        isOpen={brief.open}
        onClose={() => brief.setOpen(false)}
        title="Morning Market Brief · US Open"
        subtitle={brief.briefTier === 'flash' ? 'gerado com IA (Flash)' : brief.briefBadge ? `(${brief.briefBadge})` : undefined}
        maxWidth="2xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-[var(--text-muted)]" title="Cota diária do Flash (reserva do brief incluída)">
              IA Flash {brief.quotaNote}
            </span>
            <div className="flex items-center gap-2">
              <Link to="/radar" className="text-xs text-[var(--brand)] hover:underline">Radar</Link>
              <Link to="/setups" className="text-xs text-[var(--brand)] hover:underline">Setups</Link>
              <Link to="/news" className="text-xs text-[var(--brand)] hover:underline">News</Link>
              <button
                type="button"
                onClick={brief.generateAi}
                disabled={brief.briefBusy || brief.briefTier === 'flash'}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <Sparkles size={13} />
                {brief.briefBusy ? 'Gerando…' : brief.briefTier === 'flash' ? 'Versão IA ativa' : 'Gerar com IA'}
              </button>
            </div>
          </div>
        }
      >
        {brief.briefError && (
          <p className="mb-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            {brief.briefError}
          </p>
        )}
        {brief.briefText ? <BriefBody text={brief.briefText} /> : (
          <p className="text-sm text-[var(--text-muted)]">Carregando dados da abertura…</p>
        )}
      </Modal>
    </>
  );
}
