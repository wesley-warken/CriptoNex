import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MDot } from '@/components/minimal/MStats';
import { MRow } from '@/components/minimal/MRow';
import { MEmpty } from '@/components/minimal/MEmpty';
import { Eye, Plus, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { CoinLogo } from '@/components/ui/coin-logo';
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
  const [funnelOpen, setFunnelOpen] = useState(false);
  const funnelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!funnelOpen) return;
    const onDown = (e: PointerEvent) => {
      if (funnelRef.current && !funnelRef.current.contains(e.target as Node)) setFunnelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFunnelOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [funnelOpen]);
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
  // Logos: CoinGecko (universo) + CDN CoinCap via <CoinLogo/> — toda cripto com sua logo.
  const logoBySym = useMemo(() => {
    const mp = new Map<string, string>();
    for (const c of u.coins) if (c.image) mp.set(c.symbol, c.image);
    return mp;
  }, [u.coins]);
  // Preço e variação 24h por símbolo (crypto via market; ações ficam '—').
  const priceBySym = useMemo(() => new Map(m.data.map((d) => [d.symbol, d.price])), [m.data]);
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

  // Refinamento (funil): conta dims fora do padrão, chips e limpeza total.
  const refineChips: { key: string; label: string; clear: () => void }[] = [];
  if (tier !== 'ALL') refineChips.push({ key: 'tier', label: tier, clear: () => setTier('ALL') });
  if (minScore !== 60) refineChips.push({ key: 'ms', label: `Score ≥ ${minScore}`, clear: () => setMinScore(60) });
  if (minConf > 0) refineChips.push({ key: 'mc', label: `Conf ≥ ${minConf}%`, clear: () => setMinConf(0) });
  if (minRR > 0) refineChips.push({ key: 'rr', label: `R:R ≥ ${minRR}`, clear: () => setMinRR(0) });
  if (signal !== 'ALL') refineChips.push({ key: 'sig', label: signal === 'BUY' ? 'Compra' : signal === 'SELL' ? 'Venda' : 'Neutro', clear: () => setSignal('ALL') });
  if (onlyBuy) refineChips.push({ key: 'ob', label: 'Só compra', clear: () => setOnlyBuy(false) });
  if (hidePartial) refineChips.push({ key: 'hp', label: 'Oculta parciais', clear: () => setHidePartial(false) });
  if (confOnly) refineChips.push({ key: 'co', label: 'Confluência total', clear: () => setConfOnly(false) });
  if (q.trim()) refineChips.push({ key: 'q', label: `“${q.trim()}”`, clear: () => setQ('') });
  const refineCount = refineChips.length;
  const clearRefines = () => {
    setTier('ALL'); setMinScore(60); setMinConf(0); setMinRR(0);
    setSignal('ALL'); setOnlyBuy(false); setHidePartial(false); setConfOnly(false); setQ('');
  };

  if (m.loading && !pool.length) return <Skeleton className="h-96" />;
  if (m.error && !m.data.length && !pool.length) return <ErrorBox message={m.error} onRetry={() => { m.reload(); void scanner.start(base); }} />;

  return (
    <div className="space-y-6">
      {a.regime.label.includes('RISK-OFF') && (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-3 shadow-sm">
          <MDot tone="down">{a.regime.label}</MDot>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Mercado defensivo. Compras exigem confirmação extra; priorize ELITE com alta confiança e evite alavancagem.</p>
        </div>
      )}
      <MSection
        title="Filtros & Universo"
        right={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            {segment === 'B3' || segment === 'US' || segment === 'ALL' ? (
              scan && (scan.stock.total > 0 || scan.stock.running) ? (
                <span className="tabular-nums">ações {scan.stock.withScore.toLocaleString('pt-BR')} ({spct}%)</span>
              ) : null
            ) : null}
            {(segment === 'CRYPTO' || segment === 'ALL') && scan && (
              <span className="tabular-nums">crypto {scan.withScore.toLocaleString('pt-BR')} ({pct}%)</span>
            )}
            {scan && scan.conf.running && (
              <span className="tabular-nums">MTF {scan.conf.withConf.toLocaleString('pt-BR')}{scan.conf.errors > 0 ? ` (${scan.conf.errors} falhas)` : ''}</span>
            )}
            {scan?.running || scan?.stock.running ? (
              <button onClick={() => { scanner.pause(); scanner.pauseStocks(); scanner.pauseConfluence(); }} className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]">Pausar</button>
            ) : (
              <button onClick={() => { void scanner.start(base); void scanner.startStocks(allStocks); }} className="font-medium text-[var(--brand)] hover:underline transition-colors active:scale-[0.98]">
                Escanear
              </button>
            )}
            {!scan?.conf.running && (
              <button title="Segunda passada: confluência 4h+1d (crypto) e 1h+1d (ações) nos candidatos" onClick={() => { void scanner.startConfluence(); }} className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]">
                MTF
              </button>
            )}
          </span>
        }
      >
        {scan && (scan.running || scan.stock.running) && (
          <div className="mb-3 h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar" aria-label="Varredura em andamento">
            <div className="h-full bg-[var(--brand)] transition-[width] duration-200 ease-out" style={{ width: `${segment === 'B3' || segment === 'US' ? spct : pct}%` }} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs" role="tablist" aria-label="Segmento">
            {(Object.keys(segLabel) as Segment[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={segment === s}
                onClick={() => setSegment(s)}
                className={`rounded-[4px] px-3 py-1 text-xs font-medium transition-colors ${
                  segment === s
                    ? 'bg-[var(--surface-1)] font-semibold text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {segLabel[s]} <span className="text-[11px] tabular-nums opacity-75">({segCount[s].toLocaleString('pt-BR')})</span>
              </button>
            ))}
          </div>
          {segment === 'US' && (
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
              Bolsa
              <select value={exchange} onChange={(e) => setExchange(e.target.value)} aria-label="Bolsa" className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] shadow-sm">
                <option value="ALL">Todas</option>
                {exchanges.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          )}
          <label className="relative ml-auto flex min-w-44 flex-1 items-center sm:max-w-64">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar símbolo…"
              aria-label="Buscar símbolo"
              className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            Ordenar
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} aria-label="Ordenar por" className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] shadow-sm">
              <option value="score">Score</option>
              <option value="confidence">Confiança</option>
              <option value="dataQuality">Qualidade</option>
              <option value="alignment">Alinhamento</option>
              <option value="rr">R:R</option>
            </select>
          </label>
          <div ref={funnelRef} className="relative">
            <button
              type="button"
              onClick={() => setFunnelOpen((o) => !o)}
              aria-expanded={funnelOpen}
              aria-label={`Refinamento${refineCount > 0 ? `, ${refineCount} ativos` : ''}`}
              className={`relative rounded-[6px] border p-1.5 transition-all duration-150 ease-out active:scale-[0.98] shadow-sm ${
                funnelOpen || refineCount > 0
                  ? 'border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--brand)]'
                  : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              {refineCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold tabular-nums text-white">
                  {refineCount}
                </span>
              )}
            </button>
            {funnelOpen && (
              <div className="animate-popover absolute right-0 top-full z-20 mt-2">
                <OppRefinePopover
                  tier={tier} setTier={setTier} tierCounts={tierCounts} baseTotal={baseRanked.length}
                  minScore={minScore} setMinScore={setMinScore}
                  minConf={minConf} setMinConf={setMinConf}
                  minRR={minRR} setMinRR={setMinRR}
                  signal={signal} setSignal={setSignal}
                  onlyBuy={onlyBuy} setOnlyBuy={setOnlyBuy}
                  hidePartial={hidePartial} setHidePartial={setHidePartial}
                  confOnly={confOnly} setConfOnly={setConfOnly}
                />
              </div>
            )}
          </div>
        </div>
        {refineChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Refinamentos ativos">
            <span className="text-xs tabular-nums text-[var(--text-muted)]">Regime {a.regime.label}</span>
            {refineChips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] py-0.5 pl-2.5 pr-1.5 text-xs text-[var(--text-secondary)]">
                {c.label}
                <button
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remover ${c.label}`}
                  className="rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearRefines}
              className="px-1 text-xs text-[var(--text-muted)] hover:text-[var(--brand)] underline transition-colors active:scale-[0.98]"
            >
              limpar tudo
            </button>
          </div>
        )}
        <p className="mt-2 text-xs tabular-nums text-[var(--text-muted)]" role="status">
          {segment === 'MINE' && mineLoading
            ? 'Pontuando seus ativos…'
            : `${pool.length.toLocaleString('pt-BR')} ativos · ${ranked.length.toLocaleString('pt-BR')} no ranking`}
          {eta ? ` · ${eta}` : ''}
        </p>
      </MSection>
      {transitions.length > 0 && (
        <MSection
          title="Transições de tier"
          right={
            freshCount > 0 ? (
              <span className="text-xs normal-case tabular-nums text-[var(--text-muted)]">● {freshCount} desde sua última visita</span>
            ) : undefined
          }
        >
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
            {transitions.map(([symbol, v]) => (
              <Link
                key={symbol}
                to={`/monitor?symbol=${encodeURIComponent(symbol)}`}
                title={`${v.prev} → ${v.tier} ${agoShort(v.since)}`}
                className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.98]"
              >
                <strong className="font-bold text-[var(--text-primary)]">{symbol}</strong>{' '}
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  {v.prev} → {v.tier} · {agoShort(v.since)}
                  {v.since > prevVisit.current && prevVisit.current > 0 ? <span className="text-[var(--brand)] font-semibold"> · novo</span> : ''}
                </span>
              </Link>
            ))}
          </div>
        </MSection>
      )}
      <MSection title={`Ranking — ${ranked.length.toLocaleString('pt-BR')} ativos`}>
        {!ranked.length && <MEmpty title="Nada no filtro" hint="Baixe o Score mínimo, troque o segmento ou aguarde a varredura." />}
        <div className="max-h-[60vh] overflow-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] shadow-sm">
          <div className="divide-y divide-[var(--border-subtle)]">
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
              <div key={o.symbol} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
                <span className="w-8 text-right tabular-nums text-[var(--text-muted)] font-medium">#{i + 1}</span>
                <span className="flex w-28 items-center gap-2">
                  <CoinLogo symbol={o.symbol} image={logoBySym.get(o.symbol)} size={20} />
                  <Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="truncate font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors">{o.symbol}</Link>
                </span>
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]" title={`Score ${o.score}/100`}>
                  <div className="h-full bg-[var(--brand)]" style={{ width: `${Math.max(0, Math.min(100, o.score))}%` }} />
                </div>
                <span className="w-7 text-right tabular-nums font-bold text-[var(--text-primary)]">{o.score}</span>
                <ScoreAudit score={o} />
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{o.classification} · conf {o.confidence}% · DQ {o.dataQuality}%</span>
                <span className={`text-[11px] font-semibold ${o.signal === 'BUY' ? 'text-[var(--bull)]' : o.signal === 'SELL' ? 'text-[var(--bear)]' : 'text-[var(--text-muted)]'}`}>{o.signal === 'BUY' ? 'Compra' : o.signal === 'SELL' ? 'Venda' : 'Neutro'}</span>
                <span title={wfTip(conv)} className={`text-[11px] font-semibold ${conv === 'ELITE' ? 'rounded-[4px] px-1.5 py-0.5 bg-[var(--bull-bg)] text-[var(--bull-text)]' : conv === 'FORTE' ? 'rounded-[4px] px-1.5 py-0.5 bg-[var(--brand-muted)] text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>
                  {conv}
                </span>
                {o.plan ? (
                  <span className="text-[11px] tabular-nums text-[var(--text-secondary)]" title={`Entrada ${o.plan.entry} · stop ${o.plan.stop} · alvo ${o.plan.target1} (${o.plan.basis})`}>
                    R:R {o.plan.rr1.toFixed(1)} · stop {o.plan.stopPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)]">sem plano</span>
                )}
                {stretchPct != null && stretchPct >= 90 && (
                  <span className="text-[11px] text-[var(--warn)]" title={`Desvio vs SMA20 no percentil ${Math.round(stretchPct)} do universo — entrada atrasada, tier degradado`}>
                    esticado
                  </span>
                )}
                {conf != null &&
                  (conf.full ? (
                    <span className="text-[11px] font-bold tabular-nums text-[var(--bull)]" title={`${conf.tfA} ${conf.dirA} + ${conf.tfB} ${conf.dirB}`}>
                      {conf.tfA}✓ {conf.tfB}✓
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)]" title={`${conf.tfA} ${conf.dirA} vs ${conf.tfB} ${conf.dirB}`}>
                      {conf.tfA}/{conf.tfB}~
                    </span>
                  ))}
                {isNew && seen && (
                  <span className="text-[11px] tabular-nums text-[var(--brand)] font-semibold">novo {agoShort(seen.since)}</span>
                )}
                {trendPts && momPts && volPts && (
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]" title={`Tendência ${trendPts.earned}/${trendPts.max} · Momentum ${momPts.earned}/${momPts.max} · Volume ${volPts.earned}/${volPts.max}`}>
                    T{trendPts.earned} M{momPts.earned} V{volPts.earned}
                  </span>
                )}
                {o.dataQuality < 55 && <span className="text-[11px] text-[var(--text-muted)]">parcial</span>}
                <span className="ml-auto flex items-center gap-1.5">
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
                    className="rounded-[4px] p-1 text-[var(--text-muted)] hover:text-[var(--brand)] hover:bg-[var(--surface-2)] transition-colors active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Link>
                  <button title={isFav ? 'Remover dos favoritos' : 'Favoritar'} aria-pressed={isFav} onClick={() => toggleFav(o.symbol)} className={isFav ? 'p-1 text-amber-400 transition-colors duration-150 ease-out active:scale-[0.98]' : 'p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]'}><Star className="h-3.5 w-3.5" fill={isFav ? 'currentColor' : 'none'} aria-hidden="true" /></button>
                  <button title={isWatch ? 'Remover do watchlist' : 'Observar'} onClick={() => toggleWatch(o.symbol)} className={isWatch ? 'p-1 text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]' : 'p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]'}><Eye className="h-3.5 w-3.5" /></button>
                </span>
              </div>
            );
          })}
          {ranked.length > 400 && <div className="py-2 text-center text-xs tabular-nums text-[var(--text-muted)]">Mostrando top 400 de {ranked.length.toLocaleString('pt-BR')} — refine os filtros.</div>}
          </div>
        </div>
      </MSection>
      <div className="grid gap-6 lg:grid-cols-2">
        <MSection
          title="Calibração walk-forward"
          right={
            <span className="flex items-center gap-2 text-xs normal-case text-[var(--text-muted)]">
              {wfRunning && wfProg ? (
                <span className="tabular-nums">walk-forward: {wfProg.done}/{wfProg.total} ativos</span>
              ) : null}
              {wfRunning ? (
                <button onClick={() => wfCancel.current?.()} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]">Cancelar</button>
              ) : (
                <button onClick={runWF} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors active:scale-[0.98]">
                  {wf ? 'Recalibrar' : 'Calibrar'}
                </button>
              )}
            </span>
          }
        >
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm">
            {wfRunning && wfProg && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full bg-[var(--brand)] transition-all"
                  style={{ width: `${wfProg.total ? Math.round((wfProg.done / wfProg.total) * 100) : 0}%` }}
                />
              </div>
            )}
            {wfError && <div className="text-sm font-medium text-[var(--bear)]">{wfError}</div>}
            {!wf && !wfRunning && (
              <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                Rejoga o score em cada fechamento histórico e mede alvo-antes-stop em 10/20 candles por tier.
                Roda em worker (fundo), sob demanda, com cache de 7 dias.
              </div>
            )}
            {wf && (
              <>
                <div className="text-xs tabular-nums text-[var(--text-muted)]">
                  {wf.stats.symbols} ativos · {wf.stats.steps.toLocaleString('pt-BR')} sinais · calculado{' '}
                  {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(wf.ts))}
                </div>
                <dl className="mt-1 divide-y divide-[var(--border-subtle)]">
                  {(['ELITE', 'FORTE', 'OBSERVAR', 'EVITAR'] as const).map((t) => {
                    const h = Math.max(...wf.stats.horizons);
                    const r = tierHit(wf.stats, t, h);
                    const rr = tierAvgRR(wf.stats, t);
                    return (
                      <MRow
                        key={t}
                        k={t}
                        v={r ? `hit ${h}c ${(r.hit * 100).toFixed(0)}% (n=${r.n})` : '—'}
                        sub={rr ? `R:R ${rr.rr.toFixed(2)}` : undefined}
                      />
                    );
                  })}
                </dl>
                {wfSugg && (
                  <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2">
                    {wfSugg.notes.map((n) => (
                      <div key={n}>{n}</div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setTierGates({ ...wfSugg, source: 'walkforward' })}
                        className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors active:scale-[0.98]"
                      >
                        Aplicar gates
                      </button>
                      <button
                        onClick={() => setTierGates({ eliteMinScore: 75, forteMinScore: 65, source: 'padrao' })}
                        className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]"
                      >
                        Padrão
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="mt-2 text-xs tabular-nums text-[var(--text-muted)]">
              Gates atuais: ELITE≥{tierGates.eliteMinScore} FORTE≥{tierGates.forteMinScore} ({tierGates.source === 'padrao' ? 'padrão' : tierGates.source}).
            </div>
          </div>
        </MSection>
        <MSection
          title="Sua estatística real por tier"
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
                  className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors active:scale-[0.98]"
                >
                  Usar meus gates
                </button>
                <button
                  onClick={() => setTierGates({ eliteMinScore: 75, forteMinScore: 65, source: 'padrao' })}
                  className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.98]"
                >
                  Padrão
                </button>
              </span>
            ) : undefined
          }
        >
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm">
            {personal.closedTrades === 0 && (
              <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                Opere pela aba (botão + na linha) para taggear o contexto — ao fechar, o resultado alimenta win rate por tier aqui.
              </div>
            )}
            {personal.closedTrades > 0 && (
              <div>
                <dl className="divide-y divide-[var(--border-subtle)]">
                  {Object.entries(personal.byTier)
                    .sort((a, b) => b[1].trades - a[1].trades)
                    .map(([t, s]) => (
                      <MRow
                        key={t}
                        k={t}
                        v={`${s.trades} trades · win ${((s.wins / s.trades) * 100).toFixed(0)}% · PnL ${s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}`}
                      />
                    ))}
                </dl>
                <div className="mt-2 text-xs tabular-nums text-[var(--text-muted)]">
                  {personal.closedTrades} trades fechados no total
                  {personal.closedTrades < 30
                    ? ` — faltam ${30 - personal.closedTrades} para calibrar pelos seus dados.`
                    : '.'}
                </div>
                {personalSugg && (
                  <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2">
                    {personalSugg.notes.map((n) => (
                      <div key={n}>{n}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </MSection>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {Object.entries(cats).map(([k, v]) => (
          <MSection key={k} title={k}>
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
              {v.map((o) => (
                <div key={o.symbol} className="flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
                  <span className="flex items-center gap-2">
                    <CoinLogo symbol={o.symbol} image={logoBySym.get(o.symbol)} size={18} />
                    <Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="font-bold text-[var(--text-primary)] hover:text-[var(--brand)] transition-colors">{o.symbol}</Link>
                  </span>
                  <span className="text-right tabular-nums font-semibold text-[var(--text-secondary)]">{o.score}</span>
                </div>
              ))}
            </div>
          </MSection>
        ))}
      </div>
    </div>
  );
}

const TIER_TITLES: Record<TierFilter, string> = {
  ALL: 'Todas',
  ELITE: 'Score≥75, conf≥65, DQ≥60, BUY',
  FORTE: 'Score≥65, conf≥55',
  OBSERVAR: 'Score≥50',
  EVITAR: 'SELL ou score baixo',
};

function RefineOption({ selected, onClick, title, children }: {
  selected: boolean; onClick: () => void; title?: string; children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-[6px] border px-2.5 py-1 text-xs tabular-nums transition-all duration-150 ease-out active:scale-[0.98] ${
        selected
          ? 'border-[var(--brand)] bg-[var(--brand-muted)] font-semibold text-[var(--brand)]'
          : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function RefineGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Popover do funil: convicção, limites, sinal e interruptores. Aplica ao vivo. */
function OppRefinePopover(props: {
  tier: TierFilter; setTier: (t: TierFilter) => void;
  tierCounts: Record<Conviction, number>; baseTotal: number;
  minScore: number; setMinScore: (n: number) => void;
  minConf: number; setMinConf: (n: number) => void;
  minRR: number; setMinRR: (n: number) => void;
  signal: 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL'; setSignal: (s: 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL') => void;
  onlyBuy: boolean; setOnlyBuy: (b: boolean) => void;
  hidePartial: boolean; setHidePartial: (b: boolean) => void;
  confOnly: boolean; setConfOnly: (b: boolean) => void;
}) {
  const p = props;
  const numCls = 'w-16 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-right text-xs tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]';
  return (
    <div className="w-80 rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-xl">
      <div className="space-y-4">
        <RefineGroup label="Convicção">
          {(['ALL', 'ELITE', 'FORTE', 'OBSERVAR', 'EVITAR'] as TierFilter[]).map((t) => (
            <RefineOption
              key={t}
              title={TIER_TITLES[t]}
              selected={p.tier === t}
              onClick={() => p.setTier(t)}
            >
              {t === 'ALL' ? 'Todas' : t}{' '}
              <span className="text-[11px] opacity-75">{t === 'ALL' ? p.baseTotal : p.tierCounts[t as Conviction]}</span>
            </RefineOption>
          ))}
        </RefineGroup>
        <RefineGroup label="Limites">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            Score ≥
            <input type="number" min={0} max={100} value={p.minScore} onChange={(e) => p.setMinScore(clampScoreInput(Number(e.target.value)))} aria-label="Score mínimo" className={numCls} />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            Conf ≥
            <input type="number" min={0} max={100} value={p.minConf} onChange={(e) => p.setMinConf(clampScoreInput(Number(e.target.value)))} aria-label="Confiança mínima" className={numCls} />
            <span className="text-[var(--text-muted)]">%</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]" title="Filtra por R:R do plano (0 = desligado)">
            R:R ≥
            <input type="number" min={0} max={20} step={0.5} value={p.minRR} onChange={(e) => p.setMinRR(Math.max(0, Number(e.target.value) || 0))} aria-label="R:R mínimo" className={numCls} />
          </label>
        </RefineGroup>
        <RefineGroup label="Sinal">
          {(['ALL', 'BUY', 'SELL', 'NEUTRAL'] as const).map((s) => (
            <RefineOption key={s} selected={p.signal === s} onClick={() => p.setSignal(s)}>
              {s === 'ALL' ? 'Todos' : s === 'BUY' ? 'Compra' : s === 'SELL' ? 'Venda' : 'Neutro'}
            </RefineOption>
          ))}
        </RefineGroup>
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-secondary)]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={p.onlyBuy} onChange={(e) => p.setOnlyBuy(e.target.checked)} className="rounded border-[var(--border)] accent-[var(--brand)]" /> Só compra
          </label>
          <label className="flex cursor-pointer items-center gap-2" title="Oculta ativos com dados parciais (DQ < 55)">
            <input type="checkbox" checked={p.hidePartial} onChange={(e) => p.setHidePartial(e.target.checked)} className="rounded border-[var(--border)] accent-[var(--brand)]" /> Ocultar parciais
          </label>
          <label className="flex cursor-pointer items-center gap-2" title="Só ativos com acordo total entre os timeframes">
            <input type="checkbox" checked={p.confOnly} onChange={(e) => p.setConfOnly(e.target.checked)} className="rounded border-[var(--border)] accent-[var(--brand)]" /> Só confluência total
          </label>
        </div>
      </div>
    </div>
  );
}
