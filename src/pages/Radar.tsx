import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useUniverseCrypto } from '@/services/universeHooks';
import { ensureTopKlines, closesToCandles, snapOf, type IndSnap } from '@/services/indicatorTable';
import { ensureRsiTable, getIntervalKlines, rsiBand, RSI_COLS, RSI_SORT_KEYS, sampleEvery, type RsiCol, type RsiFilter, type RsiOp, type RsiSnap } from '@/services/rsiTable';
import { coinTrend, coinTrendMultiTF, shiftLabel, TREND_LEVEL, TREND_MODE_LEGS, type CoinTrend, type TrendOhlc, type TrendState, type TrendTf } from '@/engine/trend';
import { unusualMove } from '@/engine/attention';
import { aggregateClosed, floorPivots, type Pivots } from '@/engine/pivots';
import { detectPatterns, loadPatSeen, savePatSeen, type DetectedPattern, type PatternSentiment } from '@/engine/patterns';
import { syncWedgeLog, wedgeBreakStats, type WedgeKind, type WedgeState } from '@/engine/wedges';
import { runPatterns } from '@/services/patternsWorker';
import { computeMaSet, ensureMaKlines, maCrossDiff, maCrossTitle, slowsFor, MA_FASTS, type MaFast, type MaKind, type MaSet } from '@/services/maTable';
import { isActiveCoin, isStablecoin, type UniverseCoin } from '@/services/universeTypes';
import type { Candle } from '@/types';
import { Skeleton, ErrorBox, Seg } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MEmpty } from '@/components/minimal/MEmpty';
import { MDot } from '@/components/minimal/MStats';
import { CoinLogo } from '@/components/ui/coin-logo';
import { ArrowUpRight, BarChart3, Bell, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Flame, Gem, Globe, Info, ListPlus, Maximize2, Plus, RotateCw, Siren, Star, TrendingDown, TrendingUp, TriangleAlert, X, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketStrip } from '@/components/analysis/MarketStrip';
import { fmtUSD, fmtPct, fmtPrice } from '@/lib/format';
import { calcBB, calcStoch, calcSupertrendFull } from '@/engine/indicators';
import {
  buildMonData, diffEdgeEvents, evalFilter, evalFilterState, loadMonActive, loadMonEvents,
  planMonitorData, saveMonActive, saveMonEvents, selectTopByMcap, validateCondition, validateFilter,
  whyFilter,
  MON_COLORS, MON_FIELDS, MON_ICONS, MON_INDICATORS, MON_OPS, MON_TF_BY_INDICATOR, MON_TFS,
  PRESET_FILTERS, TREND_LEVEL_OPTIONS,
  type MonColor, type MonCondition, type MonData, type MonEdgeEvent, type MonEdgeState,
  type MonFilter, type MonIndicator, type MonOp, type MonTf,
} from '@/engine/monitor';
import { fetchMonCoinKlines } from '@/services/monitorData';
import { subscribeMonEvents } from '@/services/monitorWatch';
import { normalizeTickerKey } from '@/lib/symbols';
import { connectRealtimeMarket, disconnectRealtimeMarket, subscribeRealtimeTicks, subscribeRealtimeMeta, type RealtimeMeta } from '@/services/realtimeMarket';

type Tab = 'MON' | 'BTC' | 'PERF' | 'TREND' | 'RSI' | 'STOCH' | 'SUPER' | 'VOL' | 'MACD' | 'BB' | 'SMA' | 'EMA' | 'SR' | 'PAT';
type SortKey = 'marketCap' | 'symbol' | 'price' | 'change1h' | 'change24h' | 'change7d' | 'change30d' | 'change1y' | 'volume24h'
  | 'trendCurto' | 'trendMedio' | 'trendLongo' | 'mudCurto' | 'mudMedio' | 'mudLongo' | RsiCol
  | 'stochFast' | 'stochSlow' | 'superH1' | 'superH4' | 'superD1' | 'superW1'
  | 'attToday' | 'attRatio' | 'bbUpper' | 'bbLower'
  | 'srS1' | 'srS2' | 'srS3' | 'srR1' | 'srR2' | 'srR3';

const TABS: { k: Tab; label: string }[] = [
  { k: 'MON', label: 'Monitor' },
  { k: 'PAT', label: 'Padrões' },
  { k: 'BTC', label: 'BTC vs Altcoins' },
  { k: 'PERF', label: 'Performance' },
  { k: 'TREND', label: 'Tendência' },
  { k: 'RSI', label: 'RSI' },
  { k: 'STOCH', label: 'Stoch' },
  { k: 'SUPER', label: 'Supertrend' },
  { k: 'VOL', label: 'Movimento Atípico' },
  { k: 'MACD', label: 'MACD Signal' },
  { k: 'BB', label: 'Bollinger' },
  { k: 'SMA', label: 'SMA' },
  { k: 'EMA', label: 'EMA' },
  { k: 'SR', label: 'S/R' },
];
const IND_TABS: Tab[] = ['STOCH', 'VOL', 'MACD', 'SR', 'PAT'];
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
/** Cores das pills de tendência (puro p/ teste). Neutro = cinza; forte = fundo sólido + negrito. */
export function trendBadge(s: TrendState | null): { bg: string; fg: string; bold: boolean } | null {
  if (!s) return null;
  if (s === 'Neutro') return { bg: 'rgba(255,255,255,0.06)', fg: 'var(--muted)', bold: false };
  const up = s.startsWith('Alta');
  const strong = s.endsWith('Forte');
  const c = up ? '--up' : '--down';
  return { bg: `color-mix(in srgb, var(${c}) ${strong ? 32 : 18}%, transparent)`, fg: `var(${c})`, bold: strong };
}
/** Texto/cores das pills de mudança de tendência (puro p/ teste). */
export function shiftBadge(m: { from: TrendState; to: TrendState; delta: number } | null): { text: string; bg: string; fg: string } | null {
  if (!m) return null;
  if (m.delta === 0) return { text: `Mantém ${shiftLabel(m.to)}`, bg: 'rgba(255,255,255,0.06)', fg: 'var(--muted)' };
  const up = m.delta > 0;
  const c = up ? '--up' : '--down';
  return { text: `${shiftLabel(m.from)} para ${shiftLabel(m.to)}`, bg: `color-mix(in srgb, var(${c}) 16%, transparent)`, fg: `var(${c})` };
}
/** Ícones desenhados dos filtros (nunca emoji como sistema de ícones). */
const MON_ICON_MAP: Record<string, LucideIcon> = {  'trend-up': TrendingUp, alert: TriangleAlert, flame: Flame, check: CheckCircle2,
  'trend-down': TrendingDown, gem: Gem, zap: Zap, siren: Siren,
  'up-right': ArrowUpRight, eye: Eye, star: Star,
};
export function monIcon(key: string, size = 14) {
  const I = MON_ICON_MAP[key] ?? Star;
  return <I size={size} />;
}

/** Cor sólida de cada cor de filtro (pílulas, dots e dropdown). */
export const MON_COLOR_HEX: Record<MonColor, string> = {
  green: '#34d399',
  red: '#fb7185',
  yellow: '#fbbf24',
  blue: '#60a5fa',
};

function cacheAge(ts: number | null): string {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'cache agora mesmo';
  return `cache há ${m} min`;
}

/** Idade dos indicadores calculados ("há 3 min" / "agora mesmo"). */
function dataAge(ts: number | null): string {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora mesmo';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
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

const toneUpDown = (v: number | null | undefined) => ((v ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400');

export function Radar() {
  const u = useUniverseCrypto();
  const favs = useStore((s) => s.favorites);
  const watchlist = useStore((s) => s.watchlist);
  const toggleFav = useStore((s) => s.toggleFav);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('MON');
  const [onlyActive, setOnlyActive] = useState(true);
  const [hideStables, setHideStables] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'marketCap', d: -1 });
  const [count, setCount] = useState(500);
  /** Top N compartilhado com a vigia (store persistido): mesmo universo nos dois. */
  const topN = useStore((s) => s.radarTopN);
  const setTopN = useStore((s) => s.setRadarTopN);
  /** Nº de moedas buscadas nas abas com klines; "Todas" = 300 (limite do fetch). */
  const fetchN = topN ?? 300;
  /** Ids do pelotão Top N por ranking oficial (sem filtrar por marketCap null). Exatamente topN por rank. */
  const mcapTopIds = useMemo(() => {
    if (topN == null) return null;
    const hasRank = u.coins.some((c) => c.rank != null);
    if (hasRank) {
      const sorted = [...u.coins].sort((a, b) => {
        const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity;
        if (ra !== rb) return ra - rb;
        return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      });
      return new Set(sorted.slice(0, topN).map((c) => c.id));
    }
    return new Set([...u.coins].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, topN).map((c) => c.id));
  }, [u.coins, topN]);
  /** Opções do "Selecione uma crypto": top 200 por market cap. */
  const jumpOpts = useMemo(() => {
    return [...u.coins].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 200);
  }, [u.coins]);
  /**
   * Universo do Monitor: SEMPRE Top N por market cap, independente da
   * ordenação visual da tabela. Vazio = sem market cap carregado (pausa).
   */
  const monUniverse = useMemo(
    () => selectTopByMcap(u.coins, topN, fetchN),
    [u.coins, topN, fetchN],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [selCrypto, setSelCrypto] = useState('');
  const [trendExpanded, setTrendExpanded] = useState(false);
  const [snaps, setSnaps] = useState<Map<string, IndSnap>>(new Map());
  const [klines, setKlines] = useState<Map<string, Candle[]>>(new Map());
  const [indProg, setIndProg] = useState<{ done: number; total: number } | null>(null);
  /** Quando os indicadores da aba atual terminaram de calcular (selo de idade). */
  const [indAt, setIndAt] = useState<number | null>(null);
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
  /** Gate de corrida: só processa eventos ao vivo depois do snapshot TopN completo. */
  const monReadyRef = useRef(false);
  const pendingMonEventsRef = useRef<MonEdgeEvent[]>([]);
  /** Bordas inativo→ativo (feed Realtime), persistidas; boot carrega em silêncio. */
  const [monEvents, setMonEvents] = useState<MonEdgeEvent[]>(() => loadMonEvents());
  /** Moedas avaliadas sem dados suficientes em algum filtro ativo (degradado). Conta distinta por moeda. */
  const [monDegraded, setMonDegraded] = useState(0);
  /** Detalhe por filtro para tooltip (ex.: "RSI 1d: 74, Super 4h: 12"). */
  const [monDegradedDetail, setMonDegradedDetail] = useState('');
  /** Histórico por moeda para atualização incremental do candle em formação (hist + realtime). */
  const monHistRef = useRef<Map<string, { coin: UniverseCoin; kl: Record<MonTf, Candle[] | null>; rangeKl: Partial<Record<MonTf, Candle[] | null>> }>>(new Map());
  /** Meta realtime por símbolo (LIVE/STALE/OFFLINE/NO_REALTIME + idade). */
  const [realtimeMeta, setRealtimeMeta] = useState<Map<string, RealtimeMeta>>(new Map());
  /** Pausa com motivo quando não há universo Top N válido para analisar. */
  const [monPaused, setMonPaused] = useState<string | null>(null);
  /** Id do filtro em edição no construtor (null = criando novo). */
  const [monEditingId, setMonEditingId] = useState<string | null>(null);
  const [monRefresh, setMonRefresh] = useState(0);
  const [monSecs, setMonSecs] = useState<number | null>(null);
  const [monListOpen, setMonListOpen] = useState(false);
  const [monBuilderOpen, setMonBuilderOpen] = useState(false);
  const blankDraft = (): { name: string; icon: string; color: MonColor; description: string; conditions: MonCondition[] } => ({
    name: '', icon: 'star', color: 'yellow', description: '', conditions: [{ indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 }],
  });
  const [monDraft, setMonDraft] = useState(blankDraft);
  /** Id em edição no construtor (null = criando). + erro de validação do save. */
  const [monBuilderError, setMonBuilderError] = useState<string | null>(null);
  /** Dropdowns custom do construtor (ícone/cor mostram prévia visual). */
  const [monIconOpen, setMonIconOpen] = useState(false);
  const [monColorOpen, setMonColorOpen] = useState(false);
  /** Filtros com combinação impossível (não avaliam; UI explica o motivo). */
  const monFilterIssues = useMemo(
    () => new Map(allMonFilters.map((f) => [f.id, validateFilter(f)])),
    [allMonFilters],
  );

  const [superSnaps, setSuperSnaps] = useState<Map<string, SuperSnap>>(new Map());
  const [rsiFilter, setRsiFilter] = useState<RsiFilter | null>(null);
  const [rsiFilterOpen, setRsiFilterOpen] = useState(false);
  const [rsiDraft, setRsiDraft] = useState<{ col: RsiCol; op: RsiOp; value: string }>({ col: 'rsiH4', op: 'gte', value: '70' });

  // ---- Padrões gráficos (aba PAT) ----
  const [patPatterns, setPatPatterns] = useState<string[]>([]);
  const [patSentiment, setPatSentiment] = useState<'Todas' | PatternSentiment>('Todas');
  const [patListOpen, setPatListOpen] = useState(false);
  const [patSort, setPatSort] = useState<{ k: 'time' | 'pattern' | 'sentiment' | 'stage'; d: 1 | -1 }>({ k: 'time', d: -1 });
  const [patFirstSeen, setPatFirstSeen] = useState<Record<string, number>>(() => loadPatSeen());

  // Hash por fechamento: só muda quando candle fecha (time), não a cada tick intra-bar
  const klinesVersion = useMemo(() => {
    let h = '';
    for (const [s, kl] of klines) h += `${s}:${kl.length}:${(kl[kl.length - 1]?.time ?? 0)}|`;
    return h;
  }, [klines]);

  // ---- S/R (aba SR): pivôs floor semanais (5 diários fechados), memo vinculado ao fechamento do candle ----
  const srPivots = useMemo(() => {
    const m = new Map<string, Pivots>();
    for (const [s, kl] of klines) {
      try {
        const base = aggregateClosed(kl, 5);
        if (base) m.set(s, floorPivots(base.high, base.low, base.close));
      } catch {
        /* moeda sem leitura */
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klinesVersion]);

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
      if (sort.k === 'srS1' || sort.k === 'srS2' || sort.k === 'srS3' || sort.k === 'srR1' || sort.k === 'srR2' || sort.k === 'srR3') {
        const pv = srPivots.get(c.symbol);
        const v = pv ? pv[sort.k.slice(2).toLowerCase() as 's1' | 's2' | 's3' | 'r1' | 'r2' | 'r3'] : null;
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
    if (sort.k === 'symbol') return [...list].sort((a, b) => a.symbol.localeCompare(b.symbol) * sort.d);
    return [...list].sort((a, b) => (val(a) - val(b)) * sort.d);
  }, [u.coins, q, onlyActive, hideStables, showAll, sort, tab, mcapTopIds, rsiSnaps, rsiFilter, indTf, trendWarm, superSnaps, smaCfg, emaCfg, maVals, srPivots]);
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
      setIndAt(Date.now());
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
      setIndAt(Date.now());
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
      setIndAt(Date.now());
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
      setIndAt(Date.now());
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, indTf, fetchN]);

  // Monitor: avalia filtros (prontos + personalizados) no Top N por market cap.
  // Busca SÓ o que os filtros ativos exigem; range (stoch/super) exige OHLC
  // real (indisponível, nunca sintético). Bordas inativo→ativo viram eventos.
  useEffect(() => {
    if (tab !== 'MON') return;
    let alive = true;
    monReadyRef.current = false;
    pendingMonEventsRef.current = [];
    (async () => {
      // Sem universo válido: pausa com aviso, mantém a última análise.
      if (!monUniverse.length) {
        setMonPaused(u.coins.length
          ? 'Sem market cap carregado para montar o Top N — aguardando dados.'
          : 'Carregando universo…');
        setIndProg(null);
        return;
      }
      setMonPaused(null);
      const t0 = Date.now();
      setIndProg({ done: 0, total: monUniverse.length });
      setMonSecs(null);
      const validFilters = activeMonFilters.filter((f) => validateFilter(f).length === 0);
      const plan = planMonitorData(validFilters);
      const top = monUniverse;
      const data = new Map<string, MonData>();
      monHistRef.current.clear();
      for (let i = 0; i < top.length; i += 8) {
        const batch = await Promise.all(
          top.slice(i, i + 8).map(async (c) => {
            const { kl, rangeKl } = await fetchMonCoinKlines(c, plan);
            // Guarda histórico para atualização incremental do candle em formação (§3)
            monHistRef.current.set(c.symbol, { coin: c, kl: { ...kl }, rangeKl: { ...rangeKl } });
            return [c.symbol, buildMonData(c, kl, rangeKl)] as const;
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
      const states: { key: string; filterId: string; symbol: string; state: MonEdgeState }[] = [];
      const degradedCoins = new Set<string>();
      const perFilterUnknown = new Map<string, number>();
      for (const d of data.values()) {
        for (const f of validFilters) {
          const state = evalFilterState(d, f);
          if (state === 'unknown') {
            degradedCoins.add(d.symbol);
            perFilterUnknown.set(f.id, (perFilterUnknown.get(f.id) ?? 0) + 1);
          }
          states.push({ key: `${f.id}:${d.symbol}`, filterId: f.id, symbol: d.symbol, state });
        }
      }
      const degraded = degradedCoins.size;
      // Boot silencioso: ativos persistidos não re-disparam após reload.
      const { active, events, changed } = diffEdgeEvents(loadMonActive(), states, now);
      if (changed) {
        saveMonActive(active);
        const merged = [...events, ...loadMonEvents()];
        saveMonEvents(merged);
        setMonEvents(merged.slice(0, 200));
      }
      setMonDegraded(degraded);
      if (perFilterUnknown.size) {
        const parts = [...perFilterUnknown.entries()].map(([fid, n]) => {
          const fname = validFilters.find((x) => x.id === fid)?.name ?? fid;
          return `${fname}: ${n}`;
        });
        setMonDegradedDetail(parts.join(' · '));
      } else setMonDegradedDetail('');
      setMonSecs(Math.max(1, Math.round((Date.now() - t0) / 1000)));
      setIndProg(null);
      setIndAt(Date.now());
      monReadyRef.current = true;
      // Flush: se chegaram eventos enquanto snapshot carregava, descarrega agora
      if (pendingMonEventsRef.current.length) {
        const pending = pendingMonEventsRef.current;
        pendingMonEventsRef.current = [];
        // Merge pendentes com feed atual mantendo cap 200
        try {
          const mergedPending = [...pending, ...loadMonEvents()].slice(0, 200);
          setMonEvents(mergedPending);
        } catch { /* best-effort */ }
      }
    })();
    return () => {
      alive = false;
      monReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, monRefresh, activeMonFilters, fetchN, monUniverse]);

  // Tempo real de verdade: a vigia empurra bordas (mesma aba via CustomEvent,
  // outras abas via storage) — o feed atualiza sem refresh manual.
  useEffect(() => {
    if (tab !== 'MON') return;
    const unsub = subscribeMonEvents(() => {
      const evs = loadMonEvents().slice(0, 200);
      // CORRIDA DE ESTADO: se snapshot ainda não completou, enfileira o último lote e não tenta atualizar feed com monData vazio
      if (!monReadyRef.current) {
        pendingMonEventsRef.current = evs;
        return;
      }
      // STALE CLOSURE + normalização: usa loadMonEvents() (fonte da verdade) e cap 200; atualiza funcional
      setMonEvents(evs);
    });
    // LIMPEZA RIGOROSA: retorna unsubscribe para evitar duplicidade ao navegar
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ---- Realtime market stream (§1-10): WebSocket > REST poll fallback, LIVE/STALE/OFFLINE, NO_REALTIME explícito ----
  useEffect(() => {
    if (tab !== 'MON' || monMode !== 'realtime' || !monUniverse.length) {
      disconnectRealtimeMarket();
      return;
    }
    let alive = true;
    // Q2: Todas em Realtime limitado a Top 300 para estabilidade (§ Todas = 750 seria 25 WS ×750)
    const realtimeUniverse = topN == null ? monUniverse.slice(0, 300) : monUniverse;
    // Conecta stream para o pelotão atual (resolve USDT→USDC→BTC, §5)
    void connectRealtimeMarket(realtimeUniverse.map((c) => c.symbol)).catch(() => {});
    const unsubMeta = subscribeRealtimeMeta((m) => { if (alive) setRealtimeMeta(new Map(m)); });
    const unsubTicks = subscribeRealtimeTicks((tick) => {
      if (!alive || !monReadyRef.current) return;
      const entry = monHistRef.current.get(tick.symbol);
      if (!entry) return;
      // Atualiza candle em formação (§3): 99 hist + candle atual com preço realtime
      const tfs: MonTf[] = ['1d', '1h', '4h', '1w'];
      for (const tf of tfs) {
        const kl = entry.kl[tf];
        if (!kl || !kl.length) continue;
        const last = kl[kl.length - 1];
        if (!last) continue;
        // Para 1d, candle diário em formação via preço atual (§2)
        const upd: Candle = { time: last.time, open: last.open, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price, volume: last.volume };
        kl[kl.length - 1] = upd;
        const rk = entry.rangeKl[tf];
        if (rk && rk.length) {
          const rl = rk[rk.length - 1];
          if (rl) rk[rk.length - 1] = { ...rl, high: Math.max(rl.high, tick.price), low: Math.min(rl.low, tick.price), close: tick.price };
        }
      }
      try {
        const newMon = buildMonData(entry.coin, entry.kl, entry.rangeKl);
        setMonData((prev) => {
          const next = new Map(prev);
          next.set(tick.symbol, newMon);
          return next;
        });
        // Reavalia filtros só desta moeda e emite bordas §7 sem monRefresh manual
        const valid = activeMonFilters.filter((f) => validateFilter(f).length === 0);
        const now = Date.now();
        const prevActive = loadMonActive();
        const nextActive = { ...prevActive };
        let changed = false;
        const newEvents: MonEdgeEvent[] = [];
        for (const f of valid) {
          const key = `${f.id}:${tick.symbol}`;
          const st = evalFilterState(newMon, f);
          const was = !!prevActive[key];
          if (st === 'active' && !was) { nextActive[key] = true; newEvents.push({ key, filterId: f.id, symbol: tick.symbol, ts: now }); changed = true; }
          else if (st === 'inactive' && was) { delete nextActive[key]; changed = true; }
          // unknown mantém estado (tri-state §4)
        }
        if (changed) {
          saveMonActive(nextActive);
          const merged = [...newEvents, ...loadMonEvents()].slice(0, 200);
          saveMonEvents(merged);
          if (monReadyRef.current) setMonEvents(merged);
          else pendingMonEventsRef.current = merged;
        }
        // Atualiza idade do cálculo
        setIndAt(now);
      } catch {}
    });
    return () => {
      alive = false;
      unsubMeta(); unsubTicks();
      disconnectRealtimeMarket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, monMode, monUniverse.map((c)=>c.id).join(','), activeMonFilters.map((f)=>f.id).join(',')]);

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
      setIndAt(Date.now());
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchN]);

  const shown = useMemo(() => {
    if (tab === 'MON' || tab === 'PAT') return [];
    if (tab === 'PERF' || tab === 'BTC' || (tab === 'TREND' && indTf === '1d')) return rows;
    return rows.slice(0, fetchN);
  }, [rows, count, tab, indTf, fetchN]);

  // ---- Feed de padrões: off-main-thread via Worker (padrão walkforward), vinculado ao fechamento do candle ----
  const [patMap, setPatMap] = useState<Map<string, DetectedPattern[]>>(new Map());
  useEffect(() => {
    if (tab !== 'PAT') { setPatMap(new Map()); return; }
    if (!klines.size) { setPatMap(new Map()); return; }
    let cancelled = false;
    const candlesObj: Record<string, import('@/types').Candle[]> = Object.fromEntries(klines);
    let cancelWorker = () => {};
    (async () => {
      try {
        const { promise, cancel } = runPatterns(candlesObj, {}, (done, total) => {
          if (!cancelled) setIndProg({ done, total });
        });
        cancelWorker = cancel;
        const results = await promise;
        if (cancelled) return;
        const m = new Map<string, DetectedPattern[]>();
        for (const [sym, list] of Object.entries(results)) {
          if (!list.length) continue;
          const kl = klines.get(sym);
          const closes = kl?.map((c) => c.close) ?? [];
          const enriched = list.map((p) => {
            const kind: WedgeKind | null =
              p.pattern === 'Cunha Descendente Verificada' ? 'desc'
              : p.pattern === 'Cunha Ascendente Verificada' ? 'asc' : null;
            if (!kind) return p;
            try {
              const st = wedgeBreakStats(closes, kind);
              if (st && st.n >= 3) return { ...p, detail: `${p.detail} · histórico: ${st.n} breaks, ${st.favorPct}% a favor` };
            } catch { /* sem histórico */ }
            return p;
          });
          m.set(sym, enriched);
        }
        setPatMap(m);
        setIndProg(null);
        setIndAt(Date.now());
      } catch {
        if (cancelled) return;
        // Fallback síncrono chunked: executa em micro-batches para não congelar
        const m = new Map<string, DetectedPattern[]>();
        for (const [s, kl] of klines) {
          if (cancelled) break;
          try {
            const found = detectPatterns(kl);
            if (!found.length) continue;
            const closes = kl.map((k) => k.close);
            m.set(s, found.map((p) => {
              const kind: WedgeKind | null =
                p.pattern === 'Cunha Descendente Verificada' ? 'desc'
                : p.pattern === 'Cunha Ascendente Verificada' ? 'asc' : null;
              if (!kind) return p;
              try { const st = wedgeBreakStats(closes, kind); if (st && st.n >= 3) return { ...p, detail: `${p.detail} · histórico: ${st.n} breaks, ${st.favorPct}% a favor` }; } catch {}
              return p;
            }));
          } catch { /* moeda sem leitura */ }
        }
        setPatMap(m);
      }
    })();
    return () => { cancelled = true; cancelWorker(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, klinesVersion]);

  useEffect(() => {
    if (tab !== 'PAT' || !patMap.size) return;
    const fs = loadPatSeen();
    let changed = false;
    const now = Date.now();
    for (const [s, list] of patMap) {
      for (const p of list) {
        const k = `${p.pattern}:${s}`;
        if (!fs[k]) { fs[k] = now; changed = true; }
      }
    }
    if (changed) savePatSeen(fs);
    setPatFirstSeen(fs);
    // Log de selos de cunha: emitido → confirmado → revogado (caiu sozinho).
    try {
      const entries: { symbol: string; kind: WedgeKind; state: WedgeState; price: number }[] = [];
      for (const [s, list] of patMap) {
        for (const p of list) {
          const kind: WedgeKind | null =
            p.pattern === 'Cunha Descendente Verificada' ? 'desc'
            : p.pattern === 'Cunha Ascendente Verificada' ? 'asc' : null;
          if (!kind) continue;
          const px = klines.get(s)?.slice(-1)[0]?.close;
          if (px) entries.push({ symbol: s, kind, state: p.stage === 'Confirmado' ? 'confirmed' : 'forming', price: px });
        }
      }
      syncWedgeLog(entries);
    } catch {
      /* log é acessório */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, patMap]);

  const patFeed = useMemo(() => {
    if (tab !== 'PAT') return [];
    const needle = q.trim().toLowerCase();
    const bySymbol = new Map<string, UniverseCoin>();
    for (const c of rows) if (!bySymbol.has(c.symbol)) bySymbol.set(c.symbol, c);
    const out: { coin: UniverseCoin; pat: DetectedPattern; seen: number }[] = [];
    for (const [s, list] of patMap) {
      const coin = bySymbol.get(s);
      if (!coin) continue;
      if (needle && !coin.symbol.toLowerCase().includes(needle) && !coin.name.toLowerCase().includes(needle)) continue;
      for (const p of list) {
        if (patPatterns.length && !patPatterns.includes(p.pattern)) continue;
        if (patSentiment !== 'Todas' && p.sentiment !== patSentiment) continue;
        out.push({ coin, pat: p, seen: patFirstSeen[`${p.pattern}:${s}`] ?? 0 });
      }
    }
    const dir = patSort.d;
    const byTime = (a: (typeof out)[number], b: (typeof out)[number]) => (a.seen - b.seen) * dir;
    const byStr = (f: (e: (typeof out)[number]) => string) => (a: (typeof out)[number], b: (typeof out)[number]) => f(a).localeCompare(f(b)) * dir;
    if (patSort.k === 'pattern') out.sort(byStr((e) => e.pat.pattern));
    else if (patSort.k === 'sentiment') out.sort(byStr((e) => e.pat.sentiment));
    else if (patSort.k === 'stage') out.sort(byStr((e) => e.pat.stage));
    else out.sort(byTime);
    return out;
  }, [tab, rows, q, patMap, patPatterns, patSentiment, patFirstSeen, patSort]);

  const monFeed = useMemo(() => {
    if (tab !== 'MON') return [];
    const needle = q.trim().toLowerCase();
    const byId = new Map(allMonFilters.map((f) => [f.id, f]));
    const bySymbol = new Map<string, UniverseCoin>();
    const byNorm = new Map<string, UniverseCoin>();
    for (const c of rows) {
      if (!bySymbol.has(c.symbol)) bySymbol.set(c.symbol, c);
      const nk = normalizeTickerKey(c.symbol);
      if (!byNorm.has(nk)) byNorm.set(nk, c);
    }
    // Mapa normalizado de MonData para lookup WS/REST sem falhar por caixa ou barra
    const monDataNorm = new Map<string, MonData>();
    for (const [k, v] of monData) monDataNorm.set(normalizeTickerKey(k), v);
    const favNorm = new Set(favs.map((s) => normalizeTickerKey(s)));
    const valid = new Set(activeMonFilters.filter((f) => validateFilter(f).length === 0).map((f) => f.id));
    const matchQ = (coin: UniverseCoin): boolean =>
      !needle || coin.symbol.toLowerCase().includes(needle) || coin.name.toLowerCase().includes(needle);
    const whyOf = (md: MonData | undefined, f: MonFilter): string => {
      if (!md) return '';
      try {
        return whyFilter(md, f);
      } catch {
        return '';
      }
    };
    type FeedItem = { coin: UniverseCoin; filter: MonFilter; seen: number; why: string; fresh: boolean };
    let out: FeedItem[];
    if (monMode === 'realtime') {
      // Realtime mostra TODAS que satisfazem agora (100% do pelotão), NOVO só para borda recente <15min
      out = [];
      for (const md of monData.values()) {
        const coin = byNorm.get(normalizeTickerKey(md.symbol)) ?? bySymbol.get(md.symbol);
        if (!coin || !matchQ(coin)) continue;
        for (const f of activeMonFilters) {
          if (!byId.has(f.id) || !valid.has(f.id)) continue;
          if (evalFilter(md, f)) {
            const ev = monEvents.find((x) => x.key === `${f.id}:${md.symbol}`);
            const isFresh = ev ? Date.now() - ev.ts < 15 * 60 * 1000 : false;
            out.push({ coin, filter: f, seen: ev?.ts ?? 0, why: whyOf(md, f), fresh: isFresh });
          }
        }
      }
      out.sort((a, b) => b.seen - a.seen || a.coin.symbol.localeCompare(b.coin.symbol));
    } else {
      out = [];
      for (const md of monData.values()) {
        const coin = byNorm.get(normalizeTickerKey(md.symbol)) ?? bySymbol.get(md.symbol);
        if (!coin || !matchQ(coin)) continue;
        for (const f of activeMonFilters) {
          if (!byId.has(f.id) || !valid.has(f.id)) continue;
          if (evalFilter(md, f)) {
            const ev = monEvents.find((x) => x.key === `${f.id}:${md.symbol}`);
            out.push({ coin, filter: f, seen: ev?.ts ?? 0, why: whyOf(md, f), fresh: false });
          }
        }
      }
      out.sort((a, b) => b.seen - a.seen);
    }
    if (monFavOnly) out = out.filter((e) => favNorm.has(normalizeTickerKey(e.coin.symbol)));
    return out;
  }, [tab, rows, q, monData, activeMonFilters, allMonFilters, monEvents, monMode, monFavOnly, favs]);

  // ---- Realtime summary (§6/11): LIVE/STALE/OFFLINE/NO_REALTIME counts + idade último evento ----
  const realtimeSummary = useMemo(() => {
    if (tab !== 'MON' || monMode !== 'realtime' || !realtimeMeta.size) return null;
    let live = 0, stale = 0, offline = 0, no = 0;
    let minAge: number | null = null;
    for (const m of realtimeMeta.values()) {
      if (m.state === 'LIVE') { live += 1; if (m.ageMs != null) minAge = minAge == null ? m.ageMs : Math.min(minAge, m.ageMs); }
      else if (m.state === 'STALE') stale += 1;
      else if (m.state === 'OFFLINE') offline += 1;
      else if (m.state === 'NO_REALTIME') no += 1;
    }
    const fmtAge = (ms: number | null) => {
      if (ms == null) return '—';
      if (ms < 1000) return `${(ms/1000).toFixed(1)}s`;
      if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
      return `${Math.round(ms/1000)}s`;
    };
    return { live, stale, offline, noRealtime: no, lastAge: fmtAge(minAge), total: realtimeMeta.size };
  }, [tab, monMode, realtimeMeta]);

  // C2: pausar Realtime quando rede indisponível e <50% avaliado (não mostrar 150 OFFLINE como TEMPO REAL)
  useEffect(() => {
    if (tab !== 'MON' || monMode !== 'realtime') return;
    const total = topN ?? 300;
    const evaluated = monData.size;
    const isNetworkPaused = !!u.error && /rede indisponível/i.test(u.error);
    const isMostlyOffline = realtimeSummary ? (realtimeSummary.offline + realtimeSummary.noRealtime) === realtimeSummary.total : false;
    if ((isNetworkPaused || isMostlyOffline) && evaluated > 0 && evaluated < total * 0.5) {
      setMonPaused(`Sem mercado realtime — rede indisponível — exibindo cache de ${cacheAge(u.cacheTs) || 'agora mesmo'}`);
    } else if (monPaused && monPaused.startsWith('Sem mercado realtime')) {
      // libera pausa quando rede voltar ou avaliação completar
      if (!isNetworkPaused && !isMostlyOffline) setMonPaused(null);
    }
  }, [tab, monMode, monData.size, realtimeSummary, u.error, u.cacheTs, topN]);

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
    <button onClick={() => k && setSort((s) => ({ k, d: s.k === k ? ((s.d * -1) as 1 | -1) : -1 }))} className="inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors duration-150 ease-out hover:text-zinc-300 active:scale-[0.98]" title={k ? 'Clique para ordenar: maior → menor → menor → maior' : undefined}>
      {label}
      {k && (sort.k === k
        ? <span className="text-[10px] leading-none tabular-nums text-cyan-300">{sort.d === -1 ? '▼' : '▲'}</span>
        : <span className="text-[10px] leading-none tabular-nums text-zinc-600">⇅</span>)}
    </button>
  );

  if (!u.coins.length && !u.done && !u.error) {
    return (
      <div className="space-y-3">
        <MarketStrip />
        <MSection title="Crypto Radar — carregando universo">
          <div className="space-y-2 py-6 text-center text-sm text-zinc-400">
            <div>Buscando moedas na CoinGecko (página {u.page || 1})…</div>
            <div className="tabular-nums">{u.loaded.toLocaleString('pt-BR')} carregadas até agora</div>
          </div>
          <Skeleton className="h-48" />
        </MSection>
      </div>
    );
  }
  if (!u.coins.length && !u.done) return <Skeleton className="h-96" />;

  const pill = (v: number | null | undefined) => (
    <span className={cn('tabular-nums text-xs font-semibold', v == null ? 'text-zinc-600' : v >= 0 ? 'text-emerald-400' : 'text-red-400')}>
      {v == null ? '—' : fmtPct(v)}
    </span>
  );
  const dash = <span className="text-xs tabular-nums text-zinc-600">—</span>;
  const rsiOps: { k: RsiOp; label: string }[] = [
    { k: 'gte', label: 'Maior ou igual' },
    { k: 'lte', label: 'Menor ou igual' },
    { k: 'gt', label: 'Maior que' },
    { k: 'lt', label: 'Menor que' },
  ];
  const trendPill = (s: TrendState | null) => {
    if (!s) return dash;
    const tone = s.startsWith('Alta') ? 'up' : s.startsWith('Baixa') ? 'down' : 'flat';
    return <MDot tone={tone as 'up' | 'down' | 'flat'}>{s}</MDot>;
  };
  const shiftPill = (m: { from: TrendState; to: TrendState; delta: number } | null) => {
    const b = shiftBadge(m);
    if (!b || !m) return dash;
    const cls = m.delta > 0 ? 'text-emerald-400' : m.delta < 0 ? 'text-red-400' : 'text-zinc-400';
    return (
      <span className={`text-xs font-semibold ${cls}`}>
        {b.text}
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
    // MON/PAT usam feed próprio; colunas só para satisfazer o tipo
    MON: [
      { h: 'Data', w: '9.5rem' }, { h: 'Moeda', w: '11rem' }, { h: 'Descrição', w: '1fr' }, { h: 'Ações', w: '5rem' },
    ],
    PAT: [
      { h: 'Moeda', w: '11rem' }, { h: 'Data', w: '8rem' }, { h: 'Sentimento', w: '7rem' }, { h: 'Estágio', w: '8rem' }, { h: 'Padrão', w: '1fr' }, { h: 'Ações', w: '4rem' },
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
      { h: th('Moeda', 'symbol'), w: '11rem' }, { h: th('Rank', 'marketCap'), w: '4rem' },
      { h: th('Curto Prazo', 'trendCurto'), w: '6.5rem' }, { h: th('Médio Prazo', 'trendMedio'), w: '6.5rem' }, { h: th('Longo Prazo', 'trendLongo'), w: '6.5rem' },
      { h: th('Mudança (Curto)', 'mudCurto'), w: '10.5rem' }, { h: th('Mudança (Médio)', 'mudMedio'), w: '10.5rem' }, { h: th('Mudança (Longo)', 'mudLongo'), w: '10.5rem' },
      { h: '', w: '5rem' },
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
    SR: [
      { h: 'Moeda', w: '11rem' }, { h: th('Preço atual', 'price'), w: '7rem' },
      { h: th('Suporte 1', 'srS1'), w: '7rem' }, { h: th('Suporte 2', 'srS2'), w: '7rem' }, { h: th('Suporte 3', 'srS3'), w: '7rem' },
      { h: th('Resistência 1', 'srR1'), w: '7rem' }, { h: th('Resistência 2', 'srR2'), w: '7rem' }, { h: th('Resistência 3', 'srR3'), w: '7rem' },
      { h: 'Fav', w: '4rem' },
    ],
  };
  const gridCols = cols[tab].map((c) => c.w).join(' ');

  const cellFav = (d: UniverseCoin) => {
    const isFav = favs.includes(d.symbol);
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => toggleFav(d.symbol)} title="Favoritar" className={`transition-colors duration-150 ease-out active:scale-[0.98] ${isFav ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}`}>
          <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => toggleWatch(d.symbol)} title="Watchlist" className="text-xs text-zinc-500 transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]">+W</button>
      </span>
    );
  };
  const cellAsset = (d: UniverseCoin) => (
    <span className="truncate"><Link to={`/monitor?symbol=${d.symbol}`} className="font-semibold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline">{d.symbol}</Link> <span className="text-xs text-[var(--text-muted)]">{d.name}</span></span>
  );
  const indActive = IND_TABS.includes(tab) || tab === 'RSI' || tab === 'SUPER' || tab === 'SMA' || tab === 'EMA' || tab === 'TREND';
  const indCount = tab === 'RSI' ? rsiSnaps.size : tab === 'SUPER' ? superSnaps.size : tab === 'SMA' || tab === 'EMA' ? maKlines.size : tab === 'TREND' ? trendWarm.size : snaps.size;
  const indNote = indActive && (
    <span className="text-xs normal-case tabular-nums text-zinc-500">
      {indProg ? ` calculando ${indProg.done}/${indProg.total}…` : ` top ${fetchN} por market cap · ${indCount} com indicadores`}
      {tab === 'RSI' && rsiPartial && !indProg && ' · Binance fora, via alternativas (lento)'}
      {tab === 'RSI' && !indProg && ' · OHLC real de exchange (paridade TV); "—" = indisponível'}
      {tab === 'SR' && !indProg && ' · base semanal (5 diários fechados = Monitor no 1d)'}
      {!indProg && indAt && ` · calculado ${dataAge(indAt)}`}
    </span>
  );
  const stochStatus = (v: number | null | undefined) => {
    if (v == null) return dash;
    if (v < 20) {
      return <span className="text-xs font-semibold text-red-400">Sobrevendido</span>;
    }
    if (v > 80) {
      return <span className="text-xs font-semibold text-emerald-400">Sobrecomprado</span>;
    }
    return <span className="text-xs font-semibold text-zinc-400">Neutro</span>;
  };
  const attPill = (a: { ratio: number; dir: 'up' | 'down' | 'flat'; unusual: boolean } | null) => {
    if (!a) return dash;
    if (!a.unusual) return <span className="text-xs font-semibold text-zinc-400">Normal</span>;
    const up = a.dir !== 'down';
    return (
      <span className={`text-xs font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '↑' : '↓'} {a.ratio.toFixed(1)}× média
      </span>
    );
  };
  const superDirPill = (dir: 'BULLISH' | 'BEARISH' | null) => {
    if (!dir) return dash;
    const up = dir === 'BULLISH';
    return (
      <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? 'Alta' : 'Baixa'}
      </span>
    );
  };
  const rsiCell = (v: number | null | undefined) => {    const b = rsiBand(v);
    if (!b || v == null) return dash;
    const color = b === 'low' ? 'text-red-400' : b === 'high' ? 'text-emerald-400' : 'text-zinc-400';
    return (
      <span className={`tabular-nums text-xs font-semibold ${color}`}>
        {v.toFixed(2)}
      </span>
    );
  };

  // Toda cripto com logo: CoinGecko (c.image) → CDN CoinCap → avatar-letra. Nunca some.
  const coinIcon = (c: UniverseCoin, size = 22) => (
    <CoinLogo symbol={c.symbol} image={c.image} size={size} />
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
      case 'PAT':
        // Feed próprio de padrões renderizado fora da grade virtualizada
        return null;
      case 'BTC': {
        const rel = (v: number | null | undefined, b: number | null | undefined) => (v == null || b == null ? null : v - b);
        return (<>
          <span className="tabular-nums text-xs text-zinc-500">{idx + 1}</span>
          {cellAsset(d)}
          <span className={`tabular-nums text-right text-sm ${toneUpDown(rel(d.change1h, btc.c1h))}`}>{rel(d.change1h, btc.c1h) != null ? fmtPct(rel(d.change1h, btc.c1h)) : '—'}</span>
          <span className={`tabular-nums text-right text-sm ${toneUpDown(rel(d.change24h, btc.c24))}`}>{rel(d.change24h, btc.c24) != null ? fmtPct(rel(d.change24h, btc.c24)) : '—'}</span>
          <span className={`tabular-nums text-right text-sm ${toneUpDown(rel(d.change7d, btc.c7d))}`}>{rel(d.change7d, btc.c7d) != null ? fmtPct(rel(d.change7d, btc.c7d)) : '—'}</span>
          <span className={`tabular-nums text-right text-sm ${toneUpDown(rel(d.change30d, btc.c30d))}`}>{rel(d.change30d, btc.c30d) != null ? fmtPct(rel(d.change30d, btc.c30d)) : '—'}</span>
          <span className={`tabular-nums text-right text-sm ${toneUpDown(d.change30d)}`}>{fmtPct(d.change30d)}</span>
          {cellFav(d)}
        </>);
      }
      case 'PERF':
        return (<>
          <span className="tabular-nums text-xs text-zinc-500">{rankMap.get(d.symbol) ?? idx + 1}</span>
          {cellAsset(d)}
          <span className="tabular-nums text-right text-sm text-zinc-200">{fmtPrice(d.price)}</span>
          <span>{pill(d.change1h)}</span><span>{pill(d.change24h)}</span><span>{pill(d.change7d)}</span>
          <span>{pill(d.change30d)}</span><span>{pill(d.change1y)}</span>
          {cellFav(d)}
        </>);
      case 'TREND': {
        // Warm (consenso, fonte única) com fallback cold instantâneo
        const t = trendFor(d);
        const isFav = favs.includes(d.symbol);
        const isWatch = watchlist.includes(d.symbol);
        return (<>
          <span className="flex min-w-0 items-center gap-1.5">
            <button onClick={() => toggleFav(d.symbol)} title={isFav ? 'Remover dos favoritos' : 'Favoritar'} className={`shrink-0 transition-colors duration-150 ease-out active:scale-[0.98] ${isFav ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}`}><Star size={14} fill={isFav ? 'currentColor' : 'none'} /></button>
            {coinIcon(d)}{cellAsset(d)}
          </span>
          <span className="tabular-nums text-right text-sm text-zinc-500">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span>{trendPill(t?.curto ?? null)}</span>
          <span>{trendPill(t?.medio ?? null)}</span>
          <span>{trendPill(t?.longo ?? null)}</span>
          <span>{shiftPill(t?.mudCurto ?? null)}</span>
          <span>{shiftPill(t?.mudMedio ?? null)}</span>
          <span>{shiftPill(t?.mudLongo ?? null)}</span>
          <span className="flex items-center gap-1.5">
            <button onClick={() => toggleWatch(d.symbol)} title={isWatch ? 'Remover do watchlist' : 'Observar'} className={`text-xs transition-colors duration-150 ease-out active:scale-[0.98] ${isWatch ? 'font-semibold text-cyan-300' : 'text-zinc-500 hover:text-zinc-200'}`}>+W</button>
            <Link to={`/monitor?symbol=${d.symbol}`} title="Abrir gráfico" className="p-1.5 text-zinc-500 transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"><BarChart3 size={14} /></Link>
          </span>
        </>);
      }
      case 'RSI': {
        const r = rsiSnaps.get(d.symbol);
        return (<>
          {cellAsset(d)}
          <span className="tabular-nums text-right text-sm text-zinc-500">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular-nums text-right text-sm text-zinc-200">{fmtPrice(d.price)}</span>
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
          <span className="tabular-nums text-right text-sm text-zinc-500">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular-nums text-right text-sm text-zinc-200">{s.k != null ? s.k.toFixed(2) : '—'}</span>
          <span className="tabular-nums text-right text-sm text-zinc-200">{s.d != null ? s.d.toFixed(2) : '—'}</span>
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
              <span key={`${t.k}-v`} className="tabular-nums text-right text-sm text-zinc-200">{p?.value != null ? fmtPrice(p.value) : '—'}</span>,
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
          <span className="tabular-nums text-right text-sm text-zinc-500">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular-nums text-right text-sm text-zinc-200">{fmtPrice(d.price)}</span>
          <span className={`tabular-nums text-right text-sm ${toneUpDown(a?.todayPct)}`}>{a ? fmtPct(a.todayPct) : '—'}</span>
          <span className="tabular-nums text-right text-sm text-zinc-400">{a ? fmtPct(a.avg10) : '—'}</span>
          <span className="tabular-nums text-right text-sm font-semibold text-zinc-200">{a ? `${a.ratio.toFixed(1)}×` : '—'}</span>
          <span>{attPill(a)}</span>
          <span className="tabular-nums text-right text-sm text-zinc-400">{d.volume24h ? fmtUSD(d.volume24h, 0) : '—'}</span>
          {cellFav(d)}
        </>);
      }
      case 'MACD': {
        const h = sn?.macdHist;
        return (<>
          <span className="tabular-nums text-xs text-zinc-500">{idx + 1}</span>
          {cellAsset(d)}
          <span className={`tabular-nums text-right text-sm ${toneUpDown(h)}`}>{h != null ? h.toFixed(4) : '—'}</span>
          <span>{h != null ? <span className={`text-xs font-semibold ${h > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{h > 0 ? 'Positivo' : 'Negativo'}</span> : dash}</span>
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
          <span className="tabular-nums text-right text-sm text-zinc-500">{rankMap.get(d.symbol) ?? idx + 1}</span>
          <span className="tabular-nums text-right text-sm text-zinc-200">{fmtPrice(d.price)}</span>
          <span>
            {b.upper == null ? dash : (
              <span className={`text-xs font-semibold ${aboveUpper ? 'text-emerald-400' : 'text-red-400'}`}>
                {aboveUpper ? 'Acima' : 'Abaixo'}
              </span>
            )}
          </span>
          <span>
            {b.lower == null ? dash : (
              <span className={`text-xs font-semibold ${belowLower ? 'text-red-400' : 'text-emerald-400'}`}>
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
          <span className="tabular-nums text-right text-sm text-zinc-200">{fmtPrice(d.price)}</span>
          {slowsFor(fast).map((s) => {
            const diff = maCrossDiff(set ?? null, kind, fast, s);
            return (
              <span key={s}>
                {diff == null ? dash : (
                  <span className={`text-xs font-semibold ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
        const pv = srPivots.get(d.symbol);
        const lvl = (v: number | null | undefined) => (
          <span className="tabular-nums text-right text-sm text-zinc-200">{v != null ? fmtPrice(v) : '—'}</span>
        );
        return (<>
          {cellAsset(d)}
          <span>
            <span className="tabular-nums text-right text-sm font-semibold text-[var(--text-primary)]">
              {d.price != null ? fmtPrice(d.price) : '—'}
            </span>
          </span>
          {lvl(pv?.s1)}
          {lvl(pv?.s2)}
          {lvl(pv?.s3)}
          {lvl(pv?.r1)}
          {lvl(pv?.r2)}
          {lvl(pv?.r3)}
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Indicadores</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMonMode('business')}
              title="O que já aconteceu e continua ativo"
              className={`inline-flex items-center gap-1.5 border-b px-2 py-1.5 text-xs font-semibold transition-colors duration-150 ease-out active:scale-[0.98] ${monMode === 'business' ? 'border-cyan-300 text-cyan-300' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
            >
              <Globe size={14} /> Business
            </button>
            <button
              onClick={() => setMonMode('realtime')}
              title="O que está acontecendo agora"
              className={`inline-flex items-center gap-1.5 border-b px-2 py-1.5 text-xs font-semibold transition-colors duration-150 ease-out active:scale-[0.98] ${monMode === 'realtime' ? 'border-cyan-300 text-cyan-300' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
            >
              <TrendingUp size={14} /> Realtime
            </button>
            <button
              onClick={() => setMonFavOnly((v) => !v)}
              title="Somente favoritas"
              className={`p-2 transition-colors duration-150 ease-out active:scale-[0.98] ${monFavOnly ? 'text-amber-300' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              <Star size={14} fill={monFavOnly ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setMonListOpen(true)}
              title={`Filtros (${activeMonFilters.length}/${allMonFilters.length})`}
              className="p-2 text-zinc-400 transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"
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
              className={`p-2 transition-colors duration-150 ease-out active:scale-[0.98] ${notifPerm === 'granted' ? 'text-cyan-300' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              <Bell size={14} fill={notifPerm === 'granted' ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => { setMonDraft(blankDraft()); setMonBuilderOpen(true); }}
              title="Visualizar e cadastrar alertas"
              className="p-2 text-zinc-500 transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"
            >
              <ListPlus size={14} />
            </button>
            <button
              onClick={() => setMonExpanded((v) => !v)}
              title={monExpanded ? 'Compactar' : 'Expandir'}
              className="p-2 text-zinc-500 transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => setMonRefresh((n) => n + 1)}
              title="Reavaliar agora"
              className="p-2 text-zinc-500 transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"
            >
              <RotateCw size={14} />
            </button>
          </div>
        </div>
      )}
      {tab === 'TREND' && (
        <div className="flex flex-wrap items-center gap-3 border-y border-[var(--border)] py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Indicadores</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Seg
              options={[{ k: '1h', label: '1 hora' }, { k: '4h', label: '4 horas' }, { k: '1d', label: '1 dia' }] as const}
              value={indTf}
              onChange={(v) => setIndTf(v)}
            />
            <select
              value={selCrypto}
              onChange={(e) => { const v = e.target.value; setSelCrypto(v); setQ(v); }}
              className="min-w-56 border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
              title="Filtra a tabela para a crypto escolhida"
            >
              <option value="">Selecione uma crypto</option>
              {jumpOpts.map((c) => <option key={c.id} value={c.symbol}>{c.name} {c.symbol}</option>)}
            </select>
            <button
              onClick={() => { if (selCrypto) toggleFav(selCrypto); }}
              disabled={!selCrypto}
              title={selCrypto ? (favs.includes(selCrypto) ? `Remover ${selCrypto} dos favoritos` : `Favoritar ${selCrypto}`) : 'Escolha uma crypto primeiro'}
              className={`p-2 transition-colors duration-150 ease-out active:scale-[0.98] ${!selCrypto ? 'opacity-40' : favs.includes(selCrypto) ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <Star size={14} fill={selCrypto && favs.includes(selCrypto) ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setTrendExpanded((v) => !v)}
              title={trendExpanded ? 'Compactar tabela' : 'Expandir tabela'}
              className="p-2 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
            >
              <Maximize2 size={14} />
            </button>
          </span>
        </div>
      )}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        <button onClick={() => tabsRef.current?.scrollBy({ left: -320 })} title="Rolar abas" className="shrink-0 p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"><ChevronLeft size={16} /></button>
        <div ref={tabsRef} className="flex flex-1 gap-x-5 gap-y-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => {
              setTab(t.k);
              if (t.k === 'SMA' || t.k === 'EMA') { setMaSearch(''); setMaModal(t.k); }
            }}
            className={t.k === tab ? '-mb-px shrink-0 border-b-2 border-[var(--brand)] pb-2 text-xs font-semibold text-[var(--brand)]' : 'shrink-0 pb-2 text-xs font-semibold text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'}
          >
            {t.label}
          </button>
        ))}
        </div>
        <button onClick={() => tabsRef.current?.scrollBy({ left: 320 })} title="Rolar abas" className="shrink-0 p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"><ChevronRight size={16} /></button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1" title="Quantas moedas por market cap entram em cada radar">
            <Seg
              options={[{ k: '100', label: 'Top 100' }, { k: '200', label: 'Top 200' }, { k: '300', label: 'Top 300' }, { k: 'all', label: 'Todas' }] as const}
              value={topN == null ? 'all' : String(topN) as '100' | '200' | '300' | 'all'}
              onChange={(v) => setTopN(v === 'all' ? null : Number(v))}
            />
          </span>
          {(tab === 'STOCH' || tab === 'BB' || tab === 'SMA' || tab === 'EMA') && (
            <span>
              <Seg
                options={[{ k: '1h', label: '1 hora' }, { k: '4h', label: '4 horas' }, { k: '1d', label: '1 dia' }] as const}
                value={indTf}
                onChange={(v) => setIndTf(v)}
              />
            </span>
          )}
        </div>

      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todo o universo…" className="min-w-52 border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]" />
        {tab !== 'MON' && (
          <>
            <label className="flex items-center gap-1"><input type="checkbox" checked={onlyActive} disabled={showAll} onChange={(e) => setOnlyActive(e.target.checked)} /> Somente ativas (vol &gt; 0)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={hideStables} disabled={showAll} onChange={(e) => setHideStables(e.target.checked)} /> Ocultar stablecoins</label>
            <label className="flex items-center gap-1 font-semibold text-[var(--text-primary)]"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Mostrar literalmente todas</label>
          </>
        )}
        <button onClick={u.reload} className="px-2 py-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]">Recarregar universo</button>
        {tab === 'PAT' && (
          <button
            onClick={() => setPatListOpen(true)}
            className={`px-2 py-1 font-semibold transition-colors duration-150 ease-out active:scale-[0.98] ${patPatterns.length || patSentiment !== 'Todas' ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Filtrar{(patPatterns.length || patSentiment !== 'Todas') ? ' • ativo' : ''}
          </button>
        )}
        {tab === 'RSI' && (
          <button
            onClick={() => {
              if (rsiFilter) setRsiDraft({ col: rsiFilter.col, op: rsiFilter.op, value: String(rsiFilter.value) });
              setRsiFilterOpen(true);
            }}
            className={`px-2 py-1 font-semibold transition-colors duration-150 ease-out active:scale-[0.98] ${rsiFilter ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Filtrar{rsiFilter ? ' • ativo' : ''}
          </button>
        )}
      </div>

      <MSection
        title={tab === 'MON' ? `Monitor — ${monFeed.length} alerta${monFeed.length === 1 ? '' : 's'}${monMode === 'realtime' ? ' (tempo real)' : ''}` : tab === 'PAT' ? `Padrões — ${patFeed.length} sinais` : `Crypto Radar — ${rows.length.toLocaleString('pt-BR')} após filtros`}
        right={
          <span className="text-xs normal-case tabular-nums text-zinc-500">
              {u.coins.length.toLocaleString('pt-BR')} moedas no universo
              {tab === 'MON' && topN != null && monUniverse.length > 0 && <span> · Top {topN}: {monUniverse.length} moedas</span>}
              {tab !== 'MON' && topN != null && mcapTopIds && <span> · Top {topN}: {mcapTopIds.size} moedas</span>}
              {!u.done && u.coins.length > 0 && <span> · carregando universo: {u.loaded.toLocaleString('pt-BR')}</span>}
              {u.done && u.fromCache && <span> · {cacheAge(u.cacheTs)}</span>}
              {u.rateLimited && <span> · rate limit — usando cache + backoff</span>}
              {indNote}
              {tab === 'MON' && realtimeSummary && monMode === 'realtime' && !indProg ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${realtimeSummary.live > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className={realtimeSummary.live === realtimeSummary.total ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                    {realtimeSummary.live > 0 ? `LIVE · ${realtimeSummary.live}/${realtimeSummary.total}` : `OFFLINE · ${realtimeSummary.live}/${realtimeSummary.total}`}
                  </span>
                  {realtimeSummary.stale > 0 && <span className="text-amber-400">{`· ${realtimeSummary.stale} STALE`}</span>}
                  {realtimeSummary.noRealtime > 0 && <span className="text-zinc-500">{`· ${realtimeSummary.noRealtime} NO REALTIME`}</span>}
                  <span>{`· último evento ${realtimeSummary.lastAge}`}</span>
                  {topN == null && <span className="text-zinc-500">· Realtime limitado a Top 300</span>}
                </span>
              ) : tab === 'MON' && (indProg ? <span>{` analisando ${indProg.done}/${indProg.total}…`}</span> : <span>{` · ${monData.size} moedas avaliadas`}{monSecs != null ? ` em ${monSecs}s` : ''}{indAt ? ` · calculado ${dataAge(indAt)}` : ''}{monDegraded > 0 ? <span title={monDegradedDetail ? `Dados incompletos por filtro — ${monDegradedDetail}. OHLC real indisponível (paridade TradingView); cache será usado quando possível.` : 'Algumas moedas sem OHLC real suficiente (paridade TradingView).'}>{` · ${monDegraded} com dados incompletos`}</span> : <span title="Todos os indicadores avaliados com dados suficientes">{` · dados completos`}</span>}{monPaused ? ` · pausado: ${monPaused}` : ''}</span>)}
            </span>
          }
        >
        {u.error && !u.coins.length && <ErrorBox message={u.error} onRetry={u.reload} />}
        {u.error && u.coins.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-300">
            <span>Atualização pausada ({u.error}) — exibindo cache de {cacheAge(u.cacheTs) || 'agora mesmo'}.</span>
            <button onClick={u.reload} className="underline transition-colors duration-150 ease-out hover:text-amber-200 active:scale-[0.98]">Tentar de novo</button>
          </div>
        )}
        {!rows.length ? (
          <MEmpty title="Nenhuma moeda encontrada" hint="Ajuste a busca ou desative os filtros." />
        ) : tab === 'MON' ? (
          <div className={`${monExpanded ? 'max-h-[85vh]' : 'max-h-[62vh]'} divide-y divide-[var(--border)] overflow-auto py-1`}>
            <div className="grid items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]" style={{ gridTemplateColumns: monMode === 'realtime' ? '9rem minmax(10rem,30%) 1fr 4.5rem' : 'minmax(11rem,32%) 1fr 4.5rem' }}>
              {monMode === 'realtime' && <span>Data</span>}<span>Moeda</span><span>Descrição</span><span className="text-right">Ações</span>
            </div>
            {(monFeed.length === 0 || (monPaused && monPaused.startsWith('Sem mercado realtime'))) ? (
              <MEmpty
                title={monPaused ?? (indProg ? `Analisando mercado ${indProg.done}/${indProg.total}…` : monMode === 'realtime' ? 'Nada acontecendo agora' : 'Nenhum alerta ativo')}
                hint={monPaused ? 'O Monitor retoma sozinho quando o universo carregar.' : 'Ative filtros no funil ou crie o seu próprio filtro.'}
              />
            ) : (
              monFeed.slice(0, 200).map((e) => (
                <div
                  key={`${e.filter.id}:${e.coin.symbol}`}
                  className="grid items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-white/[0.03]"
                  style={{ gridTemplateColumns: monMode === 'realtime' ? '9rem minmax(10rem,30%) 1fr 4.5rem' : 'minmax(11rem,32%) 1fr 4.5rem' }}
                >
                  {monMode === 'realtime' && (
                    <span className="tabular-nums text-xs text-zinc-500">
                      {e.seen ? fmtDT(e.seen) : '—'}
                      {e.seen > 0 && <span> · {relTime(e.seen)}</span>}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => toggleFav(e.coin.symbol)} title="Favoritar" className={`shrink-0 transition-colors duration-150 ease-out active:scale-[0.98] ${favs.includes(e.coin.symbol) ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}`}><Star size={14} fill={favs.includes(e.coin.symbol) ? 'currentColor' : 'none'} /></button>
                      {coinIcon(e.coin)}
                      <Link to={`/monitor?symbol=${e.coin.symbol}`} className="truncate font-semibold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline">{e.coin.name}</Link>
                    </span>
                    {monMode === 'realtime' && (() => {
                      const m = realtimeMeta.get(e.coin.symbol);
                      const price = m?.lastPrice ?? e.coin.price;
                      const fmt = price ? fmtPrice(price) : '—';
                      if (!m) return <span className="pl-6 text-[11px] tabular-nums text-zinc-500">{fmt}</span>;
                      if (m.state === 'NO_REALTIME') return <span className="pl-6 text-[11px] font-semibold tabular-nums text-zinc-500">{fmt} · <span className="rounded border border-zinc-600 px-1 py-px text-[10px]">NO REALTIME</span></span>;
                      const age = m.ageMs != null ? (m.ageMs < 1000 ? `${(m.ageMs/1000).toFixed(1)}s` : m.ageMs < 60000 ? `${(m.ageMs/1000).toFixed(1)}s` : `${Math.round(m.ageMs/1000)}s`) : '—';
                      const col = m.state === 'LIVE' ? 'text-emerald-400' : m.state === 'STALE' ? 'text-amber-400' : 'text-red-400';
                      const dot = m.state === 'LIVE' ? 'bg-emerald-400' : m.state === 'STALE' ? 'bg-amber-400' : 'bg-red-400';
                      return (
                        <span className="flex items-center gap-1 pl-6 text-[11px] tabular-nums">
                          <span className="text-zinc-300">{fmt}</span>
                          <span className={`inline-flex items-center gap-1 font-semibold ${col}`}>
                            <span className={`h-1 w-1 rounded-full ${dot} ${m.state==='LIVE'?'animate-pulse':''}`} />{m.state}
                          </span>
                          <span className="text-zinc-500">· {m.exchange ?? '—'} {m.pair ?? ''} · {age}</span>
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex min-w-0 items-center">
                    <span className="mr-2 inline-flex shrink-0 items-center justify-center text-[var(--text-muted)]">
                      {monIcon(e.filter.icon)}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate font-semibold text-[var(--text-primary)]">
                        {e.filter.name}
                        {e.fresh && monMode === 'realtime' && (
                          <span className="ml-1.5 rounded border border-[var(--brand)] px-1 py-px text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">novo</span>
                        )}
                      </strong>
                      {e.why && <span className="block truncate text-xs text-[var(--text-muted)]" title={e.why}>{e.why}</span>}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-2 text-zinc-500">
                    <Link to={`/monitor?symbol=${e.coin.symbol}`} title="Abrir gráfico" className="transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"><BarChart3 size={14} /></Link>
                    <span title={e.filter.description || e.filter.name} className="cursor-help transition-colors duration-150 ease-out hover:text-zinc-200"><Info size={14} /></span>
                  </span>
                </div>
              ))
            )}
            {monFeed.length > 200 && (
              <div className="py-1 text-center text-xs tabular-nums text-zinc-500">Mostrando 200 de {monFeed.length.toLocaleString('pt-BR')} — use a busca para refinar.</div>
            )}
          </div>
        ) : tab === 'PAT' ? (
          <div className="max-h-[62vh] divide-y divide-[var(--border)] overflow-auto py-1">
            <div className="grid items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]" style={{ gridTemplateColumns: '9rem minmax(10rem,26%) 7rem 8rem 1fr 4rem' }}>
              <button onClick={() => setPatSort((s) => ({ k: 'time', d: s.k === 'time' ? ((s.d * -1) as 1 | -1) : -1 }))} className="inline-flex items-center gap-1 text-left transition-colors duration-150 ease-out hover:text-zinc-300 active:scale-[0.98]">
                Data|Hora {patSort.k === 'time' ? (patSort.d === -1 ? '▼' : '▲') : <span className="text-zinc-600">⇅</span>}
              </button>
              <span>Moeda</span>
              <button onClick={() => setPatSort((s) => ({ k: 'sentiment', d: s.k === 'sentiment' ? ((s.d * -1) as 1 | -1) : -1 }))} className="inline-flex items-center gap-1 text-left transition-colors duration-150 ease-out hover:text-zinc-300 active:scale-[0.98]">
                Sentimento {patSort.k === 'sentiment' ? (patSort.d === -1 ? '▼' : '▲') : <span className="text-zinc-600">⇅</span>}
              </button>
              <button onClick={() => setPatSort((s) => ({ k: 'stage', d: s.k === 'stage' ? ((s.d * -1) as 1 | -1) : -1 }))} className="inline-flex items-center gap-1 text-left transition-colors duration-150 ease-out hover:text-zinc-300 active:scale-[0.98]">
                Estágio {patSort.k === 'stage' ? (patSort.d === -1 ? '▼' : '▲') : <span className="text-zinc-600">⇅</span>}
              </button>
              <button onClick={() => setPatSort((s) => ({ k: 'pattern', d: s.k === 'pattern' ? ((s.d * -1) as 1 | -1) : 1 }))} className="inline-flex items-center gap-1 text-left transition-colors duration-150 ease-out hover:text-zinc-300 active:scale-[0.98]">
                Padrão Gráfico {patSort.k === 'pattern' ? (patSort.d === -1 ? '▼' : '▲') : <span className="text-zinc-600">⇅</span>}
              </button>
              <span className="text-right">Análise</span>
            </div>
            {patFeed.length === 0 ? (
              <MEmpty
                title={indProg ? `Analisando mercado ${indProg.done}/${indProg.total}…` : 'Nenhum padrão no momento'}
                hint="Ajuste os filtros no funil ou aguarde novas formações."
              />
            ) : (
              patFeed.slice(0, 200).map((e) => {
                const tone = e.pat.sentiment === 'Bullish' ? 'text-emerald-400' : e.pat.sentiment === 'Bearish' ? 'text-red-400' : 'text-zinc-400';
                const stTone = e.pat.stage === 'Rompimento' ? 'text-red-400' : 'text-zinc-400';
                return (
                  <div
                    key={`${e.pat.pattern}:${e.coin.symbol}`}
                    className="grid items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
                    style={{ gridTemplateColumns: '9rem minmax(10rem,26%) 7rem 8rem 1fr 4rem' }}
                  >
                    <span className="tabular-nums text-xs text-[var(--text-muted)]">{e.seen ? fmtDT(e.seen) : '—'}</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <button onClick={() => toggleFav(e.coin.symbol)} title="Favoritar" className={`shrink-0 transition-colors duration-150 ease-out active:scale-[0.98] ${favs.includes(e.coin.symbol) ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><Star size={14} fill={favs.includes(e.coin.symbol) ? 'currentColor' : 'none'} /></button>
                      {coinIcon(e.coin)}
                      <Link to={`/monitor?symbol=${e.coin.symbol}`} className="truncate font-semibold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline">{e.coin.name}</Link>
                    </span>
                    <span>
                      <span className={`text-xs font-semibold ${tone}`}>
                        {e.pat.sentiment === 'Bullish' ? '▲ Bullish' : e.pat.sentiment === 'Bearish' ? '▼ Bearish' : '● Neutro'}
                      </span>
                    </span>
                    <span className={`text-xs font-semibold ${stTone}`}>{e.pat.stage}</span>
                    <span className="truncate font-semibold text-zinc-200" title={e.pat.detail}>{e.pat.pattern}</span>
                    <span className="flex items-center justify-end gap-2 text-zinc-500">
                      <Link to={`/monitor?symbol=${e.coin.symbol}`} title={e.pat.detail} className="transition-colors duration-150 ease-out hover:text-zinc-200 active:scale-[0.98]"><BarChart3 size={14} /></Link>
                    </span>
                  </div>
                );
              })
            )}
            {patFeed.length > 200 && (
              <div className="py-1 text-center text-xs tabular-nums text-zinc-500">Mostrando 200 de {patFeed.length.toLocaleString('pt-BR')} — use a busca para refinar.</div>
            )}
          </div>
        ) : (
          <>
            <div className="grid items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500" style={{ gridTemplateColumns: gridCols }}>
              {cols[tab].map((c, i) => <span key={i} className={tab === 'TREND' ? 'px-1' : undefined}>{c.h}</span>)}
            </div>
            <div
              ref={scrollRef}
              className={`${tab === 'TREND' && trendExpanded ? 'max-h-[85vh]' : 'max-h-[62vh]'} overflow-auto`}
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
                      className="grid items-center gap-1 border-t border-[var(--border)] px-2 text-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
                    >
                      {renderRow(d, v.index)}
                    </div>
                  );
                })}
              </div>
            </div>
            {tab !== 'RSI' && !IND_TABS.includes(tab) && rows.length > shown.length && (
              <div className="py-1 text-center text-xs tabular-nums text-[var(--text-muted)]">Mostrando {shown.length} de {rows.length.toLocaleString('pt-BR')} — use a busca para refinar.</div>
            )}
          </>
        )}
      </MSection>
      {rsiFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setRsiFilterOpen(false)}>
          <div className="w-full max-w-sm border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Filtros</h3>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Coluna</label>
            <select
              value={rsiDraft.col}
              onChange={(e) => setRsiDraft((d) => ({ ...d, col: e.target.value as RsiCol }))}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
            >
              {RSI_COLS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Operador</label>
            <select
              value={rsiDraft.op}
              onChange={(e) => setRsiDraft((d) => ({ ...d, op: e.target.value as RsiOp }))}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
            >
              {rsiOps.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
            </select>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Valor</label>
            <input
              value={rsiDraft.value}
              onChange={(e) => setRsiDraft((d) => ({ ...d, value: e.target.value }))}
              inputMode="decimal"
              placeholder="Ex.: 70"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setRsiFilter(null); setRsiFilterOpen(false); }}
                className="flex-1 border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
              >
                Limpar
              </button>
              <button
                onClick={() => {
                  const v = parseFloat(rsiDraft.value.replace(',', '.'));
                  if (!Number.isNaN(v)) setRsiFilter({ col: rsiDraft.col, op: rsiDraft.op, value: v });
                  setRsiFilterOpen(false);
                }}
                className="flex-1 bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white transition-opacity duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
      {maModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setMaModal(null)}>
          <div className="max-h-[80vh] w-full max-w-sm overflow-auto border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Selecione uma opção</h3>
              <button onClick={() => setMaModal(null)} className="p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]" title="Fechar"><X size={14} /></button>
            </div>
            <input
              value={maSearch}
              onChange={(e) => setMaSearch(e.target.value)}
              placeholder={maModal}
              className="mt-3 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]"
            />
            <div className="mt-2 divide-y divide-[var(--border)]">
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
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors duration-150 ease-out active:scale-[0.98] ${active ? 'font-semibold text-[var(--brand)]' : 'font-normal text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {o.label}
                      <span
                        className={`flex h-5 w-5 items-center justify-center border ${active ? 'border-[var(--bull)] bg-[var(--bull)] text-white' : 'border-[var(--border)] text-transparent'}`}
                      >
                        <Check size={12} />
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
      {monListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setMonListOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-auto border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Filtros do Monitor</h3>
              <button onClick={() => setMonListOpen(false)} className="p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]" title="Fechar"><X size={14} /></button>
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Prontos</div>
            <div className="mt-1 divide-y divide-[var(--border)]">
              {PRESET_FILTERS.map((f) => {
                const on = !monDisabled.includes(f.id);
                return (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggleMonFilter(f.id)} />
                    <span className="inline-flex h-6 w-6 items-center justify-center text-[var(--text-secondary)]">{monIcon(f.icon)}</span>
                    <span className="flex-1"><strong className="font-semibold text-[var(--text-primary)]">{f.name}</strong><span className="block text-xs text-[var(--text-muted)]">{f.description}</span></span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Meus filtros</div>
            <div className="mt-1 divide-y divide-[var(--border)]">
              {monFiltersCustom.length === 0 && <div className="text-xs text-[var(--text-muted)]">Nenhum ainda. Crie o seu abaixo.</div>}
              {monFiltersCustom.map((f) => {
                const on = !monDisabled.includes(f.id);
                const issues = monFilterIssues.get(f.id) ?? [];
                return (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <input type="checkbox" checked={on} onChange={() => toggleMonFilter(f.id)} title="Ativar" />
                    <span className="inline-flex h-6 w-6 items-center justify-center text-[var(--text-secondary)]">{monIcon(f.icon)}</span>
                    <span className="flex-1"><strong className="font-semibold text-[var(--text-primary)]">{f.name}</strong><span className="block text-xs text-[var(--text-muted)]">{f.conditions.length} condição(ões)</span>
                      {issues.length > 0 && (
                        <span className="mt-0.5 block text-xs font-semibold text-amber-300" title={issues.join(' · ')}>⚠ incompatível: {issues[0]}</span>
                      )}
                    </span>
                    <button
                      onClick={() => {
                        setMonDraft({ name: f.name, icon: f.icon, color: f.color, description: f.description ?? '', conditions: f.conditions.map((c) => ({ ...c })) });
                        setMonEditingId(f.id);
                        setMonBuilderError(null);
                        setMonListOpen(false);
                        setMonBuilderOpen(true);
                      }}
                      className="p-1 text-xs font-semibold text-[var(--brand)] transition-colors duration-150 ease-out hover:underline active:scale-[0.98]"
                      title="Editar filtro"
                    >
                      editar
                    </button>
                    <button onClick={() => removeMonFilter(f.id)} className="p-1 text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]" title="Excluir"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => { setMonDraft(blankDraft()); setMonEditingId(null); setMonBuilderError(null); setMonListOpen(false); setMonBuilderOpen(true); }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-[var(--brand)] transition-colors duration-150 ease-out hover:underline active:scale-[0.98]"
            >
              <Plus size={14} /> Novo filtro
            </button>
          </div>
        </div>
      )}
      {monBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setMonBuilderOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{monEditingId ? 'Editar filtro' : 'Novo filtro'}</h3>
              <button onClick={() => setMonBuilderOpen(false)} className="p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]" title="Fechar"><X size={14} /></button>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Nome</label>
            <input
              value={monDraft.name}
              onChange={(e) => setMonDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Ex.: Pullback em alta"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="relative">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Ícone</label>
                <button
                  type="button"
                  onClick={() => { setMonIconOpen((v) => !v); setMonColorOpen(false); }}
                  className="mt-1 flex w-full items-center gap-2 border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center text-[var(--text-secondary)]">{monIcon(monDraft.icon, 16)}</span>
                  <span className="flex-1 truncate text-left">{MON_ICONS.find((i) => i.k === monDraft.icon)?.label ?? monDraft.icon}</span>
                  <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" />
                </button>
                {monIconOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setMonIconOpen(false)} />
                    <div className="absolute inset-x-0 top-full z-[61] mt-1 max-h-56 overflow-auto border border-[var(--border)] bg-[var(--surface-1)] shadow-xl">
                      {MON_ICONS.map((i) => (
                        <button
                          key={i.k}
                          type="button"
                          onClick={() => { setMonDraft((d) => ({ ...d, icon: i.k })); setMonIconOpen(false); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] ${i.k === monDraft.icon ? 'text-[var(--brand)]' : 'text-[var(--text-primary)]'}`}
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center text-[var(--text-secondary)]">{monIcon(i.k, 16)}</span>
                          <span className="truncate">{i.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Cor</label>
                <button
                  type="button"
                  onClick={() => { setMonColorOpen((v) => !v); setMonIconOpen(false); }}
                  className="mt-1 flex w-full items-center gap-2 border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: MON_COLOR_HEX[monDraft.color] }} />
                  <span className="flex-1 truncate text-left">{MON_COLORS.find((c) => c.k === monDraft.color)?.label ?? monDraft.color}</span>
                  <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" />
                </button>
                {monColorOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setMonColorOpen(false)} />
                    <div className="absolute inset-x-0 top-full z-[61] mt-1 overflow-auto border border-[var(--border)] bg-[var(--surface-1)] shadow-xl">
                      {MON_COLORS.map((c) => (
                        <button
                          key={c.k}
                          type="button"
                          onClick={() => { setMonDraft((d) => ({ ...d, color: c.k })); setMonColorOpen(false); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] ${c.k === monDraft.color ? 'text-[var(--brand)]' : 'text-[var(--text-primary)]'}`}
                        >
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: MON_COLOR_HEX[c.k] }} />
                          <span className="truncate">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Descrição</label>
            <input
              value={monDraft.description}
              onChange={(e) => setMonDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="O que este filtro detecta"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]"
            />
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Condições (todas precisam passar)</div>
            <div className="mt-1 divide-y divide-[var(--border)]">
              {monDraft.conditions.map((c, i) => (
                <div key={i} className="py-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={c.indicator} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      const indicator = e.target.value as MonIndicator;
                      const prevTf = conditions[i].tf;
                      conditions[i] = {
                        indicator,
                        tf: MON_TF_BY_INDICATOR[indicator].includes(prevTf) ? prevTf : '1d',
                        field: MON_FIELDS[indicator][0].k, op: 'lte', value: 30,
                      };
                      return { ...d, conditions };
                    })} className="border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">
                      {MON_INDICATORS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <select value={c.tf} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      conditions[i] = { ...conditions[i], tf: e.target.value as MonTf };
                      return { ...d, conditions };
                    })} className="border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">
                      {MON_TFS.filter((o) => MON_TF_BY_INDICATOR[c.indicator].includes(o.k)).map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <select value={c.field} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      conditions[i] = { ...conditions[i], field: e.target.value };
                      return { ...d, conditions };
                    })} className="border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">
                      {MON_FIELDS[c.indicator].map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    {c.indicator === 'trend' && (
                      <div className="-mt-1 text-[11px] text-[var(--text-muted)]">Tendência só vale em 1h/4h/1d (semanal não tem consenso).</div>
                    )}
                    {(c.indicator === 'ma' || c.indicator === 'attention') && (
                      <div className="-mt-1 text-[11px] text-[var(--text-muted)]">Este indicador é sempre diário; o timeframe fica travado em 1d.</div>
                    )}
                    {MON_FIELDS[c.indicator].find((o) => o.k === c.field)?.hint && (
                      <div className="-mt-1 text-[11px] text-[var(--text-muted)]">{MON_FIELDS[c.indicator].find((o) => o.k === c.field)?.hint}</div>
                    )}
                    <select value={c.op} onChange={(e) => setMonDraft((d) => {
                      const conditions = [...d.conditions];
                      conditions[i] = { ...conditions[i], op: e.target.value as MonOp };
                      return { ...d, conditions };
                    })} className="border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">
                      {MON_OPS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {c.indicator === 'trend' ? (
                      <select value={c.value} onChange={(e) => setMonDraft((d) => {
                        const conditions = [...d.conditions];
                        conditions[i] = { ...conditions[i], value: Number(e.target.value) };
                        return { ...d, conditions };
                      })} className="flex-1 border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">
                        {TREND_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : c.indicator === 'super' ? (
                      <select value={c.value} onChange={(e) => setMonDraft((d) => {
                        const conditions = [...d.conditions];
                        conditions[i] = { ...conditions[i], value: Number(e.target.value) };
                        return { ...d, conditions };
                      })} className="flex-1 border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">
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
                        className="flex-1 border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                      />
                    )}
                    <button
                      onClick={() => setMonDraft((d) => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }))}
                      className="px-2 text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]"
                      title="Remover condição"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setMonDraft((d) => ({ ...d, conditions: [...d.conditions, { indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 }] }))}
              className="mt-2 flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--brand)] transition-colors duration-150 ease-out hover:underline active:scale-[0.98]"
            >
              <Plus size={14} /> Adicionar condição (E)
            </button>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setMonBuilderOpen(false)} className="flex-1 border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!monDraft.name.trim() || !monDraft.conditions.length) return;
                  const bad: string[] = [];
                  monDraft.conditions.forEach((c, i) => {
                    const reason = validateCondition(c);
                    if (reason) bad.push(`condição ${i + 1}: ${reason}`);
                  });
                  if (bad.length) {
                    setMonBuilderError(`Combinação inválida — ${bad[0]}. Ajuste antes de salvar.`);
                    return;
                  }
                  const data = { ...monDraft, name: monDraft.name.trim(), description: monDraft.description.trim() };
                  if (monEditingId) {
                    removeMonFilter(monEditingId);
                    addMonFilter({ ...data, id: monEditingId, preset: false });
                  } else {
                    addMonFilter({ id: `custom-${Date.now()}`, preset: false, ...data });
                  }
                  setMonEditingId(null);
                  setMonBuilderError(null);
                  setMonBuilderOpen(false);
                }}
                className="flex-1 bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white transition-opacity duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
              >
                Salvar filtro
              </button>
            </div>
            {monBuilderError && (
              <div className="mt-2 text-xs font-semibold text-amber-300">{monBuilderError}</div>
            )}
          </div>
        </div>
      )}
      {patListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setPatListOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-sm overflow-auto border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Filtros de padrões</h3>
              <button onClick={() => setPatListOpen(false)} className="p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]" title="Fechar"><X size={14} /></button>
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Sentimento</div>
            <div className="mt-1 inline-flex items-center divide-x divide-[var(--border)] border border-[var(--border)]">
              {(['Todas', 'Bullish', 'Neutro', 'Bearish'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPatSentiment(s)}
                  className={patSentiment === s ? 'px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] bg-[var(--surface-2)] transition-colors duration-150 ease-out active:scale-[0.98]' : 'px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] bg-[var(--surface-1)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Padrões (vazio = todos)</div>
            <div className="mt-1 divide-y divide-[var(--border)]">
              {[...new Set([...patMap.values()].flat().map((p) => p.pattern))].sort().map((name) => {
                const on = patPatterns.includes(name);
                const count = [...patMap.values()].flat().filter((p) => p.pattern === name).length;
                return (
                  <label key={name} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setPatPatterns((prev) => (on ? prev.filter((x) => x !== name) : [...prev, name]))}
                    />
                    <span className="flex-1 font-semibold text-[var(--text-primary)]">{name}</span>
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">{count}</span>
                  </label>
                );
              })}
              {patMap.size === 0 && <div className="text-xs text-[var(--text-muted)]">Abra a aba para carregar os padrões do top-100.</div>}
            </div>
            <button
              onClick={() => { setPatPatterns([]); setPatSentiment('Todas'); }}
              className="mt-3 w-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
            >
              Limpar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
