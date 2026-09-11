import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useUniverseCrypto } from '@/services/universeHooks';
import { ensureTopKlines, closesToCandles, snapOf, type IndSnap } from '@/services/indicatorTable';
import { ensureRsiTable, getIntervalKlines, rsiBand, RSI_COLS, RSI_SORT_KEYS, sampleEvery, type RsiCol, type RsiFilter, type RsiOp, type RsiSnap } from '@/services/rsiTable';
import { coinTrend, coinTrendMultiTF, shiftLabel, TREND_LEVEL, TREND_MODE_LEGS, type CoinTrend, type TrendOhlc, type TrendState, type TrendTf } from '@/engine/trend';
import { unusualMove } from '@/engine/attention';
import { computeMaSet, ensureMaKlines, maCrossDiff, maCrossTitle, slowsFor, MA_FASTS, type MaFast, type MaKind, type MaSet } from '@/services/maTable';
import { isActiveCoin, isStablecoin, type UniverseCoin } from '@/services/universeTypes';
import type { Candle } from '@/types';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox, Empty, Seg, Btn, Micro } from '@/components/ui/kit';
import { ArrowUpRight, BarChart3, Bell, CheckCircle2, Eye, Filter, Flame, Gem, Globe, Info, ListPlus, Maximize2, RotateCw, Siren, Star, TrendingDown, TrendingUp, TriangleAlert, Zap, type LucideIcon } from 'lucide-react';
import { MarketStrip } from '@/components/analysis/MarketStrip';
import { fmtUSD, fmtPct, fmtPrice } from '@/lib/format';
import { calcBB, calcStoch, calcSupertrendFull } from '@/engine/indicators';
import {
  buildMonData, evalFilter, evalMonitor, loadFirstSeen, planMonitorData, saveFirstSeen,
  MON_COLORS, MON_FIELDS, MON_ICONS, MON_INDICATORS, MON_OPS, MON_TFS, PRESET_FILTERS, TREND_LEVEL_OPTIONS,
  type MonColor, type MonCondition, type MonData, type MonFilter, type MonIndicator, type MonOp, type MonTf,
} from '@/engine/monitor';

type Tab = 'MON' | 'BTC' | 'PERF' | 'TREND' | 'RSI' | 'STOCH' | 'SUPER' | 'VOL' | 'MACD' | 'BB' | 'SMA' | 'EMA' | 'SR';
type SortKey = 'marketCap' | 'price' | 'change1h' | 'change24h' | 'change7d' | 'change30d' | 'change1y' | 'volume24h'
  | 'trendCurto' | 'trendMedio' | 'trendLongo' | 'mudCurto' | 'mudMedio' | 'mudLongo' | RsiCol
  | 'stochFast' | 'stochSlow' | 'superH1' | 'superH4' | 'superD1' | 'superW1'
  | 'attToday' | 'attRatio' | 'bbUpper' | 'bbLower';

const TABS: { k: Tab; label: string }[] = [
  { k: 'MON', label: 'Monitor' },
  { k: 'BTC', label: 'BTC vs Altcoins' },
  { k: 'PERF', label: 'Performance' },
  { k: 'TREND', label: 'Tendência' },
  { k: 'RSI', label: 'RSI' },
  { k: 'STOCH', label: 'Stoch' },
  { k: 'SUPER', label: 'Supertrend' },
  { k: 'VOL', label: 'Volume de Atenção' },
  { k: 'MACD', label: 'MACD Signal' },
  { k: 'BB', label: 'Bollinger' },
  { k: 'SMA', label: 'SMA' },
  { k: 'EMA', label: 'EMA' },
  { k: 'SR', label: 'S/R' },
];
const IND_TABS: Tab[] = ['STOCH', 'VOL', 'MACD', 'SR'];
const ROW_H = 42;

/** Stoch rápido/lento de um tempo gráfico. */
interface StochTf { k: number | null; d: number | null }
/** Bandas de Bollinger de um tempo gráfico. */
interface BbTf { upper: number | null; mid: number | null; lower: number | null }
/** Supertrend por tempo gráfico: direção + nível. */
interface SuperTf { dir: 'BULLISH' | 'BEARISH' | null; value: number | null }
type SuperSnap = Record<'h1' | 'h4' | 'd1' | 'w1', SuperTf>;
const SUPER_TFS: { k: keyof SuperSnap; label: string }[] = [
  { k: 'h1', label: '1h' }, { k: 'h4', label: '4h' }, { k: 'd1', label: '1d' }, { k: 'w1', label: '1s' },
];
/** Ícones desenhados dos filtros (nunca emoji como sistema de ícones). */
const MON_ICON_MAP: Record<string, LucideIcon> = {
  'trend-up': TrendingUp, alert: TriangleAlert, flame: Flame, check: CheckCircle2,
  'trend-down': TrendingDown, gem: Gem, zap: Zap, siren: Siren,
  'up-right': ArrowUpRight, eye: Eye, star: Star,
};
export function monIcon(key: string, size = 13) {
  const I = MON_ICON_MAP[key] ?? Star;
  return <I size={size} />;
}

function cacheAge(ts: number | null): string {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'cache agora mesmo';
  return `cache há ${m} min`;
}

/** Stoch de um tempo gráfico a partir do sparkline horário (instantâneo). */
function stochFromSpark(c: UniverseCoin, tf: '1h' | '4h'): StochTf {
  const hourly = (c.spark7d ?? []).filter((v) => v > 0);
  const closes = tf === '1h' ? hourly : sampleEvery(hourly, 4);
  const kl = closesToCandles(closes);
  if (!kl || kl.length < 15) return { k: null, d: null };
  try {
    const s = calcStoch(kl);
    return { k: s.k, d: s.d };
  } catch {
    return { k: null, d: null };
  }
}
/** Bollinger de um tempo gráfico a partir do sparkline horário (instantâneo). */
function bbFromSpark(c: UniverseCoin, tf: '1h' | '4h'): BbTf {
  const hourly = (c.spark7d ?? []).filter((v) => v > 0);
  const kl = closesToCandles(tf === '1h' ? hourly : sampleEvery(hourly, 4));
  if (!kl || kl.length < 20) return { upper: null, mid: null, lower: null };
  try {
    const b = calcBB(kl);
    return { upper: b.upper, mid: b.mid, lower: b.lower };
  } catch {
    return { upper: null, mid: null, lower: null };
  }
}
/** Valor numérico de ordenação para as chaves de tendência. */
function trendSortVal(c: UniverseCoin, k: SortKey, pre?: CoinTrend | null): number | null {
  const lvl = (s: TrendState | null) => (s == null ? null : TREND_LEVEL[s]);
  const t = pre === null ? null : (pre ?? coinTrend(c));  if (!t) return null;
  switch (k) {
    case 'trendCurto': return lvl(t.curto);
    case 'trendMedio': return lvl(t.medio);
    case 'trendLongo': return lvl(t.longo);
    case 'mudCurto': return t.mudCurto?.delta ?? null;
    case 'mudMedio': return t.mudMedio?.delta ?? null;
    case 'mudLongo': return t.mudLongo?.delta ?? null;
    default: return null;
  }
}

const toneUpDown = (v: number | null | undefined) => ({ color: (v ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }) as const;

export function Radar() {
  const u = useUniverseCrypto();
  const favs = useStore((s) => s.favorites);
  const toggleFav = useStore((s) => s.toggleFav);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('MON');
  const [onlyActive, setOnlyActive] = useState(true);
  const [hideStables, setHideStables] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'marketCap', d: -1 });
  const [count, setCount] = useState(500);
  const [topN, setTopN] = useState<number | null>(100);
  /** Nº de moedas buscadas nas abas com klines; "Todas" = 300 (limite do fetch). */
  const fetchN = topN ?? 300;
  /** Ids do pelotão Top N por market cap (memoizado: não reconstrói a cada tick de progresso). */
  const mcapTopIds = useMemo(() => {
    if (topN == null) return null;
    const hasOfficial = u.coins.some((c) => c.rank != null);
    return hasOfficial
      ? new Set(u.coins.filter((c) => (c.rank ?? Infinity) <= topN).map((c) => c.id))
      : new Set([...u.coins].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, topN).map((c) => c.id));
  }, [u.coins, topN]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snaps, setSnaps] = useState<Map<string, IndSnap>>(new Map());
  const [klines, setKlines] = useState<Map<string, Candle[]>>(new Map());
  const [indProg, setIndProg] = useState<{ done: number; total: number } | null>(null);
  const [rsiSnaps, setRsiSnaps] = useState<Map<string, RsiSnap>>(new Map());
  const [rsiPartial, setRsiPartial] = useState(false);
  const [indTf, setIndTf] = useState<'1d' | TrendTf>('1d');
  const [trendWarm, setTrendWarm] = useState<Map<string, CoinTrend>>(new Map());

  /** Tendência: consenso warm multi-TF ou cold-start % instantâneo (qualquer modo). */
  const trendFor = (d: UniverseCoin): CoinTrend | null => {
    const w = trendWarm.get(d.symbol);
    if (w) return w;
    try {
      return coinTrend(d);
    } catch {
      return null;
    }
  };
  const toTrendOhlc = (kl: Candle[] | null): TrendOhlc | null =>
    kl && kl.length >= 15
      ? { closes: kl.map((k) => k.close), highs: kl.map((k) => k.high), lows: kl.map((k) => k.low) }
      : null;
  const [smaCfg, setSmaCfg] = useState<MaFast>(9);
  const [emaCfg, setEmaCfg] = useState<MaFast>(9);
  const [maModal, setMaModal] = useState<MaKind | null>(null);
  const [maSearch, setMaSearch] = useState('');
  const [maKlines, setMaKlines] = useState<Map<string, Candle[]>>(new Map());

  const maVals = useMemo(() => {
    const m = new Map<string, MaSet>();
    for (const [s, kl] of maKlines) {
      const v = computeMaSet(kl.map((k) => k.close));
      if (v) m.set(s, v);
    }
    return m;
  }, [maKlines]);

  // ---- Monitor (feed Business/Realtime + filtros) ----
  const monFiltersCustom = useStore((s) => s.monFilters);
  const monDisabled = useStore((s) => s.monDisabled);
  const addMonFilter = useStore((s) => s.addMonFilter);
  const removeMonFilter = useStore((s) => s.removeMonFilter);
  const toggleMonFilter = useStore((s) => s.toggleMonFilter);
  const allMonFilters = useMemo(() => [...PRESET_FILTERS, ...monFiltersCustom], [monFiltersCustom]);
  const activeMonFilters = useMemo(() => allMonFilters.filter((f) => !monDisabled.includes(f.id)), [allMonFilters, monDisabled]);
  const [monMode, setMonMode] = useState<'realtime' | 'business'>('realtime');
  const [monFavOnly, setMonFavOnly] = useState(false);
  const [monExpanded, setMonExpanded] = useState(false);
  const [notifPerm, setNotifPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'));
  const [monData, setMonData] = useState<Map<string, MonData>>(new Map());
  const [monFirstSeen, setMonFirstSeen] = useState<Record<string, number>>(() => loadFirstSeen());
  const [monRefresh, setMonRefresh] = useState(0);
  const [monSecs, setMonSecs] = useState<number | null>(null);
  const [monListOpen, setMonListOpen] = useState(false);
  const [monBuilderOpen, setMonBuilderOpen] = useState(false);
  const blankDraft = (): { name: string; icon: string; color: MonColor; description: string; conditions: MonCondition[] } => ({
    name: '', icon: 'star', color: 'yellow', description: '', conditions: [{ indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 }],
  });
  const [monDraft, setMonDraft] = useState(blankDraft);

  const [superSnaps, setSuperSnaps] = useState<Map<string, SuperSnap>>(new Map());
  const [rsiFilter, setRsiFilter] = useState<RsiFilter | null>(null);
  const [rsiFilterOpen, setRsiFilterOpen] = useState(false);
  const [rsiDraft, setRsiDraft] = useState<{ col: RsiCol; op: RsiOp; value: string }>({ col: 'rsiH4', op: 'gte', value: '70' });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list: UniverseCoin[] = u.coins;
    if (!showAll) {
      if (onlyActive) list = list.filter(isActiveCoin);
      if (hideStables) list = list.filter((c) => !isStablecoin(c));
    }
    if (needle) list = list.filter((c) => c.symbol.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle));
    const val = (c: UniverseCoin): number => {
      if (sort.k.startsWith('trend') || sort.k.startsWith('mud')) {
        // Warm (consenso, fonte única) com fallback cold instantâneo
        return trendSortVal(c, sort.k, tab === 'TREND' ? (trendFor(c) ?? null) : undefined) ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      if (RSI_SORT_KEYS.has(sort.k)) {
        return rsiSnaps.get(c.symbol)?.[sort.k as RsiCol] ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      if (sort.k === 'stochFast' || sort.k === 'stochSlow') {
        const f = sort.k === 'stochFast' ? 'k' : 'd';
        const v = indTf === '1d'
          ? (snaps.get(c.symbol)?.[f === 'k' ? 'stochK' : 'stochD'] ?? null)
          : (stochFromSpark(c, indTf)[f] ?? null);
        return v ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      if (sort.k.startsWith('super')) {
        const tf = sort.k.slice(5).toLowerCase() as keyof SuperSnap;
        const dir = superSnaps.get(c.symbol)?.[tf]?.dir;
        return (dir == null ? null : dir === 'BULLISH' ? 1 : 0) ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      if (sort.k === 'attToday' || sort.k === 'attRatio') {
        const kl = klines.get(c.symbol);
        const a = kl ? unusualMove(kl.map((k) => k.close)) : null;
        const v = a ? (sort.k === 'attToday' ? a.todayPct : a.ratio) : null;
        return v ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      if (sort.k === 'bbUpper' || sort.k === 'bbLower') {
        const b = indTf === '1d'
          ? { upper: snaps.get(c.symbol)?.bbUpper ?? null, lower: snaps.get(c.symbol)?.bbLower ?? null }
          : bbFromSpark(c, indTf);
        const band = sort.k === 'bbUpper' ? b.upper : b.lower;
        const v = band != null && c.price ? (c.price - band) / band : null;
        return v ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      if ((tab === 'SMA' || tab === 'EMA') && sort.k.startsWith('ma')) {
        const idx = parseInt(sort.k.slice(2), 10);
        const cfg = tab === 'SMA' ? smaCfg : emaCfg;
        const slow = slowsFor(cfg)[idx];
        const v = slow == null ? null : maCrossDiff(maVals.get(c.symbol) ?? null, tab, cfg, slow);
        return v ?? (sort.d === -1 ? -Infinity : Infinity);
      }
      return c[sort.k as 'marketCap' | 'price' | 'change1h' | 'change24h' | 'change7d' | 'change30d' | 'change1y' | 'volume24h'] ?? (sort.d === -1 ? -Infinity : Infinity);
    };
    // Top N sempre pelo rank de market cap (vale p/ PERF, BTC e Tendência 1d);
    // a ordenação clicada reordena dentro desse pelotão
    if (mcapTopIds && (tab === 'PERF' || tab === 'BTC' || (tab === 'TREND' && indTf === '1d'))) {
      list = list.filter((c) => mcapTopIds.has(c.id));
    }
    if (tab !== 'MON' && tab !== 'PERF' && tab !== 'TREND' && tab !== 'RSI') return [...list].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    // RSI: filtro por coluna/operador/valor (modal Filtrar)
    if (tab === 'RSI' && rsiFilter) {
      const t = rsiFilter.value;
      list = list.filter((c) => {
        const v = rsiSnaps.get(c.symbol)?.[rsiFilter.col];
        if (v == null) return false;
        return rsiFilter.op === 'gte' ? v >= t : rsiFilter.op === 'lte' ? v <= t : rsiFilter.op === 'gt' ? v > t : v < t;
      });
    }
    return [...list].sort((a, b) => (val(a) - val(b)) * sort.d);
  }, [u.coins, q, onlyActive, hideStables, showAll, sort, tab, mcapTopIds, rsiSnaps, rsiFilter, indTf, trendWarm, superSnaps, smaCfg, emaCfg, maVals]);

  useEffect(() => {
    setCount(500);
  }, [q, onlyActive, hideStables, showAll, sort, tab]);

  // Indicadores do top-N (sob demanda por aba, com cache de 1h)
  useEffect(() => {
    if (!IND_TABS.includes(tab)) return;
    let alive = true;
    (async () => {
      setIndProg({ done: 0, total: fetchN });
      const top = rows.filter((c) => (c.marketCap ?? 0) > 0).slice(0, fetchN).map((c) => ({ symbol: c.symbol, id: c.id }));
      const kl = await ensureTopKlines(top, (done, total) => alive && setIndProg({ done, total }), fetchN);
      if (!alive) return;
      const sn = new Map<string, IndSnap>();
      for (const [s, k] of kl) {
        const x = snapOf(k);
        if (x) sn.set(s, x);
      }
      setSnaps(sn);
      setKlines(kl);
      setIndProg(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchN]);

  // RSI multi-timeframe (1h/4h/1d/1s + AVG, cache 1h, preenchimento progressivo)
  useEffect(() => {
    if (tab !== 'RSI') return;
    let alive = true;
    (async () => {
      setIndProg({ done: 0, total: fetchN });
      setRsiPartial(false);
      const top = rows.filter((c) => (c.marketCap ?? 0) > 0).slice(0, fetchN).map((c) => ({ symbol: c.symbol, id: c.id, hourly: c.spark7d }));
      const { snaps, binanceOk } = await ensureRsiTable(top, (done, total, ready) => {
        if (!alive) return;
        setIndProg({ done, total });
        if (ready) setRsiSnaps((prev) => new Map(prev).set(ready.symbol, ready.snap));
      }, fetchN);
      if (!alive) return;
      setRsiSnaps(snaps);
      setRsiPartial(!binanceOk);
      setIndProg(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchN]);

  // Cruzamentos SMA/EMA (top-100, cache 1h, progressivo)
  useEffect(() => {
    if (tab !== 'SMA' && tab !== 'EMA') return;
    const tf = indTf;
    let alive = true;
    (async () => {
      setIndProg({ done: 0, total: fetchN });
      const top = rows.filter((c) => (c.marketCap ?? 0) > 0).slice(0, fetchN).map((c) => ({ symbol: c.symbol, id: c.id }));
      const kl = await ensureMaKlines(top, tf, (done, total, ready) => {
        if (!alive) return;
        setIndProg({ done, total });
        if (ready?.klines) setMaKlines((prev) => new Map(prev).set(ready.symbol, ready.klines!));
      }, fetchN);
      if (!alive) return;
      setMaKlines(kl);
      setIndProg(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, indTf, fetchN]);

  // Tendência: upgrade do cold-start p/ consenso multi-TF (progressivo).
  // Cada perna avalia seu timeframe (1d → 4h/diário/semanal); fonte única por perna.
  useEffect(() => {
    if (tab !== 'TREND') return;
    const mode = indTf;
    const legs = TREND_MODE_LEGS[mode];
    const needDaily = legs.some((l) => l.tf === '1d');
    const others = [...new Set(legs.map((l) => l.tf).filter((t) => t !== '1d'))] as ('1h' | '4h' | '1w')[];
    const lim: Record<'1h' | '4h' | '1w', { min: number; limit: number }> = {
      '1h': { min: 30, limit: 200 },
      '4h': { min: 40, limit: 200 },
      '1w': { min: 30, limit: 120 },
    };
    let alive = true;
    (async () => {
      setIndProg({ done: 0, total: fetchN });
      const top = rows.filter((c) => (c.marketCap ?? 0) > 0).slice(0, fetchN);
      const items = top.map((c) => ({ symbol: c.symbol, id: c.id }));
      let dailyMap = new Map<string, Candle[]>();
      if (needDaily) {
        dailyMap = await ensureTopKlines(items, (done, total) => alive && setIndProg({ done, total }), fetchN);
        if (!alive) return;
      }
      const out = new Map<string, CoinTrend>();
      for (let i = 0; i < top.length; i += 12) {
        const batch = await Promise.all(
          top.slice(i, i + 12).map(async (c): Promise<[string, CoinTrend | null]> => {
            try {
              const kl: Record<string, Candle[] | null> = { '1d': dailyMap.get(c.symbol) ?? null };
              for (const tf of others) kl[tf] = await getIntervalKlines(c.symbol, c.id, tf, lim[tf].min, lim[tf].limit);
              const rec = {
                '1h': toTrendOhlc(kl['1h']),
                '4h': toTrendOhlc(kl['4h']),
                '1d': toTrendOhlc(kl['1d']),
                '1w': toTrendOhlc(kl['1w']),
              };
              return [c.symbol, coinTrendMultiTF(rec, mode)];
            } catch {
              return [c.symbol, null];
            }
          }),
        );
        if (!alive) return;
        for (const [s, t] of batch) {
          if (t) {
            out.set(s, t);
            setTrendWarm((prev) => new Map(prev).set(s, t));
          }
        }
        setIndProg({ done: Math.min(i + 12, top.length), total: top.length });
      }
      if (!alive) return;
      setTrendWarm(out);
      setIndProg(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, indTf, fetchN]);

  // Monitor: avalia filtros (prontos + personalizados) no top-N.
  // Busca SÓ o que os filtros ativos exigem (1h/4h vêm do sparkline, grátis);
  // resto usa multi-fonte + cache + SWR.
  useEffect(() => {
    if (tab !== 'MON') return;
    let alive = true;
    (async () => {
      const t0 = Date.now();
      setIndProg({ done: 0, total: fetchN });
      setMonSecs(null);
      const plan = planMonitorData(activeMonFilters);
      const top = rows.filter((c) => (c.marketCap ?? 0) > 0).slice(0, fetchN);
      const data = new Map<string, MonData>();
      for (let i = 0; i < top.length; i += 8) {
        const batch = await Promise.all(
          top.slice(i, i + 8).map(async (c) => {
            const hourly = (c.spark7d ?? []).filter((v) => v > 0);
            const h1 = closesToCandles(hourly.slice(-120)) ?? null;
            const h4 = closesToCandles(sampleEvery(hourly, 4)) ?? null;
            const [d1, w1] = await Promise.all([
              plan.daily === 'none' ? null : plan.daily === 'ma'
                ? ensureMaKlines([{ symbol: c.symbol, id: c.id }], '1d').then((m) => m.get(c.symbol) ?? null)
                : getIntervalKlines(c.symbol, c.id, '1d', 60, 120),
              plan.weekly ? getIntervalKlines(c.symbol, c.id, '1w', 30, 60) : null,
            ]);
            return [c.symbol, buildMonData(c, { '1h': h1, '4h': h4, '1d': d1, '1w': w1 })] as const;
          }),
        );
        if (!alive) return;
        for (const [s, md] of batch) {
          data.set(s, md);
          setMonData((prev) => new Map(prev).set(s, md));
        }
        setIndProg({ done: Math.min(i + 8, top.length), total: top.length });
      }
      if (!alive) return;
      setMonData(data);
      const now = Date.now();
      const fs = loadFirstSeen();
      let changed = false;
      for (const m of evalMonitor([...data.values()], activeMonFilters)) {
        const k = `${m.filterId}:${m.symbol}`;
        if (!fs[k]) { fs[k] = now; changed = true; }
      }
      if (changed) saveFirstSeen(fs);
      setMonFirstSeen(fs);
      setMonSecs(Math.max(1, Math.round((Date.now() - t0) / 1000)));
      setIndProg(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, monRefresh, activeMonFilters, fetchN]);

  // Supertrend: 1h/4h do sparkline (instantâneo) + 1d/1s da rede
  useEffect(() => {
    if (tab !== 'SUPER') return;
    let alive = true;
    (async () => {
      setIndProg({ done: 0, total: fetchN });
      const top = rows.filter((c) => (c.marketCap ?? 0) > 0).slice(0, fetchN);
      const out = new Map<string, SuperSnap>();
      const ptLocal = (closes: number[]): SuperTf => {
        const kl = closesToCandles(closes);
        if (!kl) return { dir: null, value: null };
        try {
          const s = calcSupertrendFull(kl);
          return s ? { dir: s.dir, value: s.value } : { dir: null, value: null };
        } catch {
          return { dir: null, value: null };
        }
      };
      for (let i = 0; i < top.length; i += 8) {
        const batch = await Promise.all(
          top.slice(i, i + 8).map(async (c): Promise<[string, SuperSnap]> => {
            const hourly = (c.spark7d ?? []).filter((v) => v > 0);
            const [d1, w1] = await Promise.all([
              getIntervalKlines(c.symbol, c.id, '1d', 30, 60),
              getIntervalKlines(c.symbol, c.id, '1w', 30, 60),
            ]);
            const pt = (kl: typeof d1): SuperTf => {
              if (!kl) return { dir: null, value: null };
              try {
                const s = calcSupertrendFull(kl);
                return s ? { dir: s.dir, value: s.value } : { dir: null, value: null };
              } catch {
                return { dir: null, value: null };
              }
            };
            return [c.symbol, { h1: ptLocal(hourly.slice(-90)), h4: ptLocal(sampleEvery(hourly, 4)), d1: pt(d1), w1: pt(w1) }];
          }),
        );
        if (!alive) return;
        for (const [s, t] of batch) {
          out.set(s, t);
            setSuperSnaps((prev) => new Map(prev).set(s, t));
          }
        setIndProg({ done: Math.min(i + 8, top.length), total: top.length });
      }
      if (!alive) return;
      setSuperSnaps(out);
      setIndProg(null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchN]);

  const shown = useMemo(() => {
    if (tab === 'MON') return [];
    if (tab === 'PERF' || tab === 'BTC' || (tab === 'TREND' && indTf === '1d')) return rows;
    return rows.slice(0, fetchN);
  }, [rows, count, tab, indTf, fetchN]);

  const monFeed = useMemo(() => {
    if (tab !== 'MON') return [];
    const needle = q.trim().toLowerCase();
    const byId = new Map(allMonFilters.map((f) => [f.id, f]));
    const bySymbol = new Map<string, UniverseCoin>();
    for (const c of rows) if (!bySymbol.has(c.symbol)) bySymbol.set(c.symbol, c);
    const out: { coin: UniverseCoin; filter: MonFilter; seen: number }[] = [];
    for (const md of monData.values()) {
      const coin = bySymbol.get(md.symbol);
      if (!coin) continue;
      if (needle && !coin.symbol.toLowerCase().includes(needle) && !coin.name.toLowerCase().includes(needle)) continue;
      for (const f of activeMonFilters) {
        if (!byId.has(f.id)) continue;
        if (evalFilter(md, f)) out.push({ coin, filter: f, seen: monFirstSeen[`${f.id}:${md.symbol}`] ?? 0 });
      }
    }
    const sorted = out.sort((a, b) => b.seen - a.seen);
    const scoped = monFavOnly ? sorted.filter((e) => favs.includes(e.coin.symbol)) : sorted;
    return monMode === 'realtime' ? scoped.filter((e) => Date.now() - e.seen < 90 * 60 * 1000) : scoped;
  }, [tab, rows, q, monData, activeMonFilters, allMonFilters, monFirstSeen, monMode, monFavOnly, favs]);

  const virtualizer = useVirtualizer({ count: shown.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const vItems = virtualizer.getVirtualItems();
  const btc = useMemo(() => {
    const b = u.coins.find((c) => c.symbol === 'BTC');
    return { c1h: b?.change1h ?? null, c24: b?.change24h ?? null, c7d: b?.change7d ?? null, c30d: b?.change30d ?? null };
  }, [u.coins]);
  const rankMap = useMemo(() => {
    const m = new Map<string, number>();
    // 1) rank oficial da CoinGecko (correto mesmo com universo parcial)
    for (const c of u.coins) {
      if (!m.has(c.symbol) && c.rank != null) m.set(c.symbol, c.rank);
    }
    // 2) fallback: posição no market cap carregado (cache antigo sem rank)
    const sorted = [...u.coins].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    sorted.forEach((c, i) => { if (!m.has(c.symbol)) m.set(c.symbol, i + 1); });
    return m;
  }, [u.coins]);

  const th = (label: string, k?: SortKey) => (
    <button onClick={() => k && setSort((s) => ({ k, d: s.k === k ? ((s.d * -1) as 1 | -1) : -1 }))} className="inline-flex items-center gap-1 text-left font-semibold hover:text-[var(--accent)]" title={k ? 'Clique para ordenar: maior → menor → menor → maior' : undefined}>
      {label}
      {k && (sort.k === k
        ? <span className="text-[10px] leading-none text-[var(--accent)]">{sort.d === -1 ? '▼' : '▲'}</span>
        : <span className="text-[10px] leading-none opacity-50">⇅</span>)}
    </button>
  );

  if (!u.coins.length && !u.done && !u.error) {
    return (
      <div className="space-y-3">
        <MarketStrip />
        <Panel>
          <PanelTitle>Crypto Radar — carregando universo</PanelTitle>
          <div className="space-y-2 py-6 text-center text-sm text-muted">
            <div>Buscando moedas na CoinGecko (página {u.page || 1})…</div>
            <div className="tabular">{u.loaded.toLocaleString('pt-BR')} carregadas até agora</div>
          </div>
          <Skeleton className="h-48" />
        </Panel>
      </div>
    );
  }
  if (!u.coins.length && !u.done) return <Skeleton className="h-96" />;

  const pill = (v: number | null | undefined) => (
    <span className="tabular rounded px-1.5 py-0.5 text-xs font-bold text-black" style={{ background: (v ?? 0) >= 0 ? 'rgba(52,211,153,0.55)' : 'rgba(251,113,133,0.55)' }}>
      {v == null ? '—' : fmtPct(v)}
    </span>
  );
  const dash = <span className="text-xs text-muted">—</span>;
  const rsiOps: { k: RsiOp; label: string }[] = [
    { k: 'gte', label: 'Maior ou igual' },
    { k: 'lte', label: 'Menor ou igual' },
    { k: 'gt', label: 'Maior que' },
    { k: 'lt', label: 'Menor que' },
  ];
  const trendPill = (s: TrendState | null) => {
    if (!s) return dash;
    if (s === 'Neutro') return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-muted">{s}</span>;
    const up = s.startsWith('Alta');
    const strong = s.endsWith('Forte');
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[11px] ${strong ? 'font-bold' : 'font-semibold'}`}
        style={{ background: `color-mix(in srgb, var(${up ? '--up' : '--down'}) ${strong ? 25 : 12}%, transparent)`, color: `var(${up ? '--up' : '--down'})` }}
      >
        {s}
      </span>
    );
  };
  const shiftPill = (m: { from: TrendState; to: TrendState; delta: number } | null) => {
    if (!m) return dash;
    if (m.delta === 0) return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-muted">Mantém {shiftLabel(m.to)}</span>;
    const up = m.delta > 0;
    return (
      <span
        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
        style={{ background: `color-mix(in srgb, var(${up ? '--up' : '--down'}) 10%, transparent)`, color: `var(${up ? '--up' : '--down'})` }}
      >
        {shiftLabel(m.from)} para {shiftLabel(m.to)}
      </span>
    );
  };

  const maColsFor = (kind: MaKind, fast: MaFast) => [
    { h: 'Moeda' as React.ReactNode, w: '9rem' },
    { h: th('Preço Atual', 'price'), w: '7rem' },
    ...slowsFor(fast).map((s, i) => ({ h: th(maCrossTitle(kind, fast, s), `ma${i}` as SortKey), w: '9.5rem' })),
    { h: 'Fav' as React.ReactNode, w: '3.5rem' },
  ];
  const cols: Record<Tab, { h: React.ReactNode; w: string }[]> = {
    // MON usa feed próprio (Business/Realtime); colunas só para satisfazer o tipo
    MON: [
      { h: 'Data', w: '9.5rem' }, { h: 'Moeda', w: '11rem' }, { h: 'Descrição', w: '1fr' }, { h: 'Ações', w: '5rem' },
    ],
    BTC: [
      { h: '#', w: '3rem' }, { h: 'Ativo', w: '11rem' }, { h: '1h rel', w: '6rem' }, { h: '24h rel', w: '6rem' },
      { h: '7d rel', w: '6rem' }, { h: '30d rel', w: '6rem' }, { h: '30d abs', w: '6rem' }, { h: 'Fav', w: '4rem' },
    ],
    PERF: [
      { h: th('Rank', 'marketCap'), w: '3.5rem' }, { h: 'Ativo', w: '11rem' }, { h: th('Preço', 'price'), w: '7rem' }, { h: th('1h', 'change1h'), w: '6rem' },
      { h: th('24h', 'change24h'), w: '6rem' }, { h: th('7d', 'change7d'), w: '6rem' }, { h: th('30d', 'change30d'), w: '6rem' }, { h: th('1a', 'change1y'), w: '6rem' }, { h: 'Fav', w: '4rem' },
    ],
    TREND: [
      { h: 'Moeda', w: '9rem' }, { h: th('Rank', 'marketCap'), w: '4rem' },
      { h: th('Curto Prazo', 'trendCurto'), w: '6.5rem' }, { h: th('Médio Prazo', 'trendMedio'), w: '6.5rem' }, { h: th('Longo Prazo', 'trendLongo'), w: '6.5rem' },
      { h: th('Mudança (Curto)', 'mudCurto'), w: '10.5rem' }, { h: th('Mudança (Médio)', 'mudMedio'), w: '10.5rem' }, { h: th('Mudança (Longo)', 'mudLongo'), w: '10.5rem' },
      { h: 'Fav', w: '3.5rem' },
    ],
    RSI: [
      { h: 'Moeda', w: '9rem' }, { h: th('Rank', 'marketCap'), w: '3.5rem' }, { h: th('Preço', 'price'), w: '6.5rem' },
      ...RSI_COLS.map((c) => ({ h: th(c.label, c.k), w: '5.5rem' })),
      { h: 'Fav', w: '3.5rem' },
    ],
    STOCH: [
      { h: 'Moeda', w: '9rem' }, { h: th('Rank', 'marketCap'), w: '3.5rem' },
      { h: th('Rápido', 'stochFast'), w: '6rem' }, { h: th('Lento', 'stochSlow'), w: '6rem' },
      { h: 'Status Rápido', w: '8rem' }, { h: 'Status Lento', w: '8rem' },
      { h: 'Fav', w: '3.5rem' },
    ],
    SUPER: [
      { h: 'Moeda', w: '9rem' },
      ...SUPER_TFS.flatMap((t) => [
        { h: `Valor (${t.label})`, w: '7rem' },
        { h: th(`Tendência (${t.label})`, (`super${t.k.toUpperCase()}`) as SortKey), w: '6.5rem' },
      ]),
      { h: 'Fav', w: '3.5rem' },
    ],
    VOL: [
      { h: 'Moeda', w: '9rem' }, { h: th('Rank', 'marketCap'), w: '3.5rem' }, { h: th('Preço', 'price'), w: '6.5rem' },
      { h: th('Hoje', 'attToday'), w: '6rem' }, { h: 'Média 10d', w: '6rem' }, { h: th('× Média', 'attRatio'), w: '6rem' },
      { h: 'Status', w: '9.5rem' }, { h: th('Vol 24h', 'volume24h'), w: '7rem' }, { h: 'Fav', w: '3.5rem' },
    ],
    MACD: [{ h: '#', w: '3rem' }, { h: 'Ativo', w: '11rem' }, { h: 'Histograma', w: '8rem' }, { h: 'Sinal', w: '8rem' }, { h: 'Fav', w: '4rem' }],
    BB: [
      { h: 'Moeda', w: '9rem' }, { h: th('Rank', 'marketCap'), w: '3.5rem' }, { h: th('Preço Atual', 'price'), w: '7rem' },
      { h: th('Preço Cruzando Banda Superior', 'bbUpper'), w: '11rem' }, { h: th('Preço Cruzando Banda Inferior', 'bbLower'), w: '11rem' },
      { h: 'Fav', w: '3.5rem' },
    ],
    SMA: maColsFor('SMA', smaCfg),
    EMA: maColsFor('EMA', emaCfg),
    SR: [{ h: '#', w: '3rem' }, { h: 'Ativo', w: '11rem' }, { h: 'Máx 30d', w: '7rem' }, { h: 'Mín 30d', w: '7rem' }, { h: 'Dist. topo', w: '8rem' }, { h: 'Fav', w: '4rem' }],
  };
  const gridCols = cols[tab].map((c) => c.w).join(' ');

  const cellFav = (d: UniverseCoin) => (
    <span>
      <button onClick={() => toggleFav(d.symbol)} title="Favoritar" className="text-lg">{favs.includes(d.symbol) ? '★' : '☆'}</button>
      <button onClick={() => toggleWatch(d.symbol)} title="Watchlist" className="text-xs text-muted">+W</button>
    </span>
  );
  const cellAsset = (d: UniverseCoin) => (
    <span className="truncate"><Link to={`/monitor?symbol=${d.symbol}`} className="font-bold hover:underline">{d.symbol}</Link> <span className="text-xs text-muted">{d.name}</span></span>
  );
  const indActive = IND_TABS.includes(tab) || tab === 'RSI' || tab === 'SUPER' || tab === 'SMA' || tab === 'EMA' || tab === 'TREND';
  const indCount = tab === 'RSI' ? rsiSnaps.size : tab === 'SUPER' ? superSnaps.size : tab === 'SMA' || tab === 'EMA' ? maKlines.size : tab === 'TREND' ? trendWarm.size : snaps.size;
  const indNote = indActive && (
    <span className="text-xs normal-case text-muted">
      {indProg ? ` calculando ${indProg.done}/${indProg.total}…` : ` top ${fetchN} por market cap · ${indCount} com indicadores`}
      {tab === 'RSI' && rsiPartial && !indProg && ' · Binance fora, via alternativas (lento)'}
    </span>
  );
  const stochStatus = (v: number | null | undefined) => {
    if (v == null) return dash;
    if (v < 20) {
      return <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--down) 20%, transparent)', color: 'var(--down)' }}>Sobrevendido</span>;
    }
    if (v > 80) {
      return <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--up) 20%, transparent)', color: 'var(--up)' }}>Sobrecomprado</span>;
    }
    return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-muted">Neutro</span>;
  };
  const attPill = (a: { ratio: number; dir: 'up' | 'down' | 'flat'; unusual: boolean } | null) => {
    if (!a) return dash;
    if (!a.unusual) return <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-muted">Normal</span>;
    const up = a.dir !== 'down';
    return (
      <span
        className="rounded px-1.5 py-0.5 text-[11px] font-bold"
        style={{ background: `color-mix(in srgb, var(${up ? '--up' : '--down'}) 20%, transparent)`, color: `var(${up ? '--up' : '--down'})` }}
      >
        {up ? '↑' : '↓'} {a.ratio.toFixed(1)}× média
      </span>
    );
  };
  const superDirPill = (dir: 'BULLISH' | 'BEARISH' | null) => {
    if (!dir) return dash;
    const up = dir === 'BULLISH';
    return (
      <span
        className="rounded px-1.5 py-0.5 text-[11px] font-bold"
        style={{ background: `color-mix(in srgb, var(${up ? '--up' : '--down'}) 18%, transparent)`, color: `var(${up ? '--up' : '--down'})` }}
      >
        {up ? 'Alta' : 'Baixa'}
      </span>
    );
  };
  const rsiCell = (v: number | null | undefined) => {    const b = rsiBand(v);
    if (!b || v == null) return dash;
    const color = b === 'low' ? 'var(--down)' : b === 'high' ? 'var(--up)' : 'var(--warn)';
    return (
      <span
        className="tabular rounded px-1.5 py-0.5 text-[11px] font-bold"
        style={{ background: `color-mix(in srgb, ${color} ${b === 'mid' ? 12 : 20}%, transparent)`, color }}
      >
        {v.toFixed(2)}
      </span>
    );
  };

  const monVar = (color: MonColor) =>
    color === 'green' ? 'var(--up)' : color === 'red' ? 'var(--down)' : color === 'yellow' ? 'var(--warn)' : 'var(--accent)';
  const monTint = (color: MonColor): React.CSSProperties => ({
    background: `color-mix(in srgb, ${monVar(color)} 16%, transparent)`,
    borderColor: `color-mix(in srgb, ${monVar(color)} 30%, transparent)`,
  });
  const coinIcon = (c: UniverseCoin, size = 22) =>
    c.image ? (
      <img
        src={c.image} alt="" width={size} height={size} loading="lazy"
        className="shrink-0 rounded-full"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    ) : (
      <span className="flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold" style={{ width: size, height: size }}>
        {c.symbol.slice(0, 1)}
      </span>
    );
  const fmtDT = (ts: number) => {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const relTime = (ts: number) => {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return 'agora mesmo';
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
  };

  const renderRow = (d: UniverseCoin, idx: number) => {
    const sn = snaps.get(d.symbol);
    const kl = klines.get(d.symbol);
    switch (tab) {
      case 'MON':
        // Feed próprio (Business/Realtime) renderizado fora da grade virtualizada
        return null;
      case 'BTC': {
        const rel = (v: number | null | undefined, b: number | null | undefined) => (v == null || b == null ? null : v - b);
        return (<>
          <span className="tabular text-xs text-muted">{idx + 1}</span>
          {cellAsset(d)}
          <span className="tabular" style={toneUpDown(rel(d.change1h, btc.c1h))}>{rel(d.change1h, btc.c1h) != null ? fmtPct(rel(d.change1h, btc.c1h)) : '—'}</span>
          <span className="tabular" style={toneUpDown(rel(d.change24h, btc.c24))}>{rel(d.change24h, btc.c24) != null ? fmtPct(rel(d.change24h, btc.c24)) : '—'}</span>
          <span className="tabular" style={toneUpDown(rel(d.change7d, btc.c7d))}>{rel(d.change7d, btc.c7d) != null ? fmtPct(rel(d.change7d, btc.c7d)) : '—'}</span>
          <span className="tabular" style={toneUpDown(rel(d.change30d, btc.c30d))}>{rel(d.change30d, btc.c30d) != null ? fmtPct(rel(d.change30d, btc.c30d)) : '—'}</span>
          <span className="tabular" style={toneUpDown(d.change30d)}>{fmtPct(d.change30d)}</span>
          {cellFav(d)}
        </>);
      }
      case 'PERF':
        return (<>
          <span className="tabular text-xs text-muted">{rankMap.get(d.symbol) ?? idx + 1}</span>
          {cellAsset(d)}
          <span className="tabular">{fmtPrice(d.price)}</span>
          <span>{pill(d.change1h)}</span><span>{pill(d.change24h)}</span><span>{pill(d.change7d)}</span>
          <span>{pill(d.change30d)}</span><span>{pill(d.change1y)}</span>
          {cellFav(d)}
        </>);
      case 'TREND': {
        // Warm (consenso, fonte única) com fallback cold instantâneo
        const t = trendFor(d);
        return (<>
          {cellAsset(d)}
          <span className="tabular text-sm">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span>{trendPill(t?.curto ?? null)}</span>
          <span>{trendPill(t?.medio ?? null)}</span>
          <span>{trendPill(t?.longo ?? null)}</span>
          <span>{shiftPill(t?.mudCurto ?? null)}</span>
          <span>{shiftPill(t?.mudMedio ?? null)}</span>
          <span>{shiftPill(t?.mudLongo ?? null)}</span>
          {cellFav(d)}
        </>);
      }
      case 'RSI': {
        const r = rsiSnaps.get(d.symbol);
        return (<>
          {cellAsset(d)}
          <span className="tabular text-sm">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular">{fmtPrice(d.price)}</span>
          {RSI_COLS.map((c) => <span key={c.k}>{rsiCell(r?.[c.k])}</span>)}
          {cellFav(d)}
        </>);
      }
      case 'STOCH': {
        // 1d: snapshot diário · 1h/4h: sparkline horário (instantâneo)
        const s = indTf === '1d'
          ? { k: sn?.stochK ?? null, d: sn?.stochD ?? null }
          : stochFromSpark(d, indTf);
        return (<>
          {cellAsset(d)}
          <span className="tabular text-sm">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular">{s.k != null ? s.k.toFixed(2) : '—'}</span>
          <span className="tabular">{s.d != null ? s.d.toFixed(2) : '—'}</span>
          <span>{stochStatus(s.k)}</span>
          <span>{stochStatus(s.d)}</span>
          {cellFav(d)}
        </>);
      }
      case 'SUPER': {
        const s = superSnaps.get(d.symbol);
        return (<>
          {cellAsset(d)}
          {SUPER_TFS.flatMap((t) => {
            const p = s?.[t.k];
            return [
              <span key={`${t.k}-v`} className="tabular">{p?.value != null ? fmtPrice(p.value) : '—'}</span>,
              <span key={`${t.k}-t`}>{superDirPill(p?.dir ?? null)}</span>,
            ];
          })}
          {cellFav(d)}
        </>);
      }
      case 'VOL': {
        const a = kl ? unusualMove(kl.map((k) => k.close)) : null;
        return (<>
          {cellAsset(d)}
          <span className="tabular text-sm">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular">{fmtPrice(d.price)}</span>
          <span className="tabular" style={toneUpDown(a?.todayPct)}>{a ? fmtPct(a.todayPct) : '—'}</span>
          <span className="tabular">{a ? fmtPct(a.avg10) : '—'}</span>
          <span className="tabular font-bold">{a ? `${a.ratio.toFixed(1)}×` : '—'}</span>
          <span>{attPill(a)}</span>
          <span className="tabular">{d.volume24h ? fmtUSD(d.volume24h, 0) : '—'}</span>
          {cellFav(d)}
        </>);
      }
      case 'MACD': {
        const h = sn?.macdHist;
        return (<>
          <span className="tabular text-xs text-muted">{idx + 1}</span>
          {cellAsset(d)}
          <span className="tabular" style={toneUpDown(h)}>{h != null ? h.toFixed(4) : '—'}</span>
          <span>{h != null ? <Badge tone={h > 0 ? 'up' : 'down'}>{h > 0 ? 'Positivo' : 'Negativo'}</Badge> : dash}</span>
          {cellFav(d)}
        </>);
      }
      case 'BB': {
        // 1d: snapshot diário · 1h/4h: sparkline horário (instantâneo)
        const b = indTf === '1d'
          ? { upper: sn?.bbUpper ?? null, lower: sn?.bbLower ?? null }
          : bbFromSpark(d, indTf);
        const aboveUpper = b.upper != null && d.price > b.upper;
        const belowLower = b.lower != null && d.price < b.lower;
        return (<>
          {cellAsset(d)}
          <span className="tabular text-sm">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular">{fmtPrice(d.price)}</span>
          <span>
            {b.upper == null ? dash : (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold"
                style={aboveUpper
                  ? { background: 'color-mix(in srgb, var(--up) 20%, transparent)', color: 'var(--up)' }
                  : { background: 'color-mix(in srgb, var(--down) 20%, transparent)', color: 'var(--down)' }}
              >
                {aboveUpper ? 'Acima' : 'Abaixo'}
              </span>
            )}
          </span>
          <span>
            {b.lower == null ? dash : (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold"
                style={belowLower
                  ? { background: 'color-mix(in srgb, var(--down) 20%, transparent)', color: 'var(--down)' }
                  : { background: 'color-mix(in srgb, var(--up) 20%, transparent)', color: 'var(--up)' }}
              >
                {belowLower ? 'Abaixo' : 'Acima'}
              </span>
            )}
          </span>
          {cellFav(d)}
        </>);
      }
      case 'SMA':
      case 'EMA': {
        const kind = tab as MaKind;
        const fast = kind === 'SMA' ? smaCfg : emaCfg;
        const set = maVals.get(d.symbol);
        return (<>
          {cellAsset(d)}
          <span className="tabular">{fmtPrice(d.price)}</span>
          {slowsFor(fast).map((s) => {
            const diff = maCrossDiff(set ?? null, kind, fast, s);
            return (
              <span key={s}>
                {diff == null ? dash : (
                  <span
                    className="rounded px-1.5 py-0.5 text-[11px] font-bold"
                    style={diff > 0
                      ? { background: 'color-mix(in srgb, var(--up) 18%, transparent)', color: 'var(--up)' }
                      : { background: 'color-mix(in srgb, var(--down) 18%, transparent)', color: 'var(--down)' }}
                  >
                    {diff > 0 ? 'Acima' : 'Abaixo'}
                  </span>
                )}
              </span>
            );
          })}
          {cellFav(d)}
        </>);
      }
      case 'SR': {
        const closes = kl?.map((k) => k.close) ?? [];
        const hi = closes.length ? Math.max(...closes.slice(-30)) : null;
        const lo = closes.length ? Math.min(...closes.slice(-30)) : null;
        const dist = hi && d.price ? ((hi / d.price - 1) * 100) : null;
        return (<>
          <span className="tabular text-xs text-muted">{idx + 1}</span>
          {cellAsset(d)}
          <span className="tabular">{hi != null ? fmtPrice(hi) : '—'}</span>
          <span className="tabular">{lo != null ? fmtPrice(lo) : '—'}</span>
          <span className="tabular">{dist != null ? `-${dist.toFixed(1)}% do topo` : '—'}</span>
          {cellFav(d)}
        </>);
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <MarketStrip />
      {tab === 'MON' && (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Indicadores</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMonMode('business')}
              title="O que já aconteceu e continua ativo"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${monMode === 'business' ? 'border-[var(--up)] text-[var(--up)]' : 'border-[var(--border)] text-muted'}`}
              style={monMode === 'business' ? { background: 'color-mix(in srgb, var(--up) 12%, transparent)' } : undefined}
            >
              <Globe size={14} /> Business
            </button>
            <button
              onClick={() => setMonMode('realtime')}
              title="O que está acontecendo agora"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${monMode === 'realtime' ? 'border-[var(--up)] text-[var(--up)]' : 'border-[var(--border)] text-muted'}`}
              style={monMode === 'realtime' ? { background: 'color-mix(in srgb, var(--up) 12%, transparent)' } : undefined}
            >
              <TrendingUp size={14} /> Realtime
            </button>
            <button
              onClick={() => setMonFavOnly((v) => !v)}
              title="Somente favoritas"
              className={`rounded-lg border p-2 ${monFavOnly ? 'border-[var(--warn)] text-[var(--warn)]' : 'border-[var(--border)] text-muted'}`}
            >
              <Star size={14} fill={monFavOnly ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setMonListOpen(true)}
              title={`Filtros (${activeMonFilters.length}/${allMonFilters.length})`}
              className="rounded-lg border border-[var(--up)] p-2 text-[var(--up)]"
              style={{ background: 'color-mix(in srgb, var(--up) 12%, transparent)' }}
            >
              <Filter size={14} />
            </button>
            <button
              onClick={async () => {
                if (typeof Notification === 'undefined') return;
                try {
                  setNotifPerm(await Notification.requestPermission());
                } catch {
                  /* negado */
                }
              }}
              title={notifPerm === 'granted' ? 'Alertas desktop ativos: a vigia avisa de qualquer página' : 'Ativar alertas desktop do monitor'}
              className={`rounded-lg border p-2 ${notifPerm === 'granted' ? 'border-[var(--up)] text-[var(--up)]' : 'border-[var(--border)] text-muted'}`}
            >
              <Bell size={14} fill={notifPerm === 'granted' ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => { setMonDraft(blankDraft()); setMonBuilderOpen(true); }}
              title="Visualizar e cadastrar alertas"
              className="rounded-lg border border-[var(--border)] p-2 text-muted hover:text-white"
            >
              <ListPlus size={14} />
            </button>
            <button
              onClick={() => setMonExpanded((v) => !v)}
              title={monExpanded ? 'Compactar' : 'Expandir'}
              className="rounded-lg border border-[var(--border)] p-2 text-muted hover:text-white"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => setMonRefresh((n) => n + 1)}
              title="Reavaliar agora"
              className="rounded-lg border border-[var(--border)] p-2 text-muted hover:text-white"
            >
              <RotateCw size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => {
              setTab(t.k);
              if (t.k === 'SMA' || t.k === 'EMA') { setMaSearch(''); setMaModal(t.k); }
            }}
            className={t.k === tab ? '-mb-px border-b-2 border-[var(--up)] pb-1.5 text-sm font-bold text-[var(--up)]' : 'pb-1.5 text-sm text-muted hover:text-white'}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-2 inline-flex items-center gap-1" title="Quantas moedas por market cap entram em cada radar">
          <Seg
            options={[{ k: '100', label: 'Top 100' }, { k: '200', label: 'Top 200' }, { k: '300', label: 'Top 300' }, { k: 'all', label: 'Todas' }] as const}
            value={topN == null ? 'all' : String(topN) as '100' | '200' | '300' | 'all'}
            onChange={(v) => setTopN(v === 'all' ? null : Number(v))}
          />
        </span>
        {(tab === 'TREND' || tab === 'STOCH' || tab === 'BB' || tab === 'SMA' || tab === 'EMA') && (
          <span className="ml-2">
            <Seg
              options={[{ k: '1h', label: '1 hora' }, { k: '4h', label: '4 horas' }, { k: '1d', label: '1 dia' }] as const}
              value={indTf}
              onChange={(v) => setIndTf(v)}
            />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todo o universo…" className="min-w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm" />
        {tab !== 'MON' && (
          <>
            <label className="flex items-center gap-1"><input type="checkbox" checked={onlyActive} disabled={showAll} onChange={(e) => setOnlyActive(e.target.checked)} /> Somente ativas (vol &gt; 0)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={hideStables} disabled={showAll} onChange={(e) => setHideStables(e.target.checked)} /> Ocultar stablecoins</label>
            <label className="flex items-center gap-1 font-semibold"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Mostrar literalmente todas</label>
          </>
        )}
        <button onClick={u.reload} className="rounded-lg border border-[var(--border)] px-2 py-1">Recarregar universo</button>
        {tab === 'RSI' && (
          <button
            onClick={() => {
              if (rsiFilter) setRsiDraft({ col: rsiFilter.col, op: rsiFilter.op, value: String(rsiFilter.value) });
              setRsiFilterOpen(true);
            }}
            className="rounded-lg border border-[var(--border)] px-2 py-1 font-semibold"
            style={rsiFilter ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
          >
            Filtrar{rsiFilter ? ' • ativo' : ''}
          </button>
        )}
      </div>

      <Panel>
        <PanelTitle
          right={
            <span className="text-xs normal-case">
              {u.coins.length.toLocaleString('pt-BR')} moedas no universo
              {!u.done && u.coins.length > 0 && <span> · carregando universo: {u.loaded.toLocaleString('pt-BR')}</span>}
              {u.done && u.fromCache && <span> · {cacheAge(u.cacheTs)}</span>}
              {u.rateLimited && <Badge tone="warn">rate limit — usando cache + backoff</Badge>}
              {indNote}
              {tab === 'MON' && (indProg ? <span>{` analisando ${indProg.done}/${indProg.total}…`}</span> : <span>{` · ${monData.size} moedas avaliadas`}{monSecs != null ? ` em ${monSecs}s` : ''}</span>)}
            </span>
          }
        >
          {tab === 'MON' ? `Monitor — ${monFeed.length} alerta${monFeed.length === 1 ? '' : 's'}${monMode === 'realtime' ? ' (tempo real)' : ''}` : `Crypto Radar — ${rows.length.toLocaleString('pt-BR')} após filtros`}
        </PanelTitle>
        {u.error && !u.coins.length && <ErrorBox message={u.error} onRetry={u.reload} />}
        {u.error && u.coins.length > 0 && (
          <div className="mb-2 text-xs text-[var(--warn)]">
            Atualização pausada ({u.error}) — exibindo cache. <button onClick={u.reload} className="underline">Tentar de novo</button>
          </div>
        )}
        {!rows.length ? (
          <Empty title="Nenhuma moeda encontrada" hint="Ajuste a busca ou desative os filtros." />
        ) : tab === 'MON' ? (
          <div className={`${monExpanded ? 'max-h-[85vh]' : 'max-h-[62vh]'} space-y-1 overflow-auto py-1`}>
            <div className="grid items-center gap-2 px-3 text-xs text-muted" style={{ gridTemplateColumns: monMode === 'realtime' ? '9rem minmax(10rem,30%) 1fr 4.5rem' : 'minmax(11rem,32%) 1fr 4.5rem' }}>
              {monMode === 'realtime' && <span>Data</span>}<span>Moeda</span><span>Descrição</span><span className="text-right">Ações</span>
            </div>
            {monFeed.length === 0 ? (
              <Empty
                title={indProg ? `Analisando mercado ${indProg.done}/${indProg.total}…` : monMode === 'realtime' ? 'Nada acontecendo agora' : 'Nenhum alerta ativo'}
                hint="Ative filtros no funil ou crie o seu próprio no ☰."
              />
            ) : (
              monFeed.slice(0, 200).map((e) => (
                <div
                  key={`${e.filter.id}:${e.coin.symbol}`}
                  className="grid items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ ...monTint(e.filter.color), gridTemplateColumns: monMode === 'realtime' ? '9rem minmax(10rem,30%) 1fr 4.5rem' : 'minmax(11rem,32%) 1fr 4.5rem' }}
                >
                  {monMode === 'realtime' && (
                    <span className="tabular text-xs text-muted">
                      {e.seen ? fmtDT(e.seen) : '—'}
                      {e.seen > 0 && <span> · {relTime(e.seen)}</span>}
                    </span>
                  )}
                  <span className="flex min-w-0 items-center gap-1.5">
                    <button onClick={() => toggleFav(e.coin.symbol)} title="Favoritar" className="shrink-0 text-base text-muted">{favs.includes(e.coin.symbol) ? '★' : '☆'}</button>
                    {coinIcon(e.coin)}
                    <Link to={`/monitor?symbol=${e.coin.symbol}`} className="truncate font-bold hover:underline">{e.coin.name}</Link>
                  </span>
                  <span className="flex min-w-0 items-center">
                    <span
                      className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${monVar(e.filter.color)} 30%, transparent)`, color: monVar(e.filter.color) }}
                    >
                      {monIcon(e.filter.icon)}
                    </span>
                    <strong className="truncate" style={{ color: monVar(e.filter.color) }}>{e.filter.name}</strong>
                  </span>
                  <span className="flex items-center justify-end gap-2 text-muted">
                    <Link to={`/monitor?symbol=${e.coin.symbol}`} title="Abrir gráfico" className="hover:text-white"><BarChart3 size={15} /></Link>
                    <span title={e.filter.description || e.filter.name} className="cursor-help hover:text-white"><Info size={15} /></span>
                  </span>
                </div>
              ))
            )}
            {monFeed.length > 200 && (
              <div className="py-1 text-center text-xs text-muted">Mostrando 200 de {monFeed.length.toLocaleString('pt-BR')} — use a busca para refinar.</div>
            )}
          </div>
        ) : (
          <>
            <div className="grid items-center gap-1 px-2 text-xs text-muted" style={{ gridTemplateColumns: gridCols }}>
              {cols[tab].map((c, i) => <span key={i}>{c.h}</span>)}
            </div>
            <div
              ref={scrollRef}
              className="max-h-[62vh] overflow-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 800) {
                  setCount((c) => (c < rows.length ? c + 250 : c));
                }
              }}
            >
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                {vItems.map((v) => {
                  const d = shown[v.index];
                  return (
                    <div
                      key={d.id}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${v.size}px`, transform: `translateY(${v.start}px)`, gridTemplateColumns: gridCols }}
                      className="grid items-center gap-1 border-t border-[var(--border)] px-2 text-sm hover:bg-[var(--surface-2)]"
                    >
                      {renderRow(d, v.index)}
                    </div>
                  );
                })}
              </div>
            </div>
            {tab !== 'RSI' && !IND_TABS.includes(tab) && rows.length > shown.length && (
              <div className="py-1 text-center text-xs text-muted">Mostrando {shown.length} de {rows.length.toLocaleString('pt-BR')} — use a busca para refinar.</div>
            )}
          </>
        )}
      </Panel>
      {rsiFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRsiFilterOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <PanelTitle>Filtros</PanelTitle>
            <label className="mt-3 block text-xs text-muted">Coluna</label>
            <select
              value={rsiDraft.col}
              onChange={(e) => setRsiDraft((d) => ({ ...d, col: e.target.value as RsiCol }))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            >
              {RSI_COLS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
            <label className="mt-3 block text-xs text-muted">Operador</label>
            <select
              value={rsiDraft.op}
              onChange={(e) => setRsiDraft((d) => ({ ...d, op: e.target.value as RsiOp }))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            >
              {rsiOps.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
            </select>
            <label className="mt-3 block text-xs text-muted">Valor</label>
            <input
              value={rsiDraft.value}
              onChange={(e) => setRsiDraft((d) => ({ ...d, value: e.target.value }))}
              inputMode="decimal"
              placeholder="Ex.: 70"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm tabular"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setRsiFilter(null); setRsiFilterOpen(false); }}
                className="flex-1 rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]"
              >
                Limpar
              </button>
              <button
                onClick={() => {
                  const v = parseFloat(rsiDraft.value.replace(',', '.'));
                  if (!Number.isNaN(v)) setRsiFilter({ col: rsiDraft.col, op: rsiDraft.op, value: v });
                  setRsiFilterOpen(false);
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-black"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
      {maModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMaModal(null)}>
          <div className="max-h-[80vh] w-full max-w-sm overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <PanelTitle>Selecione uma opção</PanelTitle>
              <button onClick={() => setMaModal(null)} className="text-xl leading-none text-muted" title="Fechar">×</button>
            </div>
            <input
              value={maSearch}
              onChange={(e) => setMaSearch(e.target.value)}
              placeholder={maModal}
              className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <div className="mt-2 space-y-2">
              {[
                { id: 'price' as MaFast, label: `Price Cross ${maModal}` },
                ...MA_FASTS.map((f) => ({ id: f as MaFast, label: `${maModal} ${f} cross` })),
              ]
                .filter((o) => o.label.toLowerCase().includes(maSearch.trim().toLowerCase()))
                .map((o) => {
                  const active = (maModal === 'SMA' ? smaCfg : emaCfg) === o.id;
                  return (
                    <button
                      key={o.label}
                      onClick={() => {
                        if (maModal === 'SMA') setSmaCfg(o.id);
                        else setEmaCfg(o.id);
                        setMaModal(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${active ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
                    >
                      {o.label}
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold"
                        style={active ? { background: 'var(--up)', borderColor: 'var(--up)', color: '#000' } : { borderColor: 'var(--border)', color: 'transparent' }}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
      {monListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMonListOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <PanelTitle>Filtros do Monitor</PanelTitle>
              <button onClick={() => setMonListOpen(false)} className="text-xl leading-none text-muted" title="Fechar">×</button>
            </div>
            <div className="mt-1 text-xs text-muted">Prontos</div>
            <div className="mt-1 space-y-1.5">
              {PRESET_FILTERS.map((f) => {
                const on = !monDisabled.includes(f.id);
                return (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggleMonFilter(f.id)} />
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${monVar(f.color)} 25%, transparent)`, color: monVar(f.color) }}>{monIcon(f.icon)}</span>
                    <span className="flex-1"><strong>{f.name}</strong><span className="block text-xs text-muted">{f.description}</span></span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-muted">Meus filtros</div>
            <div className="mt-1 space-y-1.5">
              {monFiltersCustom.length === 0 && <div className="text-xs text-muted">Nenhum ainda. Crie o seu abaixo.</div>}
              {monFiltersCustom.map((f) => {
                const on = !monDisabled.includes(f.id);
                return (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggleMonFilter(f.id)} title="Ativar" />
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${monVar(f.color)} 25%, transparent)`, color: monVar(f.color) }}>{monIcon(f.icon)}</span>
                    <span className="flex-1"><strong>{f.name}</strong><span className="block text-xs text-muted">{f.conditions.length} condição(ões)</span></span>
                    <button onClick={() => removeMonFilter(f.id)} className="text-xs text-muted hover:text-[var(--down)]" title="Excluir">✕</button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => { setMonDraft(blankDraft()); setMonListOpen(false); setMonBuilderOpen(true); }}
              className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-black"
            >
              ＋ Novo filtro
            </button>
          </div>
        </div>
      )}
      {monBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMonBuilderOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <PanelTitle>Novo filtro</PanelTitle>
              <button onClick={() => setMonBuilderOpen(false)} className="text-xl leading-none text-muted" title="Fechar">×</button>
            </div>
            <label className="mt-3 block text-xs text-muted">Nome</label>
            <input
              value={monDraft.name}
              onChange={(e) => setMonDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Ex.: Pullback em alta"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted">Ícone</label>
                <select value={monDraft.icon} onChange={(e) => setMonDraft((d) => ({ ...d, icon: e.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                  {MON_ICONS.map((i) => <option key={i.k} value={i.k}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted">Cor</label>
                <select value={monDraft.color} onChange={(e) => setMonDraft((d) => ({ ...d, color: e.target.value as MonColor }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                  {MON_COLORS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <label className="mt-3 block text-xs text-muted">Descrição</label>
            <input
              value={monDraft.description}
              onChange={(e) => setMonDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="O que este filtro detecta"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            />
            <div className="mt-3 text-xs font-semibold">Condições (todas precisam passar)</div>
            <div className="mt-1 space-y-2">
              {monDraft.conditions.map((c, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={c.indicator} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      const indicator = e.target.value as MonIndicator;
                      conditions[i] = { indicator, tf: '1d', field: MON_FIELDS[indicator][0].k, op: 'lte', value: 30 };
                      return { ...d, conditions };
                    })} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                      {MON_INDICATORS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <select value={c.tf} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      conditions[i] = { ...conditions[i], tf: e.target.value as MonTf };
                      return { ...d, conditions };
                    })} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                      {MON_TFS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <select value={c.field} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      conditions[i] = { ...conditions[i], field: e.target.value };
                      return { ...d, conditions };
                    })} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                      {MON_FIELDS[c.indicator].map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <select value={c.op} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      conditions[i] = { ...conditions[i], op: e.target.value as MonOp };
                      return { ...d, conditions };
                    })} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                      {MON_OPS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {c.indicator === 'trend' ? (
                      <select value={c.value} onChange={(e) => setMonDraft((d) => {
                        const conditions = [...d.conditions];
                        conditions[i] = { ...conditions[i], value: Number(e.target.value) };
                        return { ...d, conditions };
                      })} className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                        {TREND_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : c.indicator === 'super' ? (
                      <select value={c.value} onChange={(e) => setMonDraft((d) => {
                        const conditions = [...d.conditions];
                        conditions[i] = { ...conditions[i], value: Number(e.target.value) };
                        return { ...d, conditions };
                      })} className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs">
                        <option value={1}>Alta</option>
                        <option value={0}>Baixa</option>
                      </select>
                    ) : (
                      <input
                        value={String(c.value)}
                        onChange={(e) => setMonDraft((d) => {
                          const conditions = [...d.conditions];
                          const v = parseFloat(e.target.value.replace(',', '.'));
                          conditions[i] = { ...conditions[i], value: Number.isNaN(v) ? 0 : v };
                          return { ...d, conditions };
                        })}
                        inputMode="decimal"
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs tabular"
                      />
                    )}
                    <button
                      onClick={() => setMonDraft((d) => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }))}
                      className="rounded-lg border border-[var(--border)] px-2 text-xs text-muted hover:text-[var(--down)]"
                      title="Remover condição"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setMonDraft((d) => ({ ...d, conditions: [...d.conditions, { indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 }] }))}
              className="mt-2 w-full rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs font-semibold text-muted"
            >
              ＋ Adicionar condição (E)
            </button>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setMonBuilderOpen(false)} className="flex-1 rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!monDraft.name.trim() || !monDraft.conditions.length) return;
                  addMonFilter({ id: `custom-${Date.now()}`, preset: false, ...monDraft, name: monDraft.name.trim(), description: monDraft.description.trim() });
                  setMonBuilderOpen(false);
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-bold text-black"
              >
                Salvar filtro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
