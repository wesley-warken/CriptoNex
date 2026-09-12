import { useEffect, useMemo, useState } from 'react';
import { HORIZONS } from '@/engine/horizon/horizons';
import { useStore } from '@/stores/useStore';
import { qualityOf } from '../domain/entities';
import { facetCounts } from '../domain/filters';
import { rankSetupsView } from '../application/usecases';
import { useFilters } from '../application/useFilters';
import { useMarketPulse } from '../application/useMarketPulse';
import { useSetups } from '../application/useSetups';
import { useSetupAi } from '../application/useSetupAi';
import { FilterBar } from './FilterBar';
import { FilterChips } from './FilterChips';
import { PageHeader } from './PageHeader';
import { PulseStrip } from './PulseStrip';
import { SetupPanel } from './SetupPanel';
import { SetupProgress } from './SetupProgress';
import { SetupsTable } from './SetupsTable';

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * presentation/SetupsPage — composição do dashboard.
 * Só cola hooks e componentes burros; nenhuma regra de negócio no JSX.
 */
export function SetupsPage() {
  const filters = useFilters();
  const { state, liveQuery } = filters;
  const pipe = useSetups(state.horizon);
  const { market, analysis } = pipe;
  const pulse = useMarketPulse(market, analysis);
  const setupAi = useSetupAi();
  const favorites = useStore((s) => s.favorites);
  const toggleFav = useStore((s) => s.toggleFav);
  const [selected, setSelected] = useState<string | null>(null);

  const ranked = useMemo(
    () => rankSetupsView(pipe.opps, { ...state, query: liveQuery }),
    [pipe.opps, state, liveQuery],
  );
  const facets = useMemo(
    () => facetCounts(pipe.opps, { ...state, query: liveQuery }),
    [pipe.opps, state, liveQuery],
  );
  const qualityCount = useMemo(
    () => pipe.opps.filter((o) => qualityOf(o.score) !== 'base').length,
    [pipe.opps],
  );
  const selectedSetup = selected ? (ranked.find((o) => o.symbol === selected) ?? null) : null;

  useEffect(() => {
    if (selected && !ranked.some((o) => o.symbol === selected)) setSelected(null);
  }, [selected, ranked]);

  if (market.loading && pipe.opps.length === 0) {
    return (
      <div className="px-4 py-8 text-[var(--text-secondary)] sm:px-6">
        <div className="mx-auto max-w-6xl space-y-4" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-[var(--surface-2)]" />)}
        </div>
      </div>
    );
  }
  if (market.error && market.data.length === 0 && pipe.opps.length === 0) {
    return (
      <div className="px-4 py-8 text-[var(--text-secondary)] sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-[var(--bear)]">Fonte indisponível: {market.error}</p>
          <button
            type="button"
            onClick={pipe.retry}
            className="mt-2 text-sm text-[var(--brand)] underline underline-offset-4 transition-colors duration-150 ease-out hover:opacity-80"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const p = pulse.pulse;
  return (
    <div className="text-[var(--text-secondary)]">
      {pipe.loading && <SetupProgress pct={pipe.pct} />}
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        <PageHeader
          stats={{
            btcLabel: p?.btc.trend30 ?? '—',
            btcDelta30d: p?.btc.ret30d ?? null,
            altLabel: p ? cap(p.breadthTone) : '—',
            breadth: p?.breadth ?? analysis.regime.breadth,
            regimeLabel: analysis.regime.label,
            regimeTone: p?.regimeTone ?? 'flat',
            qualityCount,
            horizonLabel: HORIZONS[state.horizon].label,
          }}
        />

        <PulseStrip
          pulse={p}
          updatedAt={pulse.updatedAt}
          stale={pulse.stale}
          refreshing={pulse.refreshing}
          onRefresh={pulse.refresh}
          ai={pulse.ai}
          aiQuota={pulse.aiQuota}
          onAiSummary={pulse.runAiSummary}
        />

        <section aria-label="Filtros" className="space-y-3">
          <FilterBar
            filters={state}
            facets={facets}
            liveStatus={pipe.statusLine}
            onPatch={filters.set}
            onPreset={filters.preset}
          />
          <FilterChips
            filters={state}
            liveQuery={liveQuery}
            onRemove={filters.set}
            onClear={filters.clear}
          />
        </section>

        <section aria-label="Setups">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Setups · {HORIZONS[state.horizon].label}
            </h2>
            <span className="tabular-nums text-xs text-[var(--text-muted)]">
              {ranked.length} setups
            </span>
          </div>
          <div className={`mt-3 ${selectedSetup ? 'grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
            <div className="min-w-0">
              {ranked.length > 0 ? (
                <SetupsTable
                  rows={ranked.slice(0, 200)}
                  logos={pipe.logos}
                  favorites={favorites}
                  onToggleFav={toggleFav}
                  selected={selected}
                  onSelect={(s) => setSelected((cur) => (cur === s ? null : s))}
                />
              ) : (
                <div className="py-10 text-center">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {pipe.loading ? 'Analisando…' : pipe.opps.length === 0 ? 'Sem dados' : 'Nada passa no funil'}
                  </p>
                  {!pipe.loading && (
                    <p className="mx-auto mt-1 max-w-[52ch] text-sm leading-6 text-[var(--text-muted)]">
                      {pipe.opps.length === 0
                        ? 'A análise ainda não voltou. Tente de novo em instantes.'
                        : state.regimeAligned
                          ? 'Nenhum setup a favor do vento. Desligue o alinhamento ao regime ou limpe os filtros.'
                          : 'Ajuste o funil ou limpe tudo para ver o universo inteiro.'}
                    </p>
                  )}
                  {!pipe.loading && (
                    <button
                      type="button"
                      onClick={() => (pipe.opps.length === 0 ? pipe.retry() : filters.clear())}
                      className="mt-3 text-sm text-[var(--brand)] underline underline-offset-4 transition-colors duration-150 ease-out hover:opacity-80"
                    >
                      {pipe.opps.length === 0 ? 'Tentar de novo' : 'Limpar filtros'}
                    </button>
                  )}
                </div>
              )}
              {ranked.length > 200 && (
                <p className="py-3 text-center text-xs tabular-nums text-[var(--text-muted)]">
                  Mostrando 200 de {ranked.length} — refine o funil.
                </p>
              )}
            </div>
            {selectedSetup && (
              <SetupPanel
                setup={selectedSetup}
                logo={pipe.logos.get(selectedSetup.symbol)}
                ai={setupAi.bySymbol[selectedSetup.symbol] ?? { busy: false, text: null, error: null }}
                onAnalyze={() => setupAi.analyze(selectedSetup)}
                onClose={() => setSelected(null)}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
