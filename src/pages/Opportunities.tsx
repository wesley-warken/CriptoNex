import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { useUniverseCrypto, useUniverseStocks } from '@/services/universeHooks';
import { scanner, scoreStockSymbols, orderB3Queue, orderUsQueue, exchangeOfYahoo, type ScanSnapshot, type StockScanItem } from '@/services/scanner';
import { binanceKlines } from '@/services/providers/binance';
import { runWalkforward, loadWalkforward, suggestGates, tierHit, tierAvgRR, type WFReport } from '@/services/walkforward';
import { recordSnapshots, loadSnapshots } from '@/services/entrySnapshots';
import { statsByEntryTier } from '@/lib/portfolio';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { isActiveCoin, type UniverseCoin } from '@/services/universeTypes';
import type { Candle, OpportunityScore } from '@/types';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { rankOpportunities, topCategories, effectiveTier, stretchPercentiles, stockSegment, clampScoreInput, type Conviction } from '@/engine/ranking';

type Segment = 'ALL' | 'CRYPTO' | 'B3' | 'US' | 'MINE';
type SortBy = 'score' | 'confidence' | 'dataQuality' | 'alignment' | 'rr';
type TierFilter = 'ALL' | Conviction;

const yahooOf = (symbol: string): string => {
  if (symbol.includes('.') || symbol.includes('=') || symbol.startsWith('^')) return symbol;
  if (/^[A-Z]{4}[346]$/.test(symbol)) return `${symbol}.SA`;
  return symbol;
};

/** "há Xmin/Xh" a partir de timestamp. */
export function agoShort(ts: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function Opportunities() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const a = useAnalysis(m.data, m.candles);
  const u = useUniverseCrypto();
  const su = useUniverseStocks();
  const customAssets = useStore((s) => s.customAssets);
  const watchlist = useStore((s) => s.watchlist);
  const favorites = useStore((s) => s.favorites);
  const toggleFav = useStore((s) => s.toggleFav);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const positions = useStore((s) => s.operations);
  const tierSeen = useStore((s) => s.tierSeen);
  const noteTiers = useStore((s) => s.noteTiers);
  const setLastVisitOpp = useStore((s) => s.setLastVisitOpp);
  const setPendingOp = useStore((s) => s.setPendingOp);
  const tierGates = useStore((s) => s.tierGates);
  const setTierGates = useStore((s) => s.setTierGates);
  const [scan, setScan] = useState<ScanSnapshot | null>(null);
  const [segment, setSegment] = useState<Segment>('ALL');
  const [exchange, setExchange] = useState('ALL');
  const [minScore, setMinScore] = useState(60);
  const [minConf, setMinConf] = useState(0);
  const [minRR, setMinRR] = useState(0);
  const [signal, setSignal] = useState<'ALL' | 'BUY' | 'SELL' | 'NEUTRAL'>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [onlyBuy, setOnlyBuy] = useState(false);
  const [hidePartial, setHidePartial] = useState(false);
  const [confOnly, setConfOnly] = useState(false);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<OpportunityScore[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
  // Fase 3 — calibração walk-forward (cache IDB de 7 dias).
  const [wf, setWf] = useState<WFReport | null>(null);
  const [wfRunning, setWfRunning] = useState(false);
  const [wfProg, setWfProg] = useState<{ done: number; total: number } | null>(null);
  const [wfError, setWfError] = useState<string | null>(null);
  const wfCancel = useRef<(() => void) | null>(null);
  useEffect(() => {
    void loadWalkforward().then(setWf).catch(() => undefined);
    void loadSnapshots().catch(() => undefined);
    return () => {
      wfCancel.current?.();
    };
  }, []);

  useEffect(() => {
    const l = (s: ScanSnapshot) => setScan(s);
    scanner.listeners.add(l);
    void scanner.boot().then(() => setScan(scanner.snap()));
    return () => {
      scanner.listeners.delete(l);
    };
  }, []);

  // "Mudou desde sua última visita": captura a visita anterior e carimba a
  // saída (só após 30s de permanência — evita zerar no remount do StrictMode).
  const visitStart = useRef(Date.now());
  const prevVisit = useRef(0);
  useEffect(() => {
    prevVisit.current = useStore.getState().lastVisitOpp || 0;
    return () => {
      if (Date.now() - visitStart.current > 30_000) setLastVisitOpp(Date.now());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base crypto: universo ativo por market cap
  const base: UniverseCoin[] = useMemo(
    () => u.coins.filter(isActiveCoin).sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0)),
    [u.coins],
  );
  useEffect(() => {
    if (base.length >= 50) void scanner.start(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.length > 0]);

  // Filas de ações (ordenadas no scanner: B3 líquidas e EUA megacaps primeiro)
  const b3Queue: StockScanItem[] = useMemo(() => orderB3Queue(su.b3), [su.b3]);
  const usQueue: StockScanItem[] = useMemo(() => orderUsQueue(su.us), [su.us]);

  // Fila única intercalada: megacaps EUA primeiro, depois B3 e EUA em blocos
  // alternados — os dois segmentos preenchem juntos desde o início.
  const allStocks = useMemo(() => {
    const mega = usQueue.slice(0, 30);
    const megaSet = new Set(mega.map((r) => r.symbol));
    const restUs = usQueue.filter((r) => !megaSet.has(r.symbol));
    const out: StockScanItem[] = [...mega];
    const CH = 50;
    const rounds = Math.max(Math.ceil(b3Queue.length / CH), Math.ceil(restUs.length / CH));
    for (let r = 0; r < rounds; r++) {
      out.push(...b3Queue.slice(r * CH, r * CH + CH), ...restUs.slice(r * CH, r * CH + CH));
    }
    return out;
  }, [b3Queue, usQueue]);
  useEffect(() => {
    if (b3Queue.length >= 50 && usQueue.length >= 100) void scanner.startStocks(allStocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b3Queue.length > 0, usQueue.length > 0]);

  // Meus ativos: watchlist + custom + portfolio, pontuados sob demanda
  const mineSyms = useMemo(() => {
    const set = new Set<string>();
    for (const s of watchlist) set.add(s);
    for (const c of customAssets) set.add(c.symbol);
    for (const p of positions) set.add(p.symbol);
    return [...set];
  }, [watchlist, customAssets, positions]);

  useEffect(() => {
    if (segment !== 'MINE' && segment !== 'ALL') return;
    let alive = true;
    (async () => {
      setMineLoading(true);
      try {
        const knownCrypto = new Set([...CRYPTO_ASSETS.map((x) => x.symbol), ...m.data.map((d) => d.symbol), ...a.scores.map((o) => o.symbol)]);
        const out: OpportunityScore[] = [];
        for (const o of a.scores) if (mineSyms.includes(o.symbol)) out.push(o);
        for (const o of scan?.results ?? []) if (mineSyms.includes(o.symbol) && !out.some((x) => x.symbol === o.symbol)) out.push(o);
        for (const o of scan?.stockResults ?? []) if (mineSyms.includes(o.symbol) && !out.some((x) => x.symbol === o.symbol)) out.push(o);
        const missing = mineSyms.filter((s) => !knownCrypto.has(s) && !out.some((x) => x.symbol === s));
        if (missing.length) {
          const fresh = await scoreStockSymbols(missing.slice(0, 60).map((s) => {
            const yahoo = yahooOf(s);
            return { symbol: s, yahoo, exchange: exchangeOfYahoo(yahoo), name: s };
          }));
          for (const o of fresh) if (!out.some((x) => x.symbol === o.symbol)) out.push(o);
        }
        if (alive) setMine(out);
      } finally {
        if (alive) setMineLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, mineSyms.join(','), scan?.withScore, scan?.stock?.withScore]);

  const exchanges = useMemo(() => [...new Set(usQueue.map((r) => r.exchange))].sort(), [usQueue]);

  const cryptoAll: OpportunityScore[] = useMemo(() => {
    const engine = new Map(a.scores.map((o) => [o.symbol, o]));
    const out: OpportunityScore[] = [...a.scores];
    for (const o of scan?.results ?? []) if (!engine.has(o.symbol)) out.push(o);
    return out;
  }, [a.scores, scan]);
  const stocksAll: OpportunityScore[] = useMemo(() => [...(scan?.stockResults ?? [])], [scan]);
  const b3Set = useMemo(() => new Set(b3Queue.map((b) => b.symbol)), [b3Queue]);
  const usSet = useMemo(() => new Set(usQueue.map((r) => r.symbol)), [usQueue]);
  // Yahoo por símbolo (filas do universo; fora delas, derivação padrão).
  // Garante partição completa B3/US/GLOBAL mesmo com drift símbolo↔universo.
  const yahooBySymbol = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of b3Queue) map.set(b.symbol, b.yahoo);
    for (const r of usQueue) if (!map.has(r.symbol)) map.set(r.symbol, r.yahoo);
    return map;
  }, [b3Queue, usQueue]);
  const segOf = (symbol: string): 'B3' | 'US' | 'GLOBAL' =>
    stockSegment(symbol, yahooBySymbol.get(symbol) ?? yahooOf(symbol), b3Set, usSet);
  const b3All = useMemo(() => stocksAll.filter((o) => segOf(o.symbol) === 'B3'), [stocksAll, b3Set, usSet, yahooBySymbol]);
  const usAll = useMemo(
    () => stocksAll.filter((o) => segOf(o.symbol) === 'US' && (exchange === 'ALL' ? true : usQueue.find((r) => r.symbol === o.symbol)?.exchange === exchange)),
    [stocksAll, b3Set, usSet, yahooBySymbol, usQueue, exchange],
  );

  const pool: OpportunityScore[] = useMemo(() => {
    if (segment === 'CRYPTO') return cryptoAll;
    if (segment === 'B3') return b3All;
    if (segment === 'US') return usAll;
    if (segment === 'MINE') return mine;
    const seen = new Map(cryptoAll.map((o) => [o.symbol, o]));
    for (const o of stocksAll) if (!seen.has(o.symbol)) seen.set(o.symbol, o);
    for (const o of mine) if (!seen.has(o.symbol)) seen.set(o.symbol, o);
    return [...seen.values()];
  }, [segment, cryptoAll, stocksAll, b3All, usAll, mine]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? pool.filter((o) => o.symbol.toLowerCase().includes(needle)) : pool),
    [pool, needle],
  );
  // Preço e variação 24h por símbolo (crypto via market; ações ficam '—').
  const priceBySym = useMemo(() => new Map(m.data.map((d) => [d.symbol, d.price])), [m.data]);
  const chg24BySym = useMemo(
    () => new Map(m.data.map((d) => [d.symbol, d.change24h ?? null] as [string, number | null])),
    [m.data],
  );
  const gatesParam = useMemo(
    () => ({ eliteMinScore: tierGates.eliteMinScore, forteMinScore: tierGates.forteMinScore }),
    [tierGates],
  );
  // Percentil de atraso no pool + tier efetivo (base → stretch → confluência).
  const stretchMap = useMemo(() => stretchPercentiles(pool), [pool]);
  const effOf = (o: OpportunityScore): { tier: Conviction; pct: number | null } => {
    const pct = o.stretchRaw != null ? (stretchMap.get(o.symbol) ?? null) : null;
    return { tier: effectiveTier(o, { stretchPct: pct, gates: gatesParam }), pct };
  };
  const baseRanked = useMemo(
    () => rankOpportunities(filtered, { minScore, minConfidence: minConf, signal, minRR }),
    [filtered, minScore, minConf, signal, minRR],
  );
  // Frescor: registra tiers efetivos a cada varredura (diff vira transições).
  useEffect(() => {
    const top = baseRanked.slice(0, 500);
    noteTiers(
      top.map((o) => ({
        symbol: o.symbol,
        tier: effOf(o).tier,
        price: priceBySym.get(o.symbol) ?? null,
      })),
    );
    // Ring buffer p/ taggear operações (Fase 4).
    recordSnapshots(
      top.map((o) => {
        const { tier, pct } = effOf(o);
        return {
          symbol: o.symbol,
          tier,
          score: o.score,
          rr: o.plan?.rr1 ?? null,
          stretch: pct,
          confFull: o.confluence?.full ?? false,
          ts: Date.now(),
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRanked, stretchMap, gatesParam, priceBySym, noteTiers]);
  const ranked = useMemo(() => {
    let out = baseRanked;
    if (onlyBuy) out = out.filter((o) => o.signal === 'BUY');
    if (hidePartial) out = out.filter((o) => o.dataQuality >= 55);
    if (confOnly) out = out.filter((o) => o.confluence?.full);
    if (tier !== 'ALL') out = out.filter((o) => effOf(o).tier === tier);
    const by: Record<SortBy, (x: OpportunityScore, y: OpportunityScore) => number> = {
      score: (x, y) => y.score - x.score || y.confidence - x.confidence,
      confidence: (x, y) => y.confidence - x.confidence || y.score - x.score,
      dataQuality: (x, y) => y.dataQuality - x.dataQuality || y.score - x.score,
      alignment: (x, y) => y.timeframeAlignment - x.timeframeAlignment || y.score - x.score,
      rr: (x, y) => (y.plan?.rr1 ?? -1) - (x.plan?.rr1 ?? -1) || y.score - x.score,
    };
    return [...out].sort(by[sortBy]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRanked, onlyBuy, hidePartial, confOnly, tier, sortBy, stretchMap, gatesParam]);
  const tierCounts = useMemo(() => {
    const c: Record<Conviction, number> = { ELITE: 0, FORTE: 0, OBSERVAR: 0, EVITAR: 0 };
    for (const o of baseRanked) c[effOf(o).tier] += 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRanked, stretchMap, gatesParam]);
  const spotlight = useMemo(
    () => baseRanked.filter((o) => o.signal === 'BUY' && effOf(o).tier === 'ELITE').slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseRanked, stretchMap, gatesParam],
  );
  // Transições recentes de tier (para o feed "mudou").
  const transitions = useMemo(
    () =>
      Object.entries(tierSeen)
        .filter(([, v]) => v.prev != null && v.prev !== v.tier)
        .sort((a, b) => b[1].since - a[1].since)
        .slice(0, 8),
    [tierSeen],
  );
  const freshCount = useMemo(
    () => (prevVisit.current > 0 ? transitions.filter(([, v]) => v.since > prevVisit.current).length : 0),
    [transitions],
  );
  // Fase 3 — roda walk-forward (crypto com histórico; sob demanda, cacheado).
  const runWF = () => {
    if (wfRunning) return;
    setWfError(null);
    setWfRunning(true);
    setWfProg({ done: 0, total: 1 });
    (async () => {
      try {
        const H = 20;
        const minLen = 60 + H + 1;
        const candles: Record<string, Candle[]> = {};
        for (const [s, kl] of Object.entries(m.candles)) {
          if (kl && kl.length >= minLen) candles[s] = kl;
        }
        // Estende com top pares pontuados fora dos 25 do market (teto 80).
        const scored = [...(scan?.results ?? [])]
          .filter((o) => o.score >= 60 && !candles[o.symbol])
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(0, 80 - Object.keys(candles).length));
        const pairs = scored
          .map((o) => CRYPTO_ASSETS.find((x) => x.symbol === o.symbol)?.binanceSymbol)
          .filter((p): p is string => !!p);
        for (let i = 0; i < pairs.length; i += 4) {
          const batch = await Promise.all(
            pairs.slice(i, i + 4).map(async (p) => {
              try {
                const kl = await binanceKlines(p, '1d', 400);
                return { p, kl };
              } catch {
                return { p, kl: [] as Candle[] };
              }
            }),
          );
          for (const { p, kl } of batch) {
            if (kl.length >= minLen) candles[p.replace(/USDT$/, '')] = kl;
          }
        }
        const { promise, cancel } = runWalkforward(candles, { horizons: [10, 20], stride: 2, minScore: 60 }, (done, total) =>
          setWfProg({ done, total }),
        );
        wfCancel.current = cancel;
        setWf(await promise);
      } catch (e) {
        setWfError(e instanceof Error ? e.message : 'Falha no walk-forward');
      } finally {
        wfCancel.current = null;
        setWfRunning(false);
        setWfProg(null);
      }
    })();
  };
  const wfSugg = useMemo(() => (wf ? suggestGates(wf.stats) : null), [wf]);
  const wfTip = (tier: Conviction): string | undefined => {
    if (!wf) return undefined;
    const h = Math.max(...wf.stats.horizons);
    const r = tierHit(wf.stats, tier, h);
    const rr = tierAvgRR(wf.stats, tier);
    if (!r) return `Sem amostra walk-forward p/ ${tier} (n<30)`;
    return `Hit ${h}c: ${(r.hit * 100).toFixed(0)}% (n=${r.n})${rr ? ` · R:R médio ${rr.rr.toFixed(2)}` : ''}`;
  };
  // Fase 4 — sua estatística real por tier de entrada (FIFO).
  const personal = useMemo(() => statsByEntryTier(positions), [positions]);
  const personalSugg = useMemo(() => {
    if (personal.closedTrades < 30) return null;
    let eliteMinScore = 75;
    let forteMinScore = 65;
    const notes: string[] = [];
    const e = personal.byTier.ELITE;
    if (e && e.trades >= 10) {
      const wr = e.wins / e.trades;
      if (wr < 0.5) {
        eliteMinScore = 80;
        notes.push(`Seu ELITE: win ${(wr * 100).toFixed(0)}% (n=${e.trades}) < 50% → gate 80.`);
      } else notes.push(`Seu ELITE: win ${(wr * 100).toFixed(0)}% (n=${e.trades}) — gate 75 mantido.`);
    }
    const f = personal.byTier.FORTE;
    if (f && f.trades >= 10) {
      const wr = f.wins / f.trades;
      if (wr < 0.45) {
        forteMinScore = 70;
        notes.push(`Seu FORTE: win ${(wr * 100).toFixed(0)}% (n=${f.trades}) < 45% → gate 70.`);
      } else notes.push(`Seu FORTE: win ${(wr * 100).toFixed(0)}% (n=${f.trades}) — gate 65 mantido.`);
    }
    if (!notes.length) return null;
    return { eliteMinScore, forteMinScore, notes };
  }, [personal]);
  const cats = useMemo(
    () => topCategories(baseRanked.length ? baseRanked : a.scores),
    [baseRanked, a.scores],
  );

  const pct = scan && scan.total ? Math.round((scan.scanned / scan.total) * 100) : 0;
  const spct = scan && scan.stock.total ? Math.round((scan.stock.scanned / scan.stock.total) * 100) : 0;
  const segLabel: Record<Segment, string> = { ALL: 'Todas', CRYPTO: 'Crypto', B3: 'B3', US: 'EUA', MINE: 'Meus ativos' };
  const segCount: Record<Segment, number> = { ALL: cryptoAll.length + stocksAll.length, CRYPTO: cryptoAll.length, B3: b3All.length, US: usAll.length, MINE: mine.length };

  // ETA da varredura ativa (taxa observada)
  const t0 = useRef(0);
  const anyRunning = !!scan?.running || !!scan?.stock.running;
  useEffect(() => {
    if (anyRunning && !t0.current) t0.current = Date.now();
    if (!anyRunning) t0.current = 0;
  }, [anyRunning]);
  const eta = useMemo(() => {
    if (!scan || !t0.current) return '';
    const active = segment === 'B3' || segment === 'US' ? scan.stock : scan;
    const remaining = active.total - active.scanned;
    if (remaining <= 0 || !active.running) return '';
    const elapsedMin = Math.max((Date.now() - t0.current) / 60000, 1 / 60);
    const rate = active.scanned / elapsedMin;
    if (rate <= 0) return '';
    const mins = Math.ceil(remaining / rate);
    return mins < 1 ? 'menos de 1 min restante' : `≈ ${mins} min restantes (${Math.round(rate)}/min)`;
  }, [scan, segment]);

  if (m.loading && !pool.length) return <Skeleton className="h-96" />;
  if (m.error && !m.data.length && !pool.length) return <ErrorBox message={m.error} onRetry={() => { m.reload(); void scanner.start(base); }} />;

  return (
    <div className="space-y-4">
      {a.regime.label.includes('RISK-OFF') && (
        <Panel>
          <div className="text-sm">⚠ Regime <strong>{a.regime.label}</strong> — mercado defensivo. Compras exigem confirmação extra; priorize ELITE com alta confiança e evite alavancagem.</div>
        </Panel>
      )}
      {spotlight.length > 0 && (
        <Panel>
          <PanelTitle>Destaques de convicção ELITE — top {spotlight.length}</PanelTitle>
          <div className="grid gap-2 md:grid-cols-3">
            {spotlight.map((o) => (
              <div key={o.symbol} className="rounded-lg border border-[var(--accent)] p-3">
                <div className="flex items-center justify-between">
                  <Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="text-lg font-bold hover:underline">{o.symbol}</Link>
                  <span className="flex items-center gap-2">
                    <Badge tone="up">Compra</Badge>
                    <span className="tabular font-bold">{o.score}</span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">conf {o.confidence}% · DQ {o.dataQuality}% · alinhamento {o.timeframeAlignment}%</div>
                <div className="mt-1 text-xs tabular">
                  {o.plan ? (
                    <span>R:R {o.plan.rr1.toFixed(1)} · stop {o.plan.stopPct.toFixed(1)}%</span>
                  ) : (
                    <span className="text-muted">sem plano (S/R inválido)</span>
                  )}
                  {(() => {
                    const c = chg24BySym.get(o.symbol);
                    return <span className="text-muted"> · 24h {c == null ? '—' : `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`}</span>;
                  })()}
                </div>
                <div className="mt-1 text-xs">{o.why.slice(0, 2).join(' · ')}</div>
                {o.risks.length > 0 && <div className="mt-1 text-xs text-muted">Risco: {o.risks[0]}</div>}
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel>
        <PanelTitle
          right={
            <span className="flex items-center gap-2 text-xs normal-case">
              {segment === 'B3' || segment === 'US' || segment === 'ALL' ? (
                scan && (scan.stock.total > 0 || scan.stock.running) ? (
                  <span>ações: {scan.stock.withScore.toLocaleString('pt-BR')} pontuadas ({spct}%)</span>
                ) : null
              ) : null}
              {(segment === 'CRYPTO' || segment === 'ALL') && scan && (
                <span>crypto: {scan.withScore.toLocaleString('pt-BR')} pontuadas ({pct}%)</span>
              )}
              {scan && scan.conf.running && (
                <span>MTF: {scan.conf.withConf.toLocaleString('pt-BR')} com confluência{scan.conf.errors > 0 ? ` (${scan.conf.errors} falhas)` : ''}</span>
              )}
              {scan?.running || scan?.stock.running ? (
                <button onClick={() => { scanner.pause(); scanner.pauseStocks(); scanner.pauseConfluence(); }} className="rounded border border-[var(--border)] px-2 py-0.5">Pausar</button>
              ) : (
                <button onClick={() => { void scanner.start(base); void scanner.startStocks(allStocks); }} className="rounded border border-[var(--border)] px-2 py-0.5">
                  Escanear
                </button>
              )}
              {!scan?.conf.running && (
                <button title="Segunda passada: confluência 4h+1d (crypto) e 1h+1d (ações) nos candidatos" onClick={() => { void scanner.startConfluence(); }} className="rounded border border-[var(--border)] px-2 py-0.5">
                  MTF
                </button>
              )}
            </span>
          }
        >
          Oportunidades — filtros
        </PanelTitle>
        {scan && (scan.running || scan.stock.running) && (
          <div className="mb-2 h-1.5 overflow-hidden rounded bg-[var(--surface-2)]">
            <div className="h-1.5 rounded bg-[var(--accent)] transition-all" style={{ width: `${segment === 'B3' || segment === 'US' ? spct : pct}%` }} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {(Object.keys(segLabel) as Segment[]).map((s) => (
              <button key={s} onClick={() => setSegment(s)} className={s === segment ? 'bg-[var(--accent)] px-3 py-1.5 font-bold text-black' : 'px-3 py-1.5 text-muted'}>
                {segLabel[s]} <span className="tabular text-xs opacity-80">({segCount[s].toLocaleString('pt-BR')})</span>
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {(['ALL', 'ELITE', 'FORTE', 'OBSERVAR', 'EVITAR'] as TierFilter[]).map((t) => (
              <button key={t} onClick={() => setTier(t)} title={t === 'ALL' ? 'Todas' : t === 'ELITE' ? 'Score≥75, conf≥65, DQ≥60, BUY' : t === 'FORTE' ? 'Score≥65, conf≥55' : t === 'OBSERVAR' ? 'Score≥50' : 'SELL ou score baixo'} className={t === tier ? 'bg-[var(--accent-2)] px-2.5 py-1.5 font-bold text-white' : 'px-2.5 py-1.5 text-muted'}>
                {t === 'ALL' ? 'Todas' : t} <span className="tabular text-xs opacity-80">{t === 'ALL' ? `(${baseRanked.length})` : `(${tierCounts[t as Conviction]})`}</span>
              </button>
            ))}
          </div>
          {segment === 'US' && (
            <label>Bolsa <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1"><option value="ALL">Todas</option>{exchanges.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          )}
          <label>Ordenar <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1"><option value="score">Score</option><option value="confidence">Confiança</option><option value="dataQuality">Qualidade</option><option value="alignment">Alinhamento</option><option value="rr">R:R</option></select></label>
          <label>Buscar <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="símbolo…" className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" /></label>
          <label>Score ≥ <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(clampScoreInput(Number(e.target.value)))} className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" /></label>
          <label>Confiança ≥ <input type="number" min={0} max={100} value={minConf} onChange={(e) => setMinConf(clampScoreInput(Number(e.target.value)))} className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" />%</label>
          <label title="Filtra por R:R do plano (0 = desligado)">R:R ≥ <input type="number" min={0} max={20} step={0.5} value={minRR} onChange={(e) => setMinRR(Math.max(0, Number(e.target.value) || 0))} className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" /></label>
          <label>Sinal <select value={signal} onChange={(e) => setSignal(e.target.value as typeof signal)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1"><option value="ALL">Todos</option><option value="BUY">Compra</option><option value="SELL">Venda</option><option value="NEUTRAL">Neutro</option></select></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={onlyBuy} onChange={(e) => setOnlyBuy(e.target.checked)} /> Só compra</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={hidePartial} onChange={(e) => setHidePartial(e.target.checked)} /> Ocultar parciais</label>
          <label title="Só ativos com acordo total entre os timeframes do stage 2" className="flex items-center gap-1"><input type="checkbox" checked={confOnly} onChange={(e) => setConfOnly(e.target.checked)} /> Só confluência total</label>
          <span className="text-muted">Regime atual: {a.regime.label}</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          {segment === 'MINE' && mineLoading ? 'Pontuando seus ativos…' : `Ranking sobre ${pool.length.toLocaleString('pt-BR')} ativos pontuados no segmento ${segLabel[segment]}.`}
          {' '}{segment === 'CRYPTO' || segment === 'ALL' ? 'Scores parciais de crypto (sem volume/OHLC) mostram DQ ≤ 50 — abra a auditoria do score para ver.' : 'Ações usam candles completos do Yahoo (OHLC + volume).'}
          {eta && <span> Varredura em andamento: {eta}.</span>}
        </div>
      </Panel>
      {transitions.length > 0 && (
        <Panel>
          <PanelTitle
            right={
              freshCount > 0 ? (
                <span className="text-xs normal-case text-muted">● {freshCount} desde sua última visita</span>
              ) : undefined
            }
          >
            Transições de tier
          </PanelTitle>
          <div className="flex flex-wrap gap-2 text-sm">
            {transitions.map(([symbol, v]) => (
              <Link
                key={symbol}
                to={`/monitor?symbol=${encodeURIComponent(symbol)}`}
                title={`${v.prev} → ${v.tier} ${agoShort(v.since)}`}
                className="rounded-lg border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface-2)]"
              >
                <strong>{symbol}</strong>{' '}
                <span className="text-xs text-muted">
                  {v.prev} → {v.tier} · {agoShort(v.since)}
                  {v.since > prevVisit.current && prevVisit.current > 0 ? ' ●' : ''}
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      )}
      <Panel>
        <PanelTitle>Ranking — {ranked.length.toLocaleString('pt-BR')} ativos</PanelTitle>
        {!ranked.length && <Empty title="Nada no filtro" hint="Baixe o Score mínimo, troque o segmento ou aguarde a varredura." />}
        <div className="max-h-[60vh] overflow-auto">
          {ranked.slice(0, 400).map((o, i) => {
            const { tier: conv, pct: stretchPct } = effOf(o);
            const trendPts = o.breakdown.find((b) => b.label === 'TREND');
            const momPts = o.breakdown.find((b) => b.label === 'MOMENTUM');
            const volPts = o.breakdown.find((b) => b.label === 'VOLUME');
            const isFav = favorites.includes(o.symbol);
            const isWatch = watchlist.includes(o.symbol);
            const seen = tierSeen[o.symbol];
            const isNew =
              seen != null &&
              (conv === 'ELITE' || conv === 'FORTE') &&
              seen.tier === conv &&
              Date.now() - seen.since < 120 * 60000;
            const conf = o.confluence;
            return (
              <div key={o.symbol} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-2 text-sm">
                <span className="tabular w-10 text-muted">#{i + 1}</span>
                <Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="w-20 truncate font-bold hover:underline">{o.symbol}</Link>
                <div className="h-2 w-20 overflow-hidden rounded bg-[var(--surface-2)]" title={`Score ${o.score}/100`}>
                  <div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, o.score))}%` }} />
                </div>
                <span className="tabular w-8 font-bold">{o.score}</span>
                <ScoreAudit score={o} />
                <span className="text-xs text-muted">{o.classification} · conf {o.confidence}% · DQ {o.dataQuality}%</span>
                <Badge tone={o.signal === 'BUY' ? 'up' : o.signal === 'SELL' ? 'down' : 'warn'}>{o.signal === 'BUY' ? 'Compra' : o.signal === 'SELL' ? 'Venda' : 'Neutro'}</Badge>
                <span title={wfTip(conv)}>
                  <Badge tone={conv === 'ELITE' ? 'up' : conv === 'FORTE' ? 'accent' : conv === 'OBSERVAR' ? 'warn' : undefined}>{conv}</Badge>
                </span>
                {o.plan ? (
                  <span className="tabular text-xs" title={`Entrada ${o.plan.entry} · stop ${o.plan.stop} · alvo ${o.plan.target1} (${o.plan.basis})`}>
                    R:R {o.plan.rr1.toFixed(1)} · stop {o.plan.stopPct.toFixed(1)}%
                  </span>
                ) : (
                  <Badge tone="warn">sem plano</Badge>
                )}
                {stretchPct != null && stretchPct >= 90 && (
                  <span title={`Desvio vs SMA20 no percentil ${Math.round(stretchPct)} do universo — entrada atrasada, tier degradado`}>
                    <Badge tone="warn">esticado</Badge>
                  </span>
                )}
                {conf != null &&
                  (conf.full ? (
                    <span className="text-xs font-bold text-[var(--up)]" title={`${conf.tfA} ${conf.dirA} + ${conf.tfB} ${conf.dirB}`}>
                      {conf.tfA}✓ {conf.tfB}✓
                    </span>
                  ) : (
                    <span className="text-xs text-muted" title={`${conf.tfA} ${conf.dirA} vs ${conf.tfB} ${conf.dirB}`}>
                      {conf.tfA}/{conf.tfB}~
                    </span>
                  ))}
                {isNew && seen && (
                  <Badge tone="accent">novo {agoShort(seen.since)}</Badge>
                )}
                {trendPts && momPts && volPts && (
                  <span className="text-xs text-muted" title={`Tendência ${trendPts.earned}/${trendPts.max} · Momentum ${momPts.earned}/${momPts.max} · Volume ${volPts.earned}/${volPts.max}`}>
                    T{trendPts.earned} M{momPts.earned} V{volPts.earned}
                  </span>
                )}
                {o.dataQuality < 55 && <Badge tone="warn">⚠ parcial</Badge>}
                <span className="ml-auto flex gap-1">
                  <Link
                    to="/portfolio"
                    title="Operar: preenche no Portfolio com tier, R:R e contexto atuais"
                    onClick={() => {
                      const kind: 'crypto' | 'stock' = CRYPTO_ASSETS.some((x) => x.symbol === o.symbol) ? 'crypto' : 'stock';
                      setPendingOp({
                        symbol: o.symbol,
                        kind,
                        tier: conv,
                        score: o.score,
                        rr: o.plan?.rr1 ?? null,
                        stretch: stretchPct,
                        confFull: conf?.full ?? false,
                      });
                    }}
                    className="text-muted hover:text-[var(--accent)]"
                  >
                    ＋
                  </Link>
                  <button title={isFav ? 'Remover dos favoritos' : 'Favoritar'} onClick={() => toggleFav(o.symbol)} className={isFav ? 'font-bold text-[var(--accent)]' : 'text-muted'}>★</button>
                  <button title={isWatch ? 'Remover do watchlist' : 'Observar'} onClick={() => toggleWatch(o.symbol)} className={isWatch ? 'font-bold text-[var(--accent)]' : 'text-muted'}>👁</button>
                </span>
              </div>
            );
          })}
          {ranked.length > 400 && <div className="py-2 text-center text-xs text-muted">Mostrando top 400 de {ranked.length.toLocaleString('pt-BR')} — refine os filtros.</div>}
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelTitle
            right={
              <span className="flex items-center gap-2 text-xs normal-case">
                {wfRunning && wfProg ? (
                  <span>walk-forward: {wfProg.done}/{wfProg.total} ativos</span>
                ) : null}
                {wfRunning ? (
                  <button onClick={() => wfCancel.current?.()} className="rounded border border-[var(--border)] px-2 py-0.5">Cancelar</button>
                ) : (
                  <button onClick={runWF} className="rounded border border-[var(--border)] px-2 py-0.5">
                    {wf ? 'Recalibrar' : 'Calibrar'}
                  </button>
                )}
              </span>
            }
          >
            Calibração walk-forward
          </PanelTitle>
          {wfRunning && wfProg && (
            <div className="mb-2 h-1.5 overflow-hidden rounded bg-[var(--surface-2)]">
              <div
                className="h-1.5 rounded bg-[var(--accent-2)] transition-all"
                style={{ width: `${wfProg.total ? Math.round((wfProg.done / wfProg.total) * 100) : 0}%` }}
              />
            </div>
          )}
          {wfError && <div className="text-sm text-[var(--down)]">{wfError}</div>}
          {!wf && !wfRunning && (
            <div className="text-sm text-muted">
              Rejoga o score em cada fechamento histórico e mede alvo-antes-stop em 10/20 candles por tier.
              Roda em worker (fundo), sob demanda, com cache de 7 dias.
            </div>
          )}
          {wf && (
            <>
              <div className="text-xs text-muted">
                {wf.stats.symbols} ativos · {wf.stats.steps.toLocaleString('pt-BR')} sinais · calculado{' '}
                {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(wf.ts))}
              </div>
              <div className="mt-1 space-y-1 text-sm">
                {(['ELITE', 'FORTE', 'OBSERVAR', 'EVITAR'] as const).map((t) => {
                  const h = Math.max(...wf.stats.horizons);
                  const r = tierHit(wf.stats, t, h);
                  const rr = tierAvgRR(wf.stats, t);
                  return (
                    <div key={t} className="flex justify-between tabular">
                      <span className="font-bold">{t}</span>
                      <span className="text-muted">
                        {r ? `hit ${h}c ${(r.hit * 100).toFixed(0)}% (n=${r.n})` : 'sem amostra'}
                        {rr ? ` · R:R ${rr.rr.toFixed(2)}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
              {wfSugg && (
                <div className="mt-2 space-y-1 text-xs text-muted">
                  {wfSugg.notes.map((n) => (
                    <div key={n}>{n}</div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setTierGates({ ...wfSugg, source: 'walkforward' })}
                      className="rounded border border-[var(--border)] px-2 py-1 text-sm"
                    >
                      Aplicar gates
                    </button>
                    <button
                      onClick={() => setTierGates({ eliteMinScore: 75, forteMinScore: 65, source: 'padrao' })}
                      className="rounded border border-[var(--border)] px-2 py-1 text-sm"
                    >
                      Padrão
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="mt-1 text-xs text-muted">
            Gates atuais: ELITE≥{tierGates.eliteMinScore} FORTE≥{tierGates.forteMinScore} ({tierGates.source === 'padrao' ? 'padrão' : tierGates.source}).
          </div>
        </Panel>
        <Panel>
          <PanelTitle
            right={
              personalSugg ? (
                <span className="flex items-center gap-2 text-xs normal-case">
                  <button
                    onClick={() =>
                      setTierGates({
                        eliteMinScore: personalSugg.eliteMinScore,
                        forteMinScore: personalSugg.forteMinScore,
                        source: 'pessoal',
                      })
                    }
                    className="rounded border border-[var(--border)] px-2 py-0.5"
                  >
                    Usar meus gates
                  </button>
                  <button
                    onClick={() => setTierGates({ eliteMinScore: 75, forteMinScore: 65, source: 'padrao' })}
                    className="rounded border border-[var(--border)] px-2 py-0.5"
                  >
                    Padrão
                  </button>
                </span>
              ) : undefined
            }
          >
            Sua estatística
          </PanelTitle>
          {personal.closedTrades === 0 && (
            <div className="text-sm text-muted">
              Opere pela aba (botão ＋ na linha) para taggear o contexto — ao fechar, o resultado alimenta win rate por tier aqui.
            </div>
          )}
          {personal.closedTrades > 0 && (
            <div className="mt-1 space-y-1 text-sm">
              {Object.entries(personal.byTier)
                .sort((a, b) => b[1].trades - a[1].trades)
                .map(([t, s]) => (
                  <div key={t} className="flex justify-between tabular">
                    <span className="font-bold">{t}</span>
                    <span className="text-muted">
                      {s.trades} trades · win {((s.wins / s.trades) * 100).toFixed(0)}% · PnL {s.pnl >= 0 ? '+' : ''}
                      {s.pnl.toFixed(2)}
                    </span>
                  </div>
                ))}
              <div className="text-xs text-muted">
                {personal.closedTrades} trades fechados no total
                {personal.closedTrades < 30
                  ? ` — faltam ${30 - personal.closedTrades} para calibrar pelos seus dados.`
                  : '.'}
              </div>
              {personalSugg && (
                <div className="space-y-1 text-xs text-muted">
                  {personalSugg.notes.map((n) => (
                    <div key={n}>{n}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(cats).map(([k, v]) => (
          <Panel key={k}><PanelTitle>{k}</PanelTitle>{v.map((o) => <div key={o.symbol} className="flex justify-between py-1 text-sm"><Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="font-semibold hover:underline">{o.symbol}</Link><span className="tabular">{o.score}</span></div>)}</Panel>
        ))}
      </div>
    </div>
  );
}
