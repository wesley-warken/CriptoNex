/**
 * Tendência multi-timeframe (aba Tendência do Radar).
 *
 * Estados por período a partir da variação % — com limites escalados pela
 * volatilidade esperada (√t): um movimento "forte" em 1h é muito menor que
 * um "forte" em 30d. Cadeia padrão (1d): 1h → 24h (curto) → 7d (médio) →
 * 30d (longo); nos tempos 1h/4h as janelas seguem a mesma lógica fractal
 * (ver TREND_TF_CONFIG). Cada "Mudança" mostra de-onde-para-onde entre
 * elos adjacentes.
 */

export type TrendState = 'Alta Forte' | 'Alta' | 'Neutro' | 'Baixa' | 'Baixa Forte';

/** Nível numérico para ordenação (0 = mais baixista, 4 = mais altista). */
export const TREND_LEVEL: Record<TrendState, number> = {
  'Baixa Forte': 0,
  'Baixa': 1,
  'Neutro': 2,
  'Alta': 3,
  'Alta Forte': 4,
};

// Limites base no diário (%). Demais períodos: limite × √(dias).
const DAILY_NEUTRO = 1.5;
const DAILY_FORTE = 5;

export function classifyTrend(changePct: number | null | undefined, days: number): TrendState | null {
  if (changePct == null || Number.isNaN(changePct)) return null;
  const s = Math.sqrt(Math.max(days, 1 / 24));
  const neutro = DAILY_NEUTRO * s;
  const forte = DAILY_FORTE * s;
  const a = Math.abs(changePct);
  if (a < neutro) return 'Neutro';
  if (a < forte) return changePct > 0 ? 'Alta' : 'Baixa';
  return changePct > 0 ? 'Alta Forte' : 'Baixa Forte';
}

export interface TrendShift {
  from: TrendState;
  to: TrendState;
  /** >0 melhorou, <0 piorou, 0 manteve. */
  delta: number;
}

export interface CoinTrend {
  curto: TrendState | null;
  medio: TrendState | null;
  longo: TrendState | null;
  mudCurto: TrendShift | null;
  mudMedio: TrendShift | null;
  mudLongo: TrendShift | null;
}

export interface TrendInput {
  change1h?: number | null;
  change24h?: number | null;
  change7d?: number | null;
  change30d?: number | null;
}

const shift = (from: TrendState | null, to: TrendState | null): TrendShift | null =>
  from && to ? { from, to, delta: TREND_LEVEL[to] - TREND_LEVEL[from] } : null;

export function coinTrend(c: TrendInput): CoinTrend {
  return coinTrendFromLegs(
    [c.change1h ?? null, c.change24h ?? null, c.change7d ?? null, c.change30d ?? null],
    [1 / 24, 1, 7, 30],
  );
}

/** Núcleo genérico: 4 elos [A,B,C,D] com escala em dias cada → curto=B, médio=C, longo=D. */
export function coinTrendFromLegs(
  changes: [number | null, number | null, number | null, number | null],
  days: [number, number, number, number],
): CoinTrend {
  const [a, b, c, d] = changes.map((ch, i) => classifyTrend(ch, days[i]));
  return {
    curto: b,
    medio: c,
    longo: d,
    mudCurto: shift(a, b),
    mudMedio: shift(b, c),
    mudLongo: shift(c, d),
  };
}

/** Variação % nos últimos `lookback` candles (ex.: 24 closes horários = 24h). */
export function legChange(closes: number[], lookback: number): number | null {
  if (!closes || closes.length < lookback + 1) return null;
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - lookback];
  if (!prev) return null;
  return (last / prev - 1) * 100;
}

export type TrendTf = '1h' | '4h';

/**
 * Config por tempo gráfico: janelas em nº de candles + escala em dias.
 * 1h: curto=4h, médio=24h, longo=7d · 4h: curto=24h, médio=7d, longo=30d.
 */
export const TREND_TF_CONFIG: Record<TrendTf, { lookbacks: [number, number, number, number]; scales: [number, number, number, number]; minCandles: number; klinesLimit: number }> = {
  '1h': { lookbacks: [1, 4, 24, 168], scales: [1 / 24, 1 / 6, 1, 7], minCandles: 175, klinesLimit: 200 },
  '4h': { lookbacks: [1, 6, 42, 180], scales: [1 / 6, 1, 7, 30], minCandles: 185, klinesLimit: 200 },
};

/** Tendência a partir dos closes do tempo gráfico (ex.: klines 1h/4h). */
export function coinTrendFromCloses(closes: number[], tf: TrendTf): CoinTrend | null {
  const cfg = TREND_TF_CONFIG[tf];
  if (!closes || closes.length < cfg.minCandles) return null;
  return coinTrendFromLegs(
    [legChange(closes, cfg.lookbacks[0]), legChange(closes, cfg.lookbacks[1]), legChange(closes, cfg.lookbacks[2]), legChange(closes, cfg.lookbacks[3])],
    cfg.scales,
  );
}

/**
 * Tendência intradiária INSTANTÂNEA a partir do sparkline horário (168 closes)
 * + variações do universo. Sem nenhum fetch: 1h usa elos 1h→4h→24h→7d,
 * 4h usa 4h→24h→7d→30d. Retorna null parcial quando faltam dados.
 */
export function coinTrendIntraday(
  hourly: number[] | undefined,
  longer: { d: number | null | undefined; w: number | null | undefined; m: number | null | undefined },
  tf: '1h' | '4h',
): CoinTrend | null {
  const clean = (hourly ?? []).filter((v) => v > 0);
  const d = longer.d ?? null;
  const w = longer.w ?? null;
  const m = longer.m ?? null;
  if (tf === '1h') {
    if (clean.length < 25) return null;
    return coinTrendFromLegs([legChange(clean, 1), legChange(clean, 4), d, w], [1 / 24, 1 / 6, 1, 7]);
  }
  if (clean.length < 5) return null;
  return coinTrendFromLegs([legChange(clean, 4), d, w, m], [1 / 6, 1, 7, 30]);
}

/** "Alta Forte" → "Alta forte" (padrão das pílulas de mudança). */
export function shiftLabel(s: TrendState): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
