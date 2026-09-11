import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Candle } from '@/types';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { type BinanceInterval } from '@/services/providers/binance';
import { fetchAssetCandles, fetchMtfCandles, mtfLabels, timeframesFor, type ResolvedAsset } from '@/services/assetCandles';
import { mergeCandle, subscribeKline } from '@/services/liveKlines';
import { useLookup } from '@/components/analysis/AssetSearch';
import { snapshot, calcSupertrend } from '@/engine/indicators';
import { floorPivots, pivotZone, aggregateClosed } from '@/engine/pivots';
import { buildSignals } from '@/engine/signals';
import { scoreAsset, interpret } from '@/engine/scoring';
import { backtest, signalForwardStats } from '@/engine/backtesting';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox } from '@/components/ui/kit';
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
      <Panel>
        <PanelTitle>Plano de trade</PanelTitle>
        <div className="text-sm text-muted">Sinal neutro — sem viés direcional. Cenários: rompimento de {fmtPx(pivots.r1)} abre alvo em {fmtPx(pivots.r2)}; perda de {fmtPx(pivots.s1)} mira {fmtPx(pivots.s2)}. Aguarde confirmação.</div>
      </Panel>
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
  return (
    <Panel>
      <PanelTitle>Plano de trade ({long ? 'compra' : 'venda'} — educacional)</PanelTitle>
      <div className="grid grid-cols-2 gap-1 text-sm tabular md:grid-cols-5">
        <div className="rounded bg-[var(--surface-2)] px-2 py-1"><div className="text-xs text-muted">Entrada ref.</div><strong>{fmtPx(entry)}</strong></div>
        <div className="rounded bg-[var(--surface-2)] px-2 py-1"><div className="text-xs text-muted">Stop (≈1,5 ATR)</div><strong style={{ color: 'var(--down)' }}>{fmtPx(stop)}</strong></div>
        <div className="rounded bg-[var(--surface-2)] px-2 py-1"><div className="text-xs text-muted">Alvo 1</div><strong style={{ color: 'var(--up)' }}>{fmtPx(t1)}</strong><div className="text-xs text-muted">R:R {rr1 != null ? rr1.toFixed(2) : '—'}</div></div>
        <div className="rounded bg-[var(--surface-2)] px-2 py-1"><div className="text-xs text-muted">Alvo 2</div><strong style={{ color: 'var(--up)' }}>{fmtPx(t2)}</strong><div className="text-xs text-muted">R:R {rr2 != null ? rr2.toFixed(2) : '—'}</div></div>
        <div className="rounded bg-[var(--surface-2)] px-2 py-1"><div className="text-xs text-muted">Ativo</div><strong>{symbol}</strong></div>
      </div>
      <div className="mt-1 text-xs text-muted">Estrutura didática a partir de pivôs e ATR — valide no gráfico, use stop sempre e nunca opere só por este painel.</div>
    </Panel>
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
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--up)] px-2.5 py-1 text-[11px] font-bold text-[var(--up)]"
      title="Horário de Brasília (UTC-3)"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--up)] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--up)]" />
      </span>
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
  // Janela de análise (300): gráfico exibe até 1000, mas score/sinais/backtest
  // rodam nos 300 recentes — O(N²) do backtest trava a página com 1000 a cada tick
  const [analysis, setAnalysis] = useState<Candle[]>([]);
  const pushAnalysis = (kl: Candle[]) => setAnalysis(kl.length > 300 ? kl.slice(-300) : kl);
  const [resolved, setResolved] = useState<ResolvedAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [dataSrc, setDataSrc] = useState<string | null>(null);
  const [wsLive, setWsLive] = useState(false);
  const lastTickRef = useRef(0);
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
    async function load() {
      setLoading(true); setError(null);
      try {
        const r = await fetchAssetCandles(symbol, tf);
        if (!alive) return;
        setResolved(r.asset);
        setCandles(r.candles);
        setDaily(r.daily);
        pushAnalysis(r.candles);
        setDataSrc(r.source);
        setUpdatedAt(Date.now());
        if (r.asset.kind === 'stock' && tf === '4h') setTf('1d');
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Falha'); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf]);

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
        // Aplica no máximo 1 tick a cada 1,5s (página pesada: evita jank)
        if (Date.now() - lastTickRef.current < 1500) return;
        lastTickRef.current = Date.now();
        setCandles((prev) => mergeCandle(prev, k));
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
        setCandles(r.candles);
        setDaily(r.daily);
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
      <div className="flex flex-wrap items-center gap-2">
        <div ref={searchBox} className="relative">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) { setParams({ symbol: search.trim().toUpperCase() }); setSearchOpen(false); setSearch(''); } }}
            placeholder={`${symbol} — pesquisar qualquer ativo…`}
            className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-bold outline-none"
          />
          {searchOpen && (
            <div className="absolute z-50 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
              <div className="flex flex-wrap gap-1 px-2 pt-2">
                {QUICK.map((q) => <button key={q} onClick={() => { setParams({ symbol: q }); setSearchOpen(false); setSearch(''); }} className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs">{q}</button>)}
              </div>
              {lookup.loading && <div className="px-3 py-2 text-xs text-muted">Buscando…</div>}
              {lookup.results.map((r) => (
                <button key={r.symbol} onClick={() => { setParams({ symbol: r.symbol }); setSearchOpen(false); setSearch(''); }} className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]">
                  <strong>{r.symbol}</strong> <span className="text-xs text-muted">{r.name} · {r.kind}</span>
                </button>
              ))}
              {search.trim().length >= 2 && !lookup.loading && lookup.results.length === 0 && <div className="px-3 py-2 text-xs text-muted">Nada encontrado — tente o símbolo exato.</div>}
            </div>
          )}
        </div>
        <Badge tone={kind === 'crypto' ? 'accent' : undefined}>{kind === 'crypto' ? 'crypto' : `ação · ${resolved?.yahooSymbol ?? symbol}`}</Badge>
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm">
          {tfs.map((t) => <button key={t} onClick={() => setTf(t)} className={t === tf ? 'bg-[var(--accent)] px-3 py-1.5 font-bold text-black' : 'px-3 py-1.5 text-muted'}>{t}</button>)}
        </div>
        <span className="tabular text-lg font-bold">{fmtPx(lastClose)}</span>
        {score && <><ScoreAudit score={score} /><Badge tone={score.signal === 'BUY' ? 'up' : score.signal === 'SELL' ? 'down' : 'warn'}>{score.signal} · {score.confidence}%</Badge></>}
      </div>
      {loading && <Skeleton className="h-96" />}
      {error && <ErrorBox message={error} onRetry={() => setTf((t) => t)} />}
      {!loading && !error && (
        <>
          <Fullscreen title={`Candles ${symbol} · ${tf}`}>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <label className="flex items-center gap-1"><input type="checkbox" checked={showSR} onChange={(e) => setShowSR(e.target.checked)} /> Suportes/resistências (pivô {pivotBase.label})</label>
              <span className="tabular">
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
                  <span>
                    Curto <strong>{shortLabel}</strong> · Médio <strong>{midLabel}</strong> · Longo <strong>{longLabel}</strong>
                  </span>
                )}
              </span>
            </div>
            <CandleChart key={`${symbol}-${tf}`} candles={candles} lines={srLines} dailyOrAbove={tf === '1d' || tf === '1w'} />
          </Fullscreen>
          {mtf.length > 0 && (
            <Panel>
              <PanelTitle>Tendências por timeframe</PanelTitle>
              <div className="flex flex-wrap gap-2">
                {mtf.map((t) => (
                  <Badge key={t.tf} tone={t.trend === 'BULLISH' ? 'up' : t.trend === 'BEARISH' ? 'down' : 'warn'}>{t.tf} · {t.trend === 'BULLISH' ? 'Alta' : t.trend === 'BEARISH' ? 'Baixa' : 'Neutra'}</Badge>
                ))}
              </div>
            </Panel>
          )}
          {pivots && (
            <Panel>
              <PanelTitle>Suportes e resistências (pivô clássico {pivotBase.label})</PanelTitle>
              <div className="grid grid-cols-2 gap-1 text-sm tabular md:grid-cols-4">
                {[['R3', pivots.r3, 'var(--down)'], ['R2', pivots.r2, 'var(--down)'], ['R1', pivots.r1, 'var(--warn)'], ['P', pivots.p, 'var(--muted)'], ['S1', pivots.s1, 'var(--warn)'], ['S2', pivots.s2, 'var(--up)'], ['S3', pivots.s3, 'var(--up)']].map(([k, v, c]) => (
                  <div key={k as string} className="flex justify-between rounded bg-[var(--surface-2)] px-2 py-1"><span className="text-muted">{k}</span><strong style={{ color: c as string }}>{fmtPx(v as number)}</strong></div>
                ))}
              </div>
              <div className="mt-1 text-xs text-muted">Preço atual: {pivotZone(lastPx, pivots)}. Base: {pivotBase.stats?.sessions ?? 0} sessões diárias fechadas. Trate cada linha como zona e opere sempre com stop.</div>
            </Panel>
          )}
          {pivots && snap?.atr && <TradePlan symbol={symbol} price={lastPx} pivots={pivots} atr={snap.atr} signal={score?.signal ?? 'NEUTRAL'} fmtPx={fmtPx} />}
          <div className="flex flex-wrap gap-1">
            {['Overview', 'Performance', 'Trend', 'RSI', 'MACD', 'Stochastic', 'Supertrend', 'Bollinger', 'Volume', 'SMA', 'EMA'].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={t === tab ? 'rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-bold text-black' : 'rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-muted'}>{t}</button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel>
              <PanelTitle>Technical summary</PanelTitle>
              {sig && <div className="text-sm">Bullish <strong>{sig.summary.bullish}</strong> · Neutral <strong>{sig.summary.neutral}</strong> · Bearish <strong>{sig.summary.bearish}</strong></div>}
              <div className="mt-2 space-y-1">{sig?.signals.map((s) => <div key={s.indicator} className="flex justify-between text-sm"><span className="text-muted">{s.indicator}</span><span><Badge tone={s.signal === 'BUY' ? 'up' : s.signal === 'SELL' ? 'down' : 'warn'}>{s.signal}</Badge> <span className="text-xs text-muted">{s.detail}</span></span></div>)}</div>
            </Panel>
            <Panel>
              <PanelTitle>Indicadores ({tab})</PanelTitle>
              {snap ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted">RSI</span><strong className="tabular">{snap.rsi?.toFixed(1) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">MACD hist</span><strong className="tabular">{snap.macdHist?.toFixed(4) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">SMA20/50/200</span><strong className="tabular">{snap.sma20?.toFixed(1) ?? '—'} / {snap.sma50?.toFixed(1) ?? '—'} / {snap.sma200?.toFixed(1) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">EMA12/26</span><strong className="tabular">{snap.ema12?.toFixed(1) ?? '—'} / {snap.ema26?.toFixed(1) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">Supertrend</span><strong>{snap.supertrend ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">ADX / ATR</span><strong className="tabular">{snap.adx?.toFixed(1) ?? '—'} / {snap.atr?.toFixed(1) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">Stoch K/D</span><strong className="tabular">{snap.stochK?.toFixed(1) ?? '—'} / {snap.stochD?.toFixed(1) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">BB U/M/L</span><strong className="tabular">{snap.bbUpper?.toFixed(1) ?? '—'} / {snap.bbMid?.toFixed(1) ?? '—'} / {snap.bbLower?.toFixed(1) ?? '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted">Volume ratio</span><strong className="tabular">{snap.volumeRatio ? `${snap.volumeRatio.toFixed(2)}×` : '—'}</strong></div>
                </div>
              ) : <div className="text-sm text-muted">Sem dados.</div>}
            </Panel>
            <Panel>
              <PanelTitle>Market context</PanelTitle>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted">Asset</span><strong>{symbol} <span className="text-xs text-muted">({kind === 'crypto' ? `Binance ${resolved?.binanceSymbol ?? ''}` : `Yahoo ${resolved?.yahooSymbol ?? ''}`})</span></strong></div>
                <div className="flex justify-between"><span className="text-muted">Market Regime</span><strong>{kind === 'crypto' ? a.regime.label : '—'}</strong></div>
                <div className="flex justify-between"><span className="text-muted">Setor</span><strong>{cryptoMeta?.sector ?? '—'}</strong></div>
                <div className="flex justify-between"><span className="text-muted">Qualidade dados</span><strong>{score?.dataQuality ?? '—'}%</strong></div>
                <div className="flex justify-between"><span className="text-muted">Alinhamento TF</span><strong>{score?.timeframeAlignment ?? '—'}%</strong></div>
              </div>
              {score && <p className="mt-3 text-sm text-muted">{interpret(symbol, tf, score, kind === 'crypto' ? a.regime : null)}</p>}
            </Panel>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel>
              <PanelTitle>Por que este sinal?</PanelTitle>
              <ul className="list-disc pl-5 text-sm">{score?.why.map((w) => <li key={w}>{w}</li>)}</ul>
              {score?.risks.length ? <><div className="mt-2 text-sm font-bold">Riscos</div><ul className="list-disc pl-5 text-sm text-muted">{score.risks.map((w) => <li key={w}>{w}</li>)}</ul></> : null}
            </Panel>
            <Panel>
              <PanelTitle>Sinais semelhantes no passado</PanelTitle>
              {fwd && fwd.up2d24h !== null ? (
                <div className="text-sm">Quando score ≥ 70 apareceu (n={fwd.n}): <strong>+2% em 24h: {fwd.up2d24h.toFixed(0)}%</strong> · <strong>+5% em 7d: {(fwd.up5d7d ?? 0).toFixed(0)}%</strong></div>
              ) : <div className="text-sm text-muted">Insufficient sample size</div>}
              {bt && <div className="mt-2 text-sm text-muted">Backtest local (score≥70, hold 7d): {bt.trades} trades · win {bt.winRate.toFixed(1)}% · ret médio {bt.avgReturn.toFixed(2)}% · PF {bt.profitFactor.toFixed(2)} · DD {bt.maxDrawdown.toFixed(1)}%</div>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
