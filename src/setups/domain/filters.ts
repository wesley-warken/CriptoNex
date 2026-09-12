import { DEFAULT_HORIZON, type HorizonKey } from '@/engine/horizon/horizons';
import { all, qualityOf, SCORE_FLOOR, type Predicate, type Setup } from './entities';
import type { Liquidity, SetupKind } from './entities';

/**
 * domain/filters — funil mínimo, 100% puro e testado.
 * Uma linha (horizonte, busca, ordenação) + popover (presets, qualidade,
 * R:R, alinhamento, avançado). Estado sincronizado à URL via codec puro.
 */

export type SortKey = 'score' | 'rr' | 'conf';

export type QualityFilter = 'all' | 'forte' | 'elite';

export type MinRR = 0 | 2 | 2.5 | 3;

export interface FilterState {
  /** Horizonte move a análise (usa o mesmo reducer/URL, mas não conta no badge). */
  horizon: HorizonKey;
  query: string;
  sort: SortKey;
  quality: QualityFilter;
  minRR: MinRR;
  /** ON por padrão: só setups a favor do vento (regime favorável). */
  regimeAligned: boolean;
  setup: 'all' | SetupKind;
  liquidity: 'all' | Liquidity;
}

export const DEFAULT_FILTERS: FilterState = {
  horizon: DEFAULT_HORIZON,
  query: '',
  sort: 'score',
  quality: 'all',
  minRR: 0,
  regimeAligned: true,
  setup: 'all',
  liquidity: 'all',
};

/** Presets do popover (rótulos curtos, sem jargão). */
export type PresetKey = 'elite' | 'conservador' | 'agressivo';

export const PRESETS: Record<PresetKey, { label: string; hint: string; patch: Partial<FilterState> }> = {
  elite: {
    label: 'Só elite',
    hint: 'Score 80+, R:R 2+, alinhado ao regime',
    patch: { quality: 'elite', minRR: 2, regimeAligned: true },
  },
  conservador: {
    label: 'Conservador',
    hint: 'Score 70+, R:R 2.5+, alta liquidez, alinhado',
    patch: { quality: 'forte', minRR: 2.5, regimeAligned: true, liquidity: 'alta' },
  },
  agressivo: {
    label: 'Agressivo',
    hint: 'Piso 60, sem R:R mínimo, ignora o vento',
    patch: { quality: 'all', minRR: 0, regimeAligned: false },
  },
};

export function applyPreset(base: FilterState, key: PresetKey): FilterState {
  return { ...base, ...PRESETS[key].patch };
}

/* ---- predicados por dimensão (componíveis) ---- */

export function predQuality(q: QualityFilter): Predicate {
  if (q === 'elite') return (o) => qualityOf(o.score) === 'elite';
  if (q === 'forte') return (o) => qualityOf(o.score) !== 'base';
  return (o) => o.score >= SCORE_FLOOR;
}

export function predRR(min: MinRR): Predicate {
  if (min <= 0) return () => true;
  return (o) => (o.rr1 ?? -Infinity) >= min;
}

export function predRegimeAligned(on: boolean): Predicate {
  if (!on) return () => true;
  return (o) => o.regimeFit === 'favoravel';
}

export function predSetup(s: FilterState['setup']): Predicate {
  if (s === 'all') return () => true;
  return (o) => o.setup === s;
}

export function predLiquidity(l: FilterState['liquidity']): Predicate {
  if (l === 'all') return () => true;
  return (o) => o.liquidity === l;
}

export function predQuery(raw: string): Predicate {
  const needle = raw.trim().toLowerCase();
  if (!needle) return () => true;
  return (o) => o.symbol.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle);
}

/** Filtra (ordem estável fora daqui; ver sortSetups). */
export function filterSetups(items: Setup[], f: FilterState): Setup[] {
  const p = all(
    predQuality(f.quality),
    predRR(f.minRR),
    predRegimeAligned(f.regimeAligned),
    predSetup(f.setup),
    predLiquidity(f.liquidity),
    predQuery(f.query),
  );
  return items.filter(p);
}

export function sortSetups(items: Setup[], sort: SortKey): Setup[] {
  const arr = [...items];
  if (sort === 'rr') arr.sort((a, b) => (b.rr1 ?? -1) - (a.rr1 ?? -1) || b.score - a.score);
  else if (sort === 'conf') arr.sort((a, b) => b.confidence - a.confidence || b.score - a.score);
  else arr.sort((a, b) => b.score - a.score || b.confidence - a.confidence || (b.rr1 ?? -1) - (a.rr1 ?? -1));
  return arr;
}

export function filterAndRank(items: Setup[], f: FilterState): Setup[] {
  return sortSetups(filterSetups(items, f), f.sort);
}

/** Quantas dimensões saíram do padrão (badge do funil). */
export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.query.trim()) n++;
  if (f.quality !== 'all') n++;
  if (f.minRR !== 0) n++;
  if (!f.regimeAligned) n++;
  if (f.setup !== 'all') n++;
  if (f.liquidity !== 'all') n++;
  return n;
}

/* ---- contagens facetadas (cada dimensão conta contra as outras) ---- */

function without<K extends keyof FilterState>(f: FilterState, key: K): FilterState {
  return { ...f, [key]: DEFAULT_FILTERS[key] };
}

export interface FacetCounts {
  quality: Record<QualityFilter, number>;
  minRR: Record<MinRR, number>;
  setup: Record<FilterState['setup'], number>;
  liquidity: Record<FilterState['liquidity'], number>;
}

const RR_OPTIONS: MinRR[] = [0, 2, 2.5, 3];
const SETUP_OPTIONS: FilterState['setup'][] = [
  'all', 'trend-continuation', 'pullback', 'breakout', 'momentum', 'reversal', 'watch',
];
const LIQ_OPTIONS: FilterState['liquidity'][] = ['all', 'alta', 'media'];
const QUALITY_OPTIONS: QualityFilter[] = ['all', 'forte', 'elite'];

export function facetCounts(items: Setup[], f: FilterState): FacetCounts {
  const quality = {} as Record<QualityFilter, number>;
  for (const q of QUALITY_OPTIONS) {
    quality[q] = filterSetups(items, { ...without(f, 'quality'), quality: q }).length;
  }
  const minRR = {} as Record<MinRR, number>;
  for (const r of RR_OPTIONS) {
    minRR[r] = filterSetups(items, { ...without(f, 'minRR'), minRR: r }).length;
  }
  const setup = {} as Record<FilterState['setup'], number>;
  for (const s of SETUP_OPTIONS) {
    setup[s] = filterSetups(items, { ...without(f, 'setup'), setup: s }).length;
  }
  const liquidity = {} as Record<FilterState['liquidity'], number>;
  for (const l of LIQ_OPTIONS) {
    liquidity[l] = filterSetups(items, { ...without(f, 'liquidity'), liquidity: l }).length;
  }
  return { quality, minRR, setup, liquidity };
}

/* ---- codec URL (puro, tolerante a lixo) ---- */

const SORTS: SortKey[] = ['score', 'rr', 'conf'];
const QUALITIES: QualityFilter[] = ['all', 'forte', 'elite'];
const RRS: MinRR[] = [0, 2, 2.5, 3];
const SETUPS: FilterState['setup'][] = [...SETUP_OPTIONS];
const LIQS: FilterState['liquidity'][] = [...LIQ_OPTIONS];

function oneOf<T extends string | number>(v: string | null, list: readonly T[], fallback: T): T {
  if (v == null) return fallback;
  const num = Number(v);
  for (const o of list) {
    if (typeof o === 'number' ? num === o : o === v) return o;
  }
  return fallback;
}

/** Serializa só o que saiu do padrão (URL curta). */
export function encodeFilters(f: FilterState): string {
  const p = new URLSearchParams();
  if (f.horizon !== DEFAULT_HORIZON) p.set('h', f.horizon);
  if (f.query.trim()) p.set('q', f.query.trim());
  if (f.sort !== 'score') p.set('sort', f.sort);
  if (f.quality !== 'all') p.set('qual', f.quality);
  if (f.minRR !== 0) p.set('rr', String(f.minRR));
  if (!f.regimeAligned) p.set('align', '0');
  if (f.setup !== 'all') p.set('setup', f.setup);
  if (f.liquidity !== 'all') p.set('liq', f.liquidity);
  return p.toString();
}

const HORIZON_KEYS: HorizonKey[] = ['7d', '1m', '3m', '4m', '12m'];

export function decodeFilters(search: string): FilterState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    horizon: oneOf(p.get('h'), HORIZON_KEYS, DEFAULT_HORIZON),
    query: (p.get('q') ?? '').slice(0, 24),
    sort: oneOf(p.get('sort'), SORTS, 'score'),
    quality: oneOf(p.get('qual'), QUALITIES, 'all'),
    minRR: oneOf(p.get('rr'), RRS, 0),
    regimeAligned: p.get('align') !== '0',
    setup: oneOf(p.get('setup'), SETUPS, 'all'),
    liquidity: oneOf(p.get('liq'), LIQS, 'all'),
  };
}
