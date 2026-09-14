import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Candle } from '@/types';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { type BinanceInterval } from '@/services/providers/binance';
import { fetchAssetCandles, fetchMtfCandles, mtfLabels, timeframesFor, type ResolvedAsset } from '@/services/assetCandles';
import { mergeCandleCapped, subscribeKline, type LiveKline } from '@/services/liveKlines';
import { useLookup } from '@/components/analysis/AssetSearch';
import { snapshot, calcSupertrend } from '@/engine/indicators';
import { floorPivots, pivotZone, aggregateClosed } from '@/engine/pivots';
import { buildSignals } from '@/engine/signals';
import { scoreAsset, interpret } from '@/engine/scoring';
import { backtest, signalForwardStats, formatPF } from '@/engine/backtesting';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MStats, MDot } from '@/components/minimal/MStats';
import { MRow } from '@/components/minimal/MRow';
import { MEmpty } from '@/components/minimal/MEmpty';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CandleChart, type PriceLine } from '@/components/charts/CandleChart';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { fmtPrice, fmtPriceNum } from '@/lib/format';
import type { Pivots } from '@/engine/pivots';

/** Plano de trade educacional a partir de pivôs + ATR (não é recomendação). */
function TradePlan({ symbol, price, pivots, atr, signal, fmtPx }: {
  symbol: string;
  price: number;
  pivots: Pivots;
  atr: number;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  fmtPx: (v: number | null | undefined) => string;
}) {
  if (signal === 'NEUTRAL' || price <= 0) {
    return (
      <MSection
        title="Plano estrutural de trade"
        right={<span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Sinal neutro</span>}
      >
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          Sem viés direcional ativo. Cenários calculados: rompimento de <strong className="font-semibold tabular-nums text-[var(--text-primary)]">{fmtPx(pivots.r1)}</strong> abre alvo em <strong className="font-semibold tabular-nums text-[var(--text-primary)]">{fmtPx(pivots.r2)}</strong>; perda de <strong className="font-semibold tabular-nums text-[var(--text-primary)]">{fmtPx(pivots.s1)}</strong> mira <strong className="font-semibold tabular-nums text-[var(--text-primary)]">{fmtPx(pivots.s2)}</strong>.
        </p>
      </MSection>
    );
  }
  const long = signal === 'BUY';
  const entry = price;
  const stop = long ? Math.min(pivots.s1, price - 1.5 * atr) : Math.max(pivots.r1, price + 1.5 * atr);
  const t1 = long ? pivots.r1 : pivots.s1;
  const t2 = long ? pivots.r2 : pivots.s2;
  const risk = Math.abs(entry - stop);
  const rr1 = risk > 0 ? Math.abs(t1 - entry) / risk : null;
  const rr2 = risk > 0 ? Math.abs(t2 - entry) / risk : null;
  const stopDistPct = entry > 0 ? (Math.abs(entry - stop) / entry) * 100 : 0;

  return (
    <MSection
      title="Plano de trade didático"
      right={
        <span className="flex items-baseline gap-2">
          <span className={cn('text-xs font-semibold uppercase tracking-wider', long ? 'text-emerald-400' : 'text-red-400')}>
            {long ? 'Viés compra' : 'Viés venda'}
          </span>
          <span className="text-xs tabular-nums text-zinc-500">Pivô + ATR (1.5×)</span>
        </span>
      }
    >
      <MStats
        items={[
          { label: 'Entrada ref.', value: fmtPx(entry), sub: symbol },
          { label: 'Stop loss · 1.5 ATR', value: fmtPx(stop), sub: `-${stopDistPct.toFixed(2)}% de risco`, tone: 'down' },
          { label: 'Alvo 1 · T1', value: fmtPx(t1), sub: rr1 != null ? `R:R ${rr1.toFixed(2)}:1` : '—', tone: rr1 != null && rr1 >= 2 ? 'up' : undefined },
          { label: 'Alvo 2 · T2', value: fmtPx(t2), sub: rr2 != null ? `R:R ${rr2.toFixed(2)}:1` : '—', tone: rr2 != null && rr2 >= 2 ? 'up' : undefined },
          { label: 'Risco nominal', value: fmtPx(risk), sub: 'por unidade' },
        ]}
      />

      <p className="mt-3 text-xs leading-5 text-zinc-500">
        Estrutura didática calculada sobre pivôs clássicos e volatilidade ATR — valide confluências técnicas e gerencie o risco rigorosamente.
      </p>
    </MSection>
  );
}

const QUICK = ['BTC', 'ETH', 'SOL', 'PETR4', 'VALE3', 'AAPL', 'TSM', 'NVDA'];

/** Selo de tempo real com relógio de Brasília (tick isolado, sem re-render da página). */
function LiveBadge({ updatedAt, live }: { updatedAt: number | null; live: boolean }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const fmt = (ts: number) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ts));
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500"
      title="Horário de Brasília (UTC-3)"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
      {live ? 'TEMPO REAL' : 'AO VIVO'} · {fmt(Date.now())} BRT{updatedAt ? ` · dados ${fmt(updatedAt)}` : ''}
    </span>
  );
}
export function Monitor() {
  const [params, setParams] = useSearchParams();
  const symbol = (params.get('symbol') ?? 'BTC').toUpperCase();
  const [tf, setTf] = useState<BinanceInterval>('1d');
  const [tab, setTab] = useState('Overview');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [daily, setDaily] = useState<Candle[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  // Janela de análise (300): gráfico exibe até 1000, mas score/sinais/backtest
  // rodam nos 300 recentes — O(N²) do backtest trava a página com 1000 a cada tick
  // Cap rígido para evitar memory leak de candles em alta frequência
  const CANDLES_CAP = 1000;
  const ANALYSIS_CAP = 300;
  const [analysis, setAnalysis] = useState<Candle[]>([]);
  const pushAnalysis = (kl: Candle[]) => setAnalysis(kl.length > ANALYSIS_CAP ? kl.slice(-ANALYSIS_CAP) : kl);
  const [resolved, setResolved] = useState<ResolvedAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [dataSrc, setDataSrc] = useState<string | null>(null);
  const [wsLive, setWsLive] = useState(false);
  const lastTickRef = useRef(0);
  // Gate de corrida: snapshot REST deve completar antes de aplicar deltas WS
  const snapshotReadyRef = useRef(false);
  const pendingTickRef = useRef<LiveKline | null>(null);
  const m = useCryptoMarket(60);
  const a = useAnalysis(m.data, m.candles);
  const cryptoMeta = CRYPTO_ASSETS.find((x) => x.symbol === symbol);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const lookup = useLookup(searchOpen ? search : '');
  const searchBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    let alive = true;
    snapshotReadyRef.current = false;
    pendingTickRef.current = null;
    async function load() {
      setLoading(true); setError(null);
      try {
        const r = await fetchAssetCandles(symbol, tf);
        if (!alive) return;
        setResolved(r.asset);
        // Cap rígido de histórico (prevenção de memory leak)
        setCandles(r.candles.length > CANDLES_CAP ? r.candles.slice(-CANDLES_CAP) : r.candles);
        setDaily(r.daily.length > CANDLES_CAP ? r.daily.slice(-CANDLES_CAP) : r.daily);
        pushAnalysis(r.candles);
        setDataSrc(r.source);
        setUpdatedAt(Date.now());
        if (r.asset.kind === 'stock' && tf === '4h') setTf('1d');
        snapshotReadyRef.current = true;
        // Flush: se chegou tick enquanto snapshot carregava, aplica o último (fila de 1)
        if (pendingTickRef.current) {
          const queued = pendingTickRef.current;
          pendingTickRef.current = null;
          setCandles((prev) => mergeCandleCapped(prev, queued, CANDLES_CAP));
          setAnalysis((prev) => mergeCandleCapped(prev, queued, ANALYSIS_CAP));
          setUpdatedAt(Date.now());
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Falha'); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; snapshotReadyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, retryKey]);

  // Tempo real tick-a-tick via WebSocket (pares Binance); resto usa o polling acima
  useEffect(() => {
    if (!resolved || resolved.kind !== 'crypto' || !resolved.binanceSymbol) {
      setWsLive(false);
      return;
    }
    let alive = true;
    const off = subscribeKline(
      resolved.binanceSymbol,
      tf,
      (k) => {
        if (!alive || document.hidden) return;
        // CORRIDA DE ESTADO: se snapshot ainda não completou, enfileira o último delta (fila de 1) e descarta o resto
        if (!snapshotReadyRef.current) {
          pendingTickRef.current = k;
          return;
        }
        // Aplica no máximo 1 tick a cada 1,5s (página pesada: evita jank)
        if (Date.now() - lastTickRef.current < 1500) return;
        lastTickRef.current = Date.now();
        // STALE CLOSURE: atualização funcional + cap rígido de memória
        setCandles((prev) => mergeCandleCapped(prev, k, CANDLES_CAP));
        setAnalysis((prev) => mergeCandleCapped(prev, k, ANALYSIS_CAP));
        setUpdatedAt(Date.now());
      },
      (ok) => { if (alive) setWsLive(ok); },
    );
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, resolved?.binanceSymbol, resolved?.kind]);

  // Polling de segurança: garante dado fresco mesmo sem WebSocket
  useEffect(() => {
    if (!resolved) return;
    const ms = tf === '1h' ? 60_000 : tf === '4h' ? 120_000 : tf === '1d' ? 300_000 : 900_000;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetchAssetCandles(symbol, tf);
        setCandles(r.candles.length > CANDLES_CAP ? r.candles.slice(-CANDLES_CAP) : r.candles);
        setDaily(r.daily.length > CANDLES_CAP ? r.daily.slice(-CANDLES_CAP) : r.daily);
        pushAnalysis(r.candles);
        setUpdatedAt(Date.now());
      } catch {
        /* mantém o que há; próxima tentativa no ciclo seguinte */
      }
    }, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, resolved?.binanceSymbol, resolved?.yahooSymbol, resolved?.kind]);
  const kind = resolved?.kind ?? 'crypto';
  const tfs = timeframesFor(kind);
  const snap = useMemo(() => (analysis.length ? snapshot(analysis) : null), [analysis]);
  const sig = useMemo(() => (analysis.length ? buildSignals(analysis, snap ?? undefined) : null), [analysis, snap]);
  const score = useMemo(
    () => (analysis.length ? scoreAsset({ symbol, candles: analysis, regime: kind === 'crypto' ? a.regime : null }) : null),
    [analysis, symbol, kind, a.regime],
  );
  const bt = useMemo(() => (analysis.length >= 60 ? backtest(analysis, 70) : null), [analysis]);
  const fwd = useMemo(() => (analysis.length >= 60 ? signalForwardStats(analysis, 70) : null), [analysis]);
  const lastClose = candles.length ? candles[candles.length - 1].close : null;
  const fmtPx = (v: number | null | undefined) => (v == null ? '—' : kind === 'crypto' ? fmtPrice(v) : fmtPriceNum(v));
  const [showSR, setShowSR] = useState(true);
  const [mtf, setMtf] = useState<{ tf: string; trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[]>([]);

  // Tendências curto/médio/longo (timeframes conforme o tipo do ativo)
  useEffect(() => {
    if (!resolved) return;
    let alive = true;
    (async () => {
      const out: typeof mtf = [];
      for (const dd of mtfLabels(resolved.kind)) {
        try {
          const kl = dd.tf === tf ? candles : await fetchMtfCandles(resolved, dd.tf);
          if (!kl.length) continue;
          const last = kl[kl.length - 1].close;
          const st = calcSupertrend(kl);
          const sn = snapshot(kl);
          const emaBull = sn.ema26 != null ? last > sn.ema26 : sn.sma20 != null ? last > sn.sma20 : null;
          const sum = (st === 'BULLISH' ? 1 : st === 'BEARISH' ? -1 : 0) + (emaBull == null ? 0 : emaBull ? 1 : -1);
          out.push({ tf: dd.label, trend: sum > 0 ? 'BULLISH' : sum < 0 ? 'BEARISH' : 'NEUTRAL' });
        } catch {
          /* timeframe individual pode falhar */
        }
      }
      if (alive) setMtf(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, resolved?.binanceSymbol, resolved?.yahooSymbol, resolved?.kind, tf, candles.length]);

  // Pivô UM GRAU acima do timeframe do gráfico (intraday→diário, 1d→semanal, 1w→mensal),
  // calculado sobre candles fechados. Níveis valem para o período vigente.
  const pivotBase = useMemo(() => {
    const src = tf === '1d' ? candles : daily;
    const n = tf === '1w' ? 21 : tf === '1d' ? 5 : 1;
    const label = tf === '1w' ? 'mensal' : tf === '1d' ? 'semanal' : 'diário';
    return { stats: aggregateClosed(src, n), label };
  }, [candles, daily, tf]);
  const pivots = useMemo(() => {
    const s = pivotBase.stats;
    if (!s) return null;
    return floorPivots(s.high, s.low, s.close);
  }, [pivotBase]);
  const lastPx = candles.length ? candles[candles.length - 1].close : 0;
  const srLines: PriceLine[] = useMemo(() => {
    if (!pivots || !showSR) return [];
    return [
      { price: pivots.r3, title: 'R3', color: '#fb7185' },
      { price: pivots.r2, title: 'R2', color: '#fb7185' },
      { price: pivots.r1, title: 'R1', color: '#fbbf24' },
      { price: pivots.p, title: 'P', color: '#94a3b8' },
      { price: pivots.s1, title: 'S1', color: '#fbbf24' },
      { price: pivots.s2, title: 'S2', color: '#34d399' },
      { price: pivots.s3, title: 'S3', color: '#34d399' },
    ];
  }, [pivots, showSR]);
  const trendOf = (label: string) => mtf.find((t) => t.tf === label)?.trend ?? null;
  const shortVotes = [trendOf('1H'), trendOf('4H')].filter((t): t is 'BULLISH' | 'BEARISH' | 'NEUTRAL' => t !== null);
  const shortLabel = !shortVotes.length ? '—' : shortVotes.every((t) => t === 'BULLISH') ? 'Alta' : shortVotes.every((t) => t === 'BEARISH') ? 'Baixa' : shortVotes.some((t) => t === 'NEUTRAL') && shortVotes.every((t) => t !== 'BEARISH' && t !== 'BULLISH') ? 'Neutra' : 'Mista';
  const midLabel = trendOf('1D') === 'BULLISH' ? 'Alta forte' : trendOf('1D') === 'BEARISH' ? 'Baixa' : trendOf('1D') ? 'Neutra' : '—';
  const longLabel = trendOf('1W') === 'BULLISH' ? 'Alta forte' : trendOf('1W') === 'BEARISH' ? 'Baixa' : trendOf('1W') ? 'Neutra' : '—';
  return (
    <div className="space-y-3">
      {/* Topbar do Monitor */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div ref={searchBox} className="relative">
            <div className="relative flex items-center">
              <Search size={14} className="pointer-events-none absolute left-2.5 text-[var(--text-muted)]" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) { setParams({ symbol: search.trim().toUpperCase() }); setSearchOpen(false); setSearch(''); } }}
                placeholder={`${symbol} — pesquisar ativo…`}
                className="w-64 border border-[var(--border)] bg-[var(--surface-1)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
              />
            </div>
            {searchOpen && (
              <div className="absolute z-50 mt-1 max-h-72 w-72 overflow-auto border border-[var(--border)] bg-[var(--surface-1)] p-1.5 shadow-xl">
                <div className="px-2 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)]">Atalhos rápidos</div>
                <div className="flex flex-wrap gap-1 px-1 pb-1.5">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      onClick={() => { setParams({ symbol: q }); setSearchOpen(false); setSearch(''); }}
                      className="px-2 py-0.5 text-[11px] tabular-nums text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] active:scale-[0.98]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                {lookup.loading && <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Buscando na rede…</div>}
                {lookup.results.map((r) => (
                  <button
                    key={r.symbol}
                    onClick={() => { setParams({ symbol: r.symbol }); setSearchOpen(false); setSearch(''); }}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.98]"
                  >
                    <span className="font-semibold tabular-nums text-[var(--text-primary)]">{r.symbol}</span>
                    <span className="truncate text-[11px] text-[var(--text-muted)] max-w-[140px]">{r.name} · {r.kind}</span>
                  </button>
                ))}
                {search.trim().length >= 2 && !lookup.loading && lookup.results.length === 0 && (
                  <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Nada encontrado — tente o ticker exato.</div>
                )}
              </div>
            )}
          </div>

          <span className="text-[11px] uppercase tracking-wider tabular-nums text-[var(--text-muted)]">
            {kind === 'crypto' ? 'crypto' : `ação · ${resolved?.yahooSymbol ?? symbol}`}
          </span>

          {/* Timeframe Selector */}
          <div className="inline-flex items-center gap-3">
            {tfs.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={cn(
                  'text-xs tabular-nums transition-colors duration-150 ease-out active:scale-[0.98]',
                  t === tf
                    ? 'font-semibold text-[var(--brand)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Cotação atual</span>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
              {fmtPx(lastClose)}
            </span>
          </div>

          {score && (
            <div className="flex items-center gap-2 pl-3 border-l border-[var(--border)]">
              <ScoreAudit score={score} />
              <MDot tone={score.signal === 'BUY' ? 'up' : score.signal === 'SELL' ? 'down' : 'flat'}>
                {`${score.signal} · ${score.confidence}%`}
              </MDot>
            </div>
          )}
        </div>
      </div>
      {loading && <Skeleton className="h-96" />}
      {error && <ErrorBox message={error} onRetry={() => setRetryKey((x) => x + 1)} />}
      {!loading && !error && (
        <>
          <Fullscreen title={`Candles ${symbol} · ${tf}`}>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showSR} onChange={(e) => setShowSR(e.target.checked)} className="accent-cyan-300" /> Suportes/resistências (pivô {pivotBase.label})</label>
              <span className="tabular-nums text-zinc-500">
                {candles.length > 0 && (
                  <>
                    {candles.length} candles · via {dataSrc ?? '?'} · último{' '}
                    {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(candles[candles.length - 1].time))}
                  </>
                )}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <LiveBadge updatedAt={updatedAt} live={wsLive} />
                {mtf.length > 0 && (
                  <span className="tabular-nums">
                    Curto <span className="font-semibold text-[var(--text-primary)]">{shortLabel}</span> · Médio <span className="font-semibold text-[var(--text-primary)]">{midLabel}</span> · Longo <span className="font-semibold text-[var(--text-primary)]">{longLabel}</span>
                  </span>
                )}
              </span>
            </div>
            <CandleChart key={`${symbol}-${tf}`} candles={candles} lines={srLines} dailyOrAbove={tf === '1d' || tf === '1w'} />
          </Fullscreen>
          {mtf.length > 0 && (
            <MSection title="Tendências por timeframe">
              <MStats
                items={mtf.map((t) => ({
                  label: t.tf,
                  value: t.trend === 'BULLISH' ? 'Alta' : t.trend === 'BEARISH' ? 'Baixa' : 'Neutra',
                  tone: t.trend === 'BULLISH' ? 'up' : t.trend === 'BEARISH' ? 'down' : undefined,
                  numeric: false,
                }))}
              />
            </MSection>
          )}
          {pivots && (
            <MSection
              title={`Suportes e resistências · pivô clássico ${pivotBase.label}`}
              right={
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  Zona: <span className="font-semibold text-[var(--text-primary)]">{pivotZone(lastPx, pivots)}</span>
                </span>
              }
            >
              <MStats
                items={[
                  { label: 'R3 · Resistência 3', value: fmtPx(pivots.r3), tone: 'down' },
                  { label: 'R2 · Resistência 2', value: fmtPx(pivots.r2), tone: 'down' },
                  { label: 'R1 · Resistência 1', value: fmtPx(pivots.r1) },
                  { label: 'P · Pivô central', value: fmtPx(pivots.p) },
                  { label: 'S1 · Suporte 1', value: fmtPx(pivots.s1) },
                  { label: 'S2 · Suporte 2', value: fmtPx(pivots.s2), tone: 'up' },
                  { label: 'S3 · Suporte 3', value: fmtPx(pivots.s3), tone: 'up' },
                ]}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span className="tabular-nums">Base de cálculo: {pivotBase.stats?.sessions ?? 0} sessões diárias fechadas.</span>
                <span>Níveis de referência não operacionais</span>
              </div>
            </MSection>
          )}

          {pivots && snap?.atr && <TradePlan symbol={symbol} price={lastPx} pivots={pivots} atr={snap.atr} signal={score?.signal ?? 'NEUTRAL'} fmtPx={fmtPx} />}

          {/* Indicator Navigation Bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-[var(--border)] py-2">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] hidden sm:inline">Indicadores</span>
            {['Overview', 'Performance', 'Trend', 'RSI', 'MACD', 'Stochastic', 'Supertrend', 'Bollinger', 'Volume', 'SMA', 'EMA'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'text-xs transition-colors duration-150 ease-out active:scale-[0.98]',
                  t === tab
                    ? 'font-semibold text-[var(--brand)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <MSection
              title="Sumário técnico"
              right={
                sig ? (
                  <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                    <span className="font-semibold text-[var(--bull)]">▲ {sig.summary.bullish}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="font-semibold text-[var(--text-secondary)]">■ {sig.summary.neutral}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="font-semibold text-[var(--bear)]">▼ {sig.summary.bearish}</span>
                  </span>
                ) : undefined
              }
            >
              <div className="divide-y divide-[var(--border)]">
                {sig?.signals.map((s) => (
                  <div key={s.indicator} className="flex items-center justify-between gap-3 py-1.5 text-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
                    <span className="text-[var(--text-secondary)]">{s.indicator}</span>
                    <span className="flex items-baseline gap-2 text-right">
                      <span className={cn(
                        'text-xs font-semibold uppercase tracking-wider',
                        s.signal === 'BUY' ? 'text-[var(--bull)]' : s.signal === 'SELL' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'
                      )}>
                        {s.signal}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">{s.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </MSection>

            <MSection
              title={`Indicadores · ${tab}`}
              right={<span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Snapshot ao vivo</span>}
            >
              {snap ? (
                <dl>
                  {[
                    ['RSI (14)', snap.rsi?.toFixed(1) ?? '—'],
                    ['MACD histograma', snap.macdHist?.toFixed(4) ?? '—'],
                    ['SMA 20 / 50 / 200', `${snap.sma20?.toFixed(1) ?? '—'} / ${snap.sma50?.toFixed(1) ?? '—'} / ${snap.sma200?.toFixed(1) ?? '—'}`],
                    ['EMA 12 / 26', `${snap.ema12?.toFixed(1) ?? '—'} / ${snap.ema26?.toFixed(1) ?? '—'}`],
                    ['Supertrend', snap.supertrend ?? '—'],
                    ['ADX / ATR', `${snap.adx?.toFixed(1) ?? '—'} / ${snap.atr?.toFixed(1) ?? '—'}`],
                    ['Stochastic %K / %D', `${snap.stochK?.toFixed(1) ?? '—'} / ${snap.stochD?.toFixed(1) ?? '—'}`],
                    ['Bollinger (U/M/L)', `${snap.bbUpper?.toFixed(1) ?? '—'} / ${snap.bbMid?.toFixed(1) ?? '—'} / ${snap.bbLower?.toFixed(1) ?? '—'}`],
                    ['Razão de volume', snap.volumeRatio ? `${snap.volumeRatio.toFixed(2)}×` : '—'],
                  ].map(([label, val]) => (
                    <MRow key={label} k={label} v={val} />
                  ))}
                </dl>
              ) : (
                <MEmpty title="Sem dados disponíveis" />
              )}
            </MSection>

            <MSection
              title="Contexto de mercado"
              right={<span className="text-xs uppercase tracking-wider text-zinc-500">Regime</span>}
            >
              <dl>
                <MRow k="Ativo e feed" v={symbol} sub={kind === 'crypto' ? `Binance ${resolved?.binanceSymbol ?? ''}` : `Yahoo ${resolved?.yahooSymbol ?? ''}`} />
                <MRow k="Regime de mercado" v={kind === 'crypto' ? a.regime.label : '—'} />
                <MRow k="Setor econômico" v={cryptoMeta?.sector ?? '—'} />
                <MRow k="Qualidade dos dados" v={`${score?.dataQuality ?? '—'}%`} />
                <MRow k="Alinhamento multi-TF" v={`${score?.timeframeAlignment ?? '—'}%`} />
              </dl>
              {score && (
                <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {interpret(symbol, tf, score, kind === 'crypto' ? a.regime : null)}
                </p>
              )}
            </MSection>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <MSection title="Por que este sinal?">
              <ul className="divide-y divide-[var(--border)]">
                {score?.why.map((w) => (
                  <li key={w} className="flex items-start gap-2 py-1.5 text-sm text-[var(--text-secondary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bull)]" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
              {score?.risks.length ? (
                <>
                  <div className="mt-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">Fatores de risco observados</div>
                  <ul className="divide-y divide-[var(--border)]">
                    {score.risks.map((w) => (
                      <li key={w} className="flex items-start gap-2 py-1.5 text-sm text-[var(--text-secondary)]">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bear)]" aria-hidden="true" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </MSection>

            <MSection title="Sinais semelhantes no passado">
              {fwd && fwd.up2d24h !== null ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] tabular-nums">Amostra histórica (score ≥ 70, n={fwd.n})</div>
                  <div className="mt-2 flex items-center gap-4 tabular-nums">
                    <div>+2% em 24h: <span className="font-semibold text-[var(--bull)]">{fwd.up2d24h.toFixed(0)}%</span></div>
                    <div>+5% em 7d: <span className="font-semibold text-[var(--bull)]">{(fwd.up5d7d ?? 0).toFixed(0)}%</span></div>
                  </div>
                </div>
              ) : (
                <MEmpty title="Amostra insuficiente" hint="Sem projeção estatística confiável para este sinal." />
              )}
              {bt && (
                <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs tabular-nums leading-5 text-[var(--text-muted)]">
                  Backtest local (score ≥ 70, hold 7d, líq. de custos): {bt.trades} trades · win {bt.winRate.toFixed(1)}% · ret médio {bt.avgReturn.toFixed(2)}% · PF {formatPF(bt.profitFactor, bt.trades)} · DD {bt.maxDrawdown.toFixed(1)}% · α {bt.alpha >= 0 ? '+' : ''}{bt.alpha.toFixed(1)}%
                </p>
              )}
            </MSection>
          </div>
        </>
      )}
    </div>
  );
}
