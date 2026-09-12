import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowUpRight, ArrowDownRight, Star } from 'lucide-react';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { geckoGlobal, geckoHistory30d } from '@/services/providers/coingecko';
import { fearGreed, fgLabel } from '@/services/providers/sentiment';
import { yahooChart } from '@/services/lookup';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { Sparkline } from '@/components/charts/Sparkline';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { MorningBriefCard } from '@/components/brief/MorningBriefCard';
import { useMorningBrief } from '@/components/brief/useMorningBrief';
import { MStats } from '@/components/minimal/MStats';
import { MSection } from '@/components/minimal/MSection';
import { MEmpty } from '@/components/minimal/MEmpty';
import { fmtUSD, fmtPct, fmtNum, fmtPrice, timeAgo } from '@/lib/format';
import { summarize, totals } from '@/lib/portfolio';
import { rankOpportunities } from '@/engine/ranking';

export function Dashboard() {
  const refreshSec = useStore((s) => s.refreshSec);
  const watchlist = useStore((s) => s.watchlist);
  const operations = useStore((s) => s.operations);
  const m = useCryptoMarket(refreshSec);
  const a = useAnalysis(m.data, m.candles);

  const [global, setGlobal] = useState<{ btcDominance: number; totalMcap: number } | null>(null);
  const [hist, setHist] = useState<{ btc: number[]; eth: number[] }>({ btc: [], eth: [] });
  const [fg, setFg] = useState<number | null>(null);
  const [gold, setGold] = useState<{ price: number | null; spark: number[] }>({ price: null, spark: [] });
  const brief = useMorningBrief(m.data, a.regime.label, a.regime.breadth, hist.btc);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await geckoGlobal();
        if (alive) setGlobal(g);
      } catch {
        /* painel global é complementar */
      }
      try {
        const [b, e] = await Promise.all([geckoHistory30d('bitcoin'), geckoHistory30d('ethereum')]);
        if (alive) setHist({ btc: b, eth: e });
      } catch {
        /* sem histórico */
      }
      try {
        const f = await fearGreed(2);
        if (alive) setFg(f.current);
      } catch {
        /* sem F&G */
      }
      try {
        const g = await yahooChart('GC=F', '1mo', '1d');
        if (alive) setGold({ price: g.price, spark: g.candles.map((k) => k.close) });
      } catch {
        /* sem ouro */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (m.loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (m.error && !m.data.length) {
    return <ErrorBox message={m.error} onRetry={m.reload} />;
  }

  const ranked = rankOpportunities(a.scores).slice(0, 6);
  const gainers = [...m.data].sort((x, y) => (y.change24h ?? -999) - (x.change24h ?? -999)).slice(0, 5);
  const losers = [...m.data].sort((x, y) => (x.change24h ?? 999) - (y.change24h ?? 999)).slice(0, 5);
  const btc = m.data.find((d) => d.symbol === 'BTC');

  const dashRows = summarize(
    operations.map((o) => ({ ...o, price: o.price })),
    Object.fromEntries(m.data.map((d) => [d.symbol, d.price]))
  );
  const dashT = totals(dashRows, 'standard');
  const invested = dashT.invested;
  const current = dashT.current;
  const pnlPct = invested > 0 ? ((current - invested) / invested) * 100 : 0;

  const regimeTone = a.regime.label.includes('RISK-ON')
    ? 'bull'
    : a.regime.label.includes('RISK-OFF')
      ? 'bear'
      : 'warn';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Dashboard de Mercado
            </h1>
            <span className="rounded-[4px] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Mercado ativo
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Visão macroeconômica, regime de liquidez e oportunidades confluentes
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            {m.stale ? 'Dados desatualizados' : `Atualizado ${timeAgo(m.updatedAt)}`}
          </span>
          <button
            type="button"
            onClick={m.reload}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors shadow-sm active:scale-[0.98]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* Morning Brief · abertura US (10:30 BRT) */}
      <MorningBriefCard brief={brief} />

      {/* KPI Strip Principal */}
      <MStats
        items={[
          {
            label: 'Regime de mercado',
            value: a.regime.label,
            sub: `Confiança ${a.regime.confidence}%`,
            tone: regimeTone === 'bull' ? 'up' : regimeTone === 'bear' ? 'down' : 'muted',
          },
          {
            label: 'Bitcoin (BTC)',
            value: fmtUSD(btc?.price),
            sub: btc?.change24h != null ? `${fmtPct(btc.change24h)} · Ref.` : 'Referência',
            tone: (btc?.change24h ?? 0) >= 0 ? 'up' : 'down',
          },
          {
            label: 'Market breadth',
            value: `${a.regime.breadth}%`,
            sub: `Momentum: ${a.regime.momentum}`,
            tone: a.regime.breadth >= 50 ? 'up' : 'down',
          },
          {
            label: 'Portfólio pessoal',
            value: fmtUSD(current),
            sub: `${pnlPct >= 0 ? '+' : ''}${fmtPct(pnlPct)} · Inv. ${fmtUSD(invested)}`,
            tone: current >= invested ? 'up' : 'down',
          },
        ]}
      />

      {/* Painel Global: Fear & Greed + Dominância + Ouro + Sparklines */}
      <MSection
        title="Visão Macro e Liquidez"
        right={<span className="text-xs text-[var(--text-muted)]">CoinGecko Global · Yahoo Finance</span>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Fear & Greed */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Medo e Ganância
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {fg ?? '—'}
              </p>
            </div>
            <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
              {fg != null ? fgLabel(fg) : '—'}
            </p>
          </div>

          {/* Market Cap Total & BTC Dominance */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Market Cap Global
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums text-[var(--text-primary)]">
                {global ? fmtUSD(global.totalMcap, 0) : '—'}
              </p>
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-[var(--text-muted)]">Dominância BTC</span>
                <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                  {global ? `${global.btcDominance.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div
                  className="h-full bg-[var(--brand)]"
                  style={{ width: `${Math.min(100, global?.btcDominance || 50)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Ouro / Gold (GC=F) */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Ouro Spot (GC=F)
                </p>
                <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">
                  {gold.price != null ? `$${fmtNum(gold.price)}` : '—'}
                </span>
              </div>
              <div className="my-2 flex justify-center">
                <Sparkline data={gold.spark} width={130} height={32} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">Ativo de refúgio vs liquidez</p>
          </div>

          {/* Sparkline BTC 30d */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Bitcoin (30d)
                </p>
                <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">
                  {btc ? fmtPrice(btc.price) : '—'}
                </span>
              </div>
              <div className="my-2 flex justify-center">
                <Sparkline data={hist.btc} width={130} height={32} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">Tendência base do mercado</p>
          </div>

          {/* Sparkline ETH 30d */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Ethereum (30d)
                </p>
                <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">
                  {m.data.find((d) => d.symbol === 'ETH')?.price ? fmtPrice(m.data.find((d) => d.symbol === 'ETH')!.price) : '—'}
                </span>
              </div>
              <div className="my-2 flex justify-center">
                <Sparkline data={hist.eth} width={130} height={32} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">Líder de smart contracts</p>
          </div>
        </div>
      </MSection>

      {/* Oportunidades Confluentes */}
      <MSection
        title="Oportunidades em Destaque (Ranking)"
        right={<span className="text-xs tabular-nums text-[var(--text-muted)]">{ranked.length} sinais</span>}
      >
        {ranked.length === 0 ? (
          <MEmpty title="Nenhuma oportunidade" hint="Nenhuma oportunidade gerada no momento." />
        ) : (
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
            {ranked.map((o, i) => (
              <div
                key={o.symbol}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                    #{i + 1}
                  </span>
                  <Link
                    to={`/monitor?symbol=${o.symbol}`}
                    className="w-16 text-xs font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors"
                  >
                    {o.symbol}
                  </Link>
                  <ScoreAudit score={o} />
                </div>

                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-[var(--text-secondary)] sm:inline">
                    {o.classification} · {o.confidence}% conf.
                  </span>
                  <span
                    className={
                      o.signal === 'BUY'
                        ? 'rounded-[4px] px-2 py-0.5 text-xs font-semibold bg-[var(--bull-bg)] text-[var(--bull-text)]'
                        : o.signal === 'SELL'
                          ? 'rounded-[4px] px-2 py-0.5 text-xs font-semibold bg-[var(--bear-bg)] text-[var(--bear-text)]'
                          : 'rounded-[4px] px-2 py-0.5 text-xs font-semibold bg-[var(--neutral-bg)] text-[var(--neutral-text)]'
                    }
                  >
                    {o.signal === 'BUY' ? 'COMPRA' : o.signal === 'SELL' ? 'VENDA' : 'NEUTRO'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </MSection>

      {/* Watchlist */}
      <MSection
        title={`Watchlist (${watchlist.length} ativos)`}
        right={<span className="text-xs tabular-nums text-[var(--text-muted)]">{watchlist.length} acompanhados</span>}
      >
        {watchlist.length === 0 ? (
          <MEmpty title="Watchlist vazia" hint="Estrele ativos no Radar para acompanhar cotações aqui." />
        ) : (
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
            {watchlist.map((s) => {
              const d = m.data.find((x) => x.symbol === s);
              if (!d) return null;
              const isPos = (d.change24h ?? 0) >= 0;
              return (
                <div
                  key={s}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
                >
                  <div className="flex items-center gap-3">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <Link
                      to={`/monitor?symbol=${s}`}
                      className="w-16 text-xs font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors"
                    >
                      {s}
                    </Link>
                    <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                      {fmtPrice(d.price)}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={
                        isPos
                          ? 'text-xs font-semibold tabular-nums text-[var(--bull)]'
                          : 'text-xs font-semibold tabular-nums text-[var(--bear)]'
                      }
                    >
                      {fmtPct(d.change24h)}
                    </span>
                    <div className="hidden sm:block">
                      <Sparkline data={d.sparkline30d ?? []} width={80} height={20} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </MSection>

      {/* Top Gainers & Top Losers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MSection
          title="Maiores Altas (24h)"
          right={<ArrowUpRight className="h-4 w-4 text-[var(--bull)]" />}
        >
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
            {gainers.map((d) => (
              <div
                key={d.symbol}
                className="flex items-center justify-between px-4 py-2.5 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
              >
                <Link
                  to={`/monitor?symbol=${d.symbol}`}
                  className="text-xs font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors"
                >
                  {d.symbol}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-[var(--text-secondary)]">
                    {fmtPrice(d.price)}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-[var(--bull)]">
                    +{fmtPct(d.change24h)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </MSection>

        <MSection
          title="Maiores Baixas (24h)"
          right={<ArrowDownRight className="h-4 w-4 text-[var(--bear)]" />}
        >
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
            {losers.map((d) => (
              <div
                key={d.symbol}
                className="flex items-center justify-between px-4 py-2.5 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
              >
                <Link
                  to={`/monitor?symbol=${d.symbol}`}
                  className="text-xs font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors"
                >
                  {d.symbol}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-[var(--text-secondary)]">
                    {fmtPrice(d.price)}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-[var(--bear)]">
                    {fmtPct(d.change24h)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </MSection>
      </div>
    </div>
  );
}
