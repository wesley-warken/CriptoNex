import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Search, TriangleAlert, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUniverseStocks } from '@/services/universeHooks';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { yahooChart } from '@/services/lookup';
import { snapshot } from '@/engine/indicators';
import { buildSignals } from '@/engine/signals';
import { scoreAsset } from '@/engine/scoring';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MEmpty } from '@/components/minimal/MEmpty';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { CandleChart } from '@/components/charts/CandleChart';
import { AssetSearch } from '@/components/analysis/AssetSearch';
import { useStore } from '@/stores/useStore';
import type { Candle } from '@/types';
import type { StockEntry } from '@/services/universeTypes';
import { fmtNum, fmtPct } from '@/lib/format';

type Seg = 'B3' | 'EUA' | 'MEUS';

function useDebounced<T>(v: T, ms = 300): T {
  const [v2, setV2] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setV2(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return v2;
}

export function Stocks() {
  const uni = useUniverseStocks();
  const sectors = useStore((s) => s.sectors);
  const set = useStore((s) => s.set);
  const customAssets = useStore((s) => s.customAssets);
  const removeCustomAsset = useStore((s) => s.removeCustomAsset);
  const addOperation = useStore((s) => s.addOperation);
  const tableDensity = useStore((s) => s.tableDensity);
  const [seg, setSeg] = useState<Seg>('B3');
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('ALL');
  const [exchange, setExchange] = useState('ALL');
  const [symbol, setSymbol] = useState('PETR4');
  const [count, setCount] = useState(400);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();

  const rowHeight = tableDensity === 'compact' ? 38 : 46;

  useEffect(() => {
    const ps = params.get('symbol');
    if (!ps) return;
    const s = ps.toUpperCase();
    setSymbol(s);
    if (uni.b3.some((b) => b.symbol === s)) setSeg('B3');
    else if (uni.us.some((x) => x.symbol === s)) setSeg('EUA');
    else setSeg('MEUS');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const qd = useDebounced(q);

  const b3rows: StockEntry[] = useMemo(() => {
    const needle = qd.trim().toLowerCase();
    return uni.b3
      .filter((a) => (sector === 'ALL' ? true : (sectors[a.symbol] ?? a.sector ?? '') === sector))
      .filter((a) => (needle ? a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) : true));
  }, [uni.b3, qd, sector, sectors]);

  const usrows = useMemo(() => {
    const needle = qd.trim().toLowerCase();
    return uni.us
      .filter((a) => (exchange === 'ALL' ? true : a.exchange === exchange))
      .filter((a) => (needle ? a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) : true))
      .map((a) => ({ symbol: a.symbol, name: a.name, exchange: a.exchange, kind: 'stock' as const }));
  }, [uni.us, qd, exchange]);

  const myrows: StockEntry[] = useMemo(() => {
    const needle = qd.trim().toLowerCase();
    return customAssets.filter((a) => (needle ? a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) : true));
  }, [customAssets, qd]);

  const rows = seg === 'B3' ? b3rows : seg === 'EUA' ? usrows : myrows;
  const sectorsList = useMemo(() => [...new Set(uni.b3.map((a) => sectors[a.symbol] ?? a.sector ?? 'Outros'))].sort(), [uni.b3, sectors]);
  const exchanges = useMemo(() => [...new Set(uni.us.map((a) => a.exchange))].sort(), [uni.us]);

  useEffect(() => {
    setCount(400);
  }, [seg, qd, sector, exchange]);

  const shown = useMemo(() => rows.slice(0, count), [rows, count]);
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });
  const vItems = virtualizer.getVirtualItems();
  const winSyms = useMemo(() => {
    if (!vItems.length) return [];
    const lo = Math.max(0, vItems[0].index - 4);
    const hi = Math.min(shown.length - 1, vItems[vItems.length - 1].index + 4);
    return shown.slice(lo, hi + 1).map((r) => r.symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vItems.map((v) => v.index).join(','), shown]);

  const isB3Sym = (s: string) => uni.b3.some((b) => b.symbol === s) || /[34]$/.test(s);
  const b3win = useMemo(() => winSyms.filter(isB3Sym), [winSyms, uni.b3]);
  const yhwin = useMemo(() => winSyms.filter((s) => !isB3Sym(s)), [winSyms, uni.b3]);
  const brapi = useBrapiQuotes(seg === 'B3' || seg === 'MEUS' ? b3win : []);
  const yh = useYahooQuotes(seg === 'EUA' || seg === 'MEUS' ? yhwin : []);

  const quoteOf = (s: string): { price: number | null; chg: number | null } => {
    const b = brapi.map.get(s);
    if (b) return { price: b.price, chg: b.change };
    const y = yh.map.get(s);
    if (y) return { price: y.price, chg: y.changePct };
    return { price: null, chg: null };
  };

  // Detalhe do ativo selecionado (análise preservada)
  const [candles, setCandles] = useState<Candle[]>([]);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      setDLoading(true);
      setDError(null);
      try {
        const ysym = isB3Sym(symbol) && !symbol.includes('.') ? `${symbol}.SA` : symbol;
        const qq = await yahooChart(ysym, '1y', '1d');
        if (alive) setCandles(qq.candles);
      } catch (e) {
        if (alive) setDError(e instanceof Error ? e.message : 'Fonte de ações indisponível. Tente de novo.');
      } finally {
        if (alive) setDLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);
  const snap = useMemo(() => (candles.length ? snapshot(candles) : null), [candles]);
  const sig = useMemo(() => (candles.length ? buildSignals(candles, snap ?? undefined) : null), [candles, snap]);
  const score = useMemo(() => (candles.length ? scoreAsset({ symbol, candles }) : null), [candles, symbol]);
  const last = candles.length ? candles[candles.length - 1].close : quoteOf(symbol).price;

  if (uni.loading && !uni.b3.length) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-8">
      {/* Topbar de Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Segment Selector */}
          <div className="inline-flex items-center gap-4">
            {(['B3', 'EUA', 'MEUS'] as Seg[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeg(s)}
                className={
                  s === seg
                    ? 'font-mono text-xs font-semibold text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]'
                    : 'font-mono text-xs font-semibold text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'
                }
              >
                {s === 'MEUS' ? 'Meus Ativos' : s}
              </button>
            ))}
          </div>

          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={seg === 'EUA' ? 'Buscar 9 mil tickers EUA…' : 'Buscar por nome ou símbolo…'}
              className="w-56 border border-[var(--border)] bg-[var(--surface-1)] py-1.5 pl-8 pr-3 font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
            />
          </div>

          {seg === 'B3' && (
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 font-medium text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
            >
              <option value="ALL">Todos os setores ({sectorsList.length})</option>
              {sectorsList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {seg === 'EUA' && (
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 font-medium text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
            >
              <option value="ALL">Todas as bolsas ({exchanges.length})</option>
              {exchanges.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {seg === 'B3' && `${uni.b3.length.toLocaleString('pt-BR')} tickers B3`}
            {seg === 'EUA' && `${uni.us.length.toLocaleString('pt-BR')} tickers EUA`}
            {seg === 'MEUS' && `${myrows.length} ativos salvos`}
          </span>
        </div>
      </div>

      {uni.error && <ErrorBox message={uni.error} onRetry={uni.reload} />}

      <div className="grid gap-8 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <MSection
            title={seg === 'B3' ? `Mercado brasileiro B3 — ${rows.length.toLocaleString('pt-BR')} empresas` : seg === 'EUA' ? `Mercado norte-americano — ${rows.length.toLocaleString('pt-BR')} tickers` : `Ativos personalizados — ${rows.length}`}
            right={<span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">Preços em tempo real</span>}
          >
            {seg === 'MEUS' && <div className="my-2.5"><AssetSearch compact /></div>}

            {!rows.length ? (
              <MEmpty title={seg === 'MEUS' ? 'Nenhum ativo adicionado' : 'Nada encontrado'} hint={seg === 'MEUS' ? 'Use a busca acima para adicionar (TSM, ^BVSP, GC=F…)' : 'Ajuste a busca ou os filtros de setor/bolsa.'} />
            ) : (
              <>
                <div className="mt-2 grid grid-cols-[6rem_1fr_5.5rem_5.5rem_5rem] gap-1 border-b border-[var(--border)] px-2.5 py-1.5 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Símbolo</span>
                  <span>Empresa</span>
                  <span className="text-right">Preço</span>
                  <span className="text-right">Variação</span>
                  <span className="text-center">Ação</span>
                </div>

                <div
                  ref={scrollRef}
                  className="max-h-[54vh] overflow-auto"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) setCount((c) => (c < rows.length ? c + 400 : c));
                  }}
                >
                  <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {vItems.map((v) => {
                      const r = shown[v.index];
                      const qq = quoteOf(r.symbol);
                      const isSelected = r.symbol === symbol;
                      return (
                        <div
                          key={r.symbol}
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${v.size}px`, transform: `translateY(${v.start}px)` }}
                          className={
                            isSelected
                              ? 'grid grid-cols-[6rem_1fr_5.5rem_5.5rem_5rem] items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs transition-colors duration-150 ease-out'
                              : 'grid grid-cols-[6rem_1fr_5.5rem_5.5rem_5rem] items-center gap-1 border-b border-[var(--border)] px-2.5 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]'
                          }
                        >
                          <button
                            onClick={() => setSymbol(r.symbol)}
                            className={
                              isSelected
                                ? 'truncate text-left font-mono font-semibold text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]'
                                : 'truncate text-left font-mono font-semibold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] active:scale-[0.98]'
                            }
                            title="Analisar no painel"
                          >
                            {r.symbol}
                          </button>
                          <span className="truncate text-xs text-[var(--text-muted)]">{r.name}</span>
                          <span className="text-right font-mono font-medium tabular-nums text-[var(--text-primary)]">
                            {qq.price != null ? fmtNum(qq.price) : '—'}
                          </span>
                          <span
                            className={
                              (qq.chg ?? 0) >= 0
                                ? 'text-right font-mono font-semibold tabular-nums text-[var(--bull)]'
                                : 'text-right font-mono font-semibold tabular-nums text-[var(--bear)]'
                            }
                          >
                            {qq.chg != null ? fmtPct(qq.chg) : '—'}
                          </span>
                          <span className="flex items-center justify-center gap-1 text-xs">
                            {seg === 'MEUS' && (
                              <button
                                onClick={() => removeCustomAsset(r.symbol)}
                                className="p-0.5 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]"
                                title="Remover ativo"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => addOperation({ id: `${Date.now()}`, walletId: 'main', kind: 'stock', symbol: r.symbol, side: 'buy', quantity: 1, price: qq.price ?? 0, date: new Date().toISOString().slice(0, 10), note: r.name })}
                              className="border border-[var(--border)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--brand)] active:scale-[0.98]"
                              title="Adicionar ao portfólio"
                            >
                              + Port
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {count < rows.length && (
                  <button
                    onClick={() => setCount((c) => c + 400)}
                    className="mt-2.5 w-full border border-[var(--border)] bg-[var(--surface-1)] py-2 font-mono text-xs font-semibold tabular-nums text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] hover:border-[var(--brand)] active:scale-[0.98]"
                  >
                    Carregar mais 400 ({(rows.length - count).toLocaleString('pt-BR')} restantes)
                  </button>
                )}
              </>
            )}
          </MSection>
        </div>

        {/* Detalhe do Ativo Selecionado */}
        <div className="space-y-8 xl:col-span-2">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <div className="flex items-baseline gap-2">
                <strong className="font-mono text-lg font-semibold text-[var(--text-primary)]">{symbol}</strong>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                  {last != null ? fmtNum(last) : '—'}
                </span>
              </div>
              {score && (
                <div className="flex items-center gap-1.5">
                  <ScoreAudit score={score} />
                  <span className={score.signal === 'BUY' ? 'text-xs font-semibold text-[var(--bull)]' : score.signal === 'SELL' ? 'text-xs font-semibold text-[var(--bear)]' : 'text-xs font-semibold text-[var(--text-secondary)]'}>
                    {score.signal} · <span className="tabular-nums">{score.confidence}%</span>
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Setor</span>
              <input
                value={sectors[symbol] ?? ''}
                onChange={(e) => set({ sectors: { ...sectors, [symbol]: e.target.value } })}
                placeholder="Definir setor…"
                className="w-36 border border-[var(--border)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
              />
            </div>
          </div>

          {dLoading && <Skeleton className="h-72" />}
          {dError && <ErrorBox message={dError} onRetry={() => setSymbol((s) => `${s}`)} />}
          {!dLoading && !dError && (
            <>
              <div>
                <CandleChart candles={candles} height={280} />
              </div>

              <MSection title="Sinais confluentes">
                <div className="divide-y divide-[var(--border)]">
                  {sig?.signals.map((s) => (
                    <div key={s.indicator} className="flex items-center justify-between py-1 text-xs">
                      <span className="font-medium text-[var(--text-secondary)]">{s.indicator}</span>
                      <span className={s.signal === 'BUY' ? 'text-xs font-semibold text-[var(--bull)]' : s.signal === 'SELL' ? 'text-xs font-semibold text-[var(--bear)]' : 'text-xs font-semibold text-[var(--text-secondary)]'}>
                        {s.signal}
                      </span>
                    </div>
                  ))}
                </div>
              </MSection>

              <MSection title="Tese e riscos do algoritmo">
                <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                  {score?.why.map((w) => (
                    <li key={w} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bull)]" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
                {score?.risks.length ? (
                  <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-xs">
                    {score.risks.map((w) => (
                      <li key={w} className="flex items-start gap-1.5">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bear)]" />
                        <span className="text-[var(--text-muted)]">{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </MSection>
            </>
          )}
        </div>
      </div>

      <AssetSearch />
    </div>
  );
}
