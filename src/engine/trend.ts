/**
 * Tendência por CONSENSO DE INDICADORES (não por variação %).
 *
 * Cada perna avalia um TIMEFRAME distinto da mesma moeda (ex.: 1d → curto=4h,
 * médio=diário, longo=semanal) — evidência ao vivo mostrou que janelas da
 * mesma série quase não diferenciam pernas, enquanto pernas multi-TF sim.
 * "Mudança" é temporal: estado da série cortada em 1 candle → estado atual
 * (ex.: "Neutro para Alta" mesmo sem Neutro visível na linha).
 *
 * O legado `coinTrend`/`classifyTrend` (% com escala √t) segue existindo só
 * como cold-start instantâneo (campos do universo, sem klines).
 */

import { calcEMA, calcMACD, calcRSI, calcSMA, calcStoch } from '@/engine/indicators';
import type { Candle } from '@/types';

export type TrendState = 'Alta Forte' | 'Alta' | 'Neutro' | 'Baixa' | 'Baixa Forte';

/** Nível numérico para ordenação (0 = mais baixista, 4 = mais altista). */
export const TREND_LEVEL: Record<TrendState, number> = {
  'Baixa Forte': 0,
  'Baixa': 1,
  'Neutro': 2,
  'Alta': 3,
  'Alta Forte': 4,
};

// Limites do legado cold-start: base no diário (%), demais períodos × √(dias).
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

/** Legado cold-start instantâneo (variação % dos campos do universo). */
export function coinTrend(c: TrendInput): CoinTrend {
  const h = classifyTrend(c.change1h, 1 / 24);
  const d = classifyTrend(c.change24h, 1);
  const w = classifyTrend(c.change7d, 7);
  const m = classifyTrend(c.change30d, 30);
  return {
    curto: d,
    medio: w,
    longo: m,
    mudCurto: shift(h, d),
    mudMedio: shift(d, w),
    mudLongo: shift(w, m),
  };
}

export type TrendTf = '1h' | '4h';

function lastNum(arr: (number | undefined)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== undefined && v !== null && !Number.isNaN(v)) return v;
  }
  return null;
}

function toCandles(closes: number[], highs: number[], lows: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: i,
    open: i ? closes[i - 1] : c,
    high: highs[i] ?? c,
    low: lows[i] ?? c,
    close: c,
    volume: 0,
  }));
}

/**
 * Consenso de 5 votos (receita da referência, implementada fielmente):
 * 1. RSI(14): ≥60 → +1, ≤40 → -1 (entre 41–59 abstém)
 * 2. MACD(12,26,9): histograma >0 → +1, <0 → -1 (guarda 1e-4: abaixo disso é
 *    poeira de float/ruído, não sinal — sem ela, stablecoin travada forjaria voto)
 * 3. SMA(50): preço > SMA×1.01 → +1, < SMA×0.99 → -1
 * 4. EMA(20): preço > EMA×1.005 → +1, < EMA×0.995 → -1
 * 5. Estocástico(14,3): %K > %D → +1, %K < %D → -1 (precisa de high/low; sem range abstém)
 * Score = soma; classificação: ≥+3 Alta Forte, +1/+2 Alta, 0 Neutro,
 * -1/-2 Baixa, ≤-3 Baixa Forte. Sem consenso (<2 eleitores) → Neutro
 * (a referência nunca deixa pílula vazia; só input vazio retorna null).
 */
export function consensusOf(closes: number[], highs: number[], lows: number[]): TrendState | null {
  return scoreOf(closes, highs, lows).state;
}

/** Votos por indicador (auditoria de "por que este rótulo"). */
export function voteBreakdown(closes: number[], highs: number[], lows: number[]): Record<string, number> {
  const clean = closes.filter((v) => v > 0);
  const n = clean.length;
  const out: Record<string, number> = {};
  if (!n) return out;
  const last = clean[n - 1];
  const rel = Math.abs(last) || 1;
  const kl = toCandles(clean, highs, lows);
  const hasRange = highs.length === closes.length && lows.length === closes.length;
  if (n >= 15) {
    const rsi = calcRSI(kl);
    if (rsi != null) {
      if (rsi >= 60) out.rsi = 1;
      else if (rsi <= 40) out.rsi = -1;
    }
  }
  if (n >= 35) {
    const hist = calcMACD(kl).hist;
    if (hist != null && Math.abs(hist) / rel >= 1e-4) out.macd = hist > 0 ? 1 : -1;
  }
  if (n >= 50) {
    const s50 = lastNum(calcSMA(clean, 50));
    if (s50 != null && s50 !== 0) {
      if (last > s50 * 1.01) out.sma50 = 1;
      else if (last < s50 * 0.99) out.sma50 = -1;
    }
  }
  if (n >= 21) {
    const e20 = lastNum(calcEMA(clean, 20));
    if (e20 != null && e20 !== 0) {
      if (last > e20 * 1.005) out.ema20 = 1;
      else if (last < e20 * 0.995) out.ema20 = -1;
    }
  }
  if (hasRange && n >= 15) {
    const s = calcStoch(kl);
    if (s.k != null && s.d != null && !Number.isNaN(s.k) && !Number.isNaN(s.d) && s.k !== s.d) {
      out.stoch = s.k > s.d ? 1 : -1;
    }
  }
  return out;
}

function scoreOf(closes: number[], highs: number[], lows: number[]): { state: TrendState | null; score: number; voters: number } {
  const votes = Object.values(voteBreakdown(closes, highs, lows));
  if (!closes.filter((v) => v > 0).length) return { state: null, score: 0, voters: 0 };
  if (votes.length < 2) return { state: 'Neutro', score: 0, voters: votes.length };
  const score = votes.reduce((a, b) => a + b, 0);
  if (score >= 3) return { state: 'Alta Forte', score, voters: votes.length };
  if (score >= 1) return { state: 'Alta', score, voters: votes.length };
  if (score === 0) return { state: 'Neutro', score, voters: votes.length };
  if (score >= -2) return { state: 'Baixa', score, voters: votes.length };
  return { state: 'Baixa Forte', score, voters: votes.length };
}

/** Pernas em TIMEFRAMES diferentes (evidência: janelas da mesma série quase
 * não diferenciam pernas, pois quase todos os eleitores leem o último valor;
 * pernas multi-TF diferenciam de verdade — verificado ao vivo no BTC:
 * janelas 30/90/200 deram Forte/Alta/Alta, multi-TF 4h/1d/1s deu Baixa/Alta/Neutro).
 * Constante calibrável: modo → [{tf, window} × curto/médio/longo].
 */
export interface TrendOhlc {
  closes: number[];
  highs: number[];
  lows: number[];
}

export const TREND_MODE_LEGS: Record<'1d' | '1h' | '4h', { tf: '1h' | '4h' | '1d' | '1w'; window: number }[]> = {
  '1d': [
    { tf: '4h', window: 60 },
    { tf: '1d', window: 120 },
    { tf: '1w', window: 90 },
  ],
  '4h': [
    { tf: '1h', window: 60 },
    { tf: '4h', window: 120 },
    { tf: '1d', window: 120 },
  ],
  '1h': [
    { tf: '1h', window: 30 },
    { tf: '4h', window: 60 },
    { tf: '1d', window: 120 },
  ],
};

export function consensusWindow(o: TrendOhlc, window: number): TrendState | null {
  return consensusOf(o.closes.slice(-window), o.highs.slice(-window), o.lows.slice(-window));
}

/**
 * Tendência completa multi-TF com mudança TEMPORAL: recalcula cada perna
 * na série cortada em 1 candle (estado anterior) vs série cheia (atual).
 * "Mantém X" = nada mudou desde o candle anterior (não igualdade entre pernas).
 */
export function coinTrendMultiTF(
  data: Record<'1h' | '4h' | '1d' | '1w', TrendOhlc | null>,
  mode: '1d' | '1h' | '4h',
): CoinTrend | null {
  const [s, m, l] = TREND_MODE_LEGS[mode];
  const ds = data[s.tf];
  const dm = data[m.tf];
  const dl = data[l.tf];
  if (!ds || !dm || !dl) return null;
  const now = {
    curto: consensusWindow(ds, s.window),
    medio: consensusWindow(dm, m.window),
    longo: consensusWindow(dl, l.window),
  };
  if (now.curto == null && now.medio == null && now.longo == null) return null;
  const cut = (o: TrendOhlc): TrendOhlc => ({
    closes: o.closes.slice(0, -1),
    highs: o.highs.slice(0, -1),
    lows: o.lows.slice(0, -1),
  });
  const ps = cut(ds);
  const pm = cut(dm);
  const pl = cut(dl);
  const prev = {
    curto: consensusWindow(ps, s.window),
    medio: consensusWindow(pm, m.window),
    longo: consensusWindow(pl, l.window),
  };
  return {
    curto: now.curto,
    medio: now.medio,
    longo: now.longo,
    mudCurto: shift(prev.curto, now.curto),
    mudMedio: shift(prev.medio, now.medio),
    mudLongo: shift(prev.longo, now.longo),
  };
}

/** "Alta Forte" → "Alta forte" (padrão das pílulas de mudança). */
export function shiftLabel(s: TrendState): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
