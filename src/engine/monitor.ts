/**
 * Monitor (Radar): feed de eventos a partir de filtros de indicadores.
 *
 * - Filtros prontos + personalizados (indicador + tempo + campo + operador + valor, junção AND).
 * - Realtime: o que começou a acontecer agora (transição detectada, com hora).
 * - Business: tudo que já aconteceu e continua ativo.
 */

import type { Candle } from '@/types';
import type { UniverseCoin } from '@/services/universeTypes';
import { coinTrend, coinTrendMultiTF, TREND_LEVEL, type CoinTrend, type TrendOhlc } from '@/engine/trend';
import { calcMACD, calcStoch, calcSupertrendFull, rsiWithAvg } from '@/engine/indicators';
import { computeMaSet, type MaSet } from '@/services/maTable';
import { unusualMove } from '@/engine/attention';

export type MonTf = '1h' | '4h' | '1d' | '1w';
export type MonIndicator = 'trend' | 'rsi' | 'stoch' | 'macd' | 'super' | 'attention' | 'ma';
export type MonOp = 'gte' | 'lte' | 'gt' | 'lt' | 'eq';
export type MonColor = 'green' | 'red' | 'yellow' | 'blue';

export interface MonCondition {
  indicator: MonIndicator;
  tf: MonTf;
  field: string;
  op: MonOp;
  value: number;
}

export interface MonFilter {
  id: string;
  name: string;
  icon: string;
  color: MonColor;
  description?: string;
  conditions: MonCondition[];
  preset?: boolean;
}

export const MON_OPS: { k: MonOp; label: string }[] = [
  { k: 'gte', label: 'Maior ou igual (≥)' },
  { k: 'lte', label: 'Menor ou igual (≤)' },
  { k: 'gt', label: 'Maior que (>)' },
  { k: 'lt', label: 'Menor que (<)' },
  { k: 'eq', label: 'Igual (=)' },
];

export const MON_TFS: { k: MonTf; label: string }[] = [
  { k: '1h', label: '1 hora' },
  { k: '4h', label: '4 horas' },
  { k: '1d', label: 'Diário' },
  { k: '1w', label: 'Semanal' },
];

export const MON_INDICATORS: { k: MonIndicator; label: string }[] = [
  { k: 'trend', label: 'Tendência' },
  { k: 'rsi', label: 'RSI' },
  { k: 'stoch', label: 'Estocástico' },
  { k: 'macd', label: 'MACD' },
  { k: 'super', label: 'Supertrend' },
  { k: 'attention', label: 'Volume de Atenção' },
  { k: 'ma', label: 'Médias (diário)' },
];

export const MON_FIELDS: Record<MonIndicator, { k: string; label: string }[]> = {
  trend: [
    { k: 'curto', label: 'Curto prazo' },
    { k: 'medio', label: 'Médio prazo' },
    { k: 'longo', label: 'Longo prazo' },
  ],
  rsi: [{ k: 'value', label: 'Valor' }],
  stoch: [
    { k: 'k', label: 'Rápido %K' },
    { k: 'd', label: 'Lento %D' },
  ],
  macd: [{ k: 'hist', label: 'Histograma' }],
  super: [{ k: 'dir', label: 'Direção' }],
  attention: [
    { k: 'ratio', label: '× Média' },
    { k: 'today', label: 'Hoje %' },
  ],
  ma: [
    { k: 'ema9_26', label: 'EMA9 − EMA26' },
    { k: 'sma50_200', label: 'SMA50 − SMA200' },
  ],
};

/** Níveis da tendência para o construtor de filtros. */
export const TREND_LEVEL_OPTIONS = [
  { label: 'Alta Forte', value: 4 },
  { label: 'Alta', value: 3 },
  { label: 'Neutro', value: 2 },
  { label: 'Baixa', value: 1 },
  { label: 'Baixa Forte', value: 0 },
];

export const MON_ICONS: { k: string; label: string }[] = [
  { k: 'trend-up', label: 'Tendência de alta' },
  { k: 'trend-down', label: 'Tendência de baixa' },
  { k: 'alert', label: 'Alerta' },
  { k: 'flame', label: 'Chama' },
  { k: 'check', label: 'Confirmação' },
  { k: 'gem', label: 'Gema' },
  { k: 'zap', label: 'Raio' },
  { k: 'siren', label: 'Sirene' },
  { k: 'up-right', label: 'Seta alta' },
  { k: 'eye', label: 'Olho' },
  { k: 'star', label: 'Estrela' },
];
export const MON_COLORS: { k: MonColor; label: string }[] = [
  { k: 'green', label: 'Verde (alta)' },
  { k: 'red', label: 'Vermelho (baixa)' },
  { k: 'yellow', label: 'Amarelo (atenção)' },
  { k: 'blue', label: 'Azul (info)' },
];

export interface MonData {
  symbol: string;
  trend: Record<'1h' | '4h' | '1d', CoinTrend | null>;
  rsi: Record<MonTf, number | null>;
  stochK: Record<MonTf, number | null>;
  stochD: Record<MonTf, number | null>;
  macd: Record<MonTf, number | null>;
  super: Record<MonTf, 'BULLISH' | 'BEARISH' | null>;
  attRatio: number | null;
  attToday: number | null;
  ma: MaSet | null;
}

const num = (v: number | null | undefined): number | null => (v == null || Number.isNaN(v) ? null : v);
const safe = <T>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/** Monta todos os valores avaliáveis de uma moeda a partir dos klines por tempo. */
export function buildMonData(coin: UniverseCoin, kl: Record<MonTf, Candle[] | null>): MonData {
  const get = (tf: MonTf): Candle[] => kl[tf] ?? [];
  const closesOf = (tf: MonTf): number[] => get(tf).map((k) => k.close);
  const rsi: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const stochK: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const stochD: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const macd: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const sup: Record<MonTf, 'BULLISH' | 'BEARISH' | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  (Object.keys(rsi) as MonTf[]).forEach((tf) => {
    const k = get(tf);
    if (k.length >= 30) rsi[tf] = num(safe(() => rsiWithAvg(k).rsi));
    if (k.length >= 15) {
      const s = safe(() => calcStoch(k));
      stochK[tf] = num(s?.k ?? null);
      stochD[tf] = num(s?.d ?? null);
    }
    if (k.length >= 35) macd[tf] = num(safe(() => calcMACD(k).hist));
    if (k.length >= 15) sup[tf] = safe(() => calcSupertrendFull(k))?.dir ?? null;
  });
  const c1d = closesOf('1d');
  const att = c1d.length >= 12 ? safe(() => unusualMove(c1d)) : null;
  // Tendência por consenso na MESMA série de cada tempo (fonte única por perna).
  // 1d sem klines: cold-start % dos campos do universo; com klines: consenso.
  // Tendência multi-TF: cada perna no seu timeframe (1d → 4h/diário/semanal).
  // 1d sem klines: cold-start % dos campos do universo.
  const ohlcOf = (kl: Candle[] | null): TrendOhlc | null =>
    kl && kl.length >= 15
      ? { closes: kl.map((k) => k.close), highs: kl.map((k) => k.high), lows: kl.map((k) => k.low) }
      : null;
  const k1d = get('1d');
  const k1h = get('1h');
  const k4h = get('4h');
  const k1w = get('1w');
  const rec = {
    '1h': ohlcOf(k1h.length ? k1h : null),
    '4h': ohlcOf(k4h.length ? k4h : null),
    '1d': ohlcOf(k1d.length ? k1d : null),
    '1w': ohlcOf(k1w.length ? k1w : null),
  };
  return {
    symbol: coin.symbol,
    trend: {
      '1d': safe(() => coinTrendMultiTF(rec, '1d')) ?? safe(() => coinTrend(coin)),
      '4h': safe(() => coinTrendMultiTF(rec, '4h')),
      '1h': safe(() => coinTrendMultiTF(rec, '1h')),
    },
    rsi, stochK, stochD, macd, super: sup,
    attRatio: att?.ratio ?? null,
    attToday: att?.todayPct ?? null,
    ma: c1d.length >= 210 ? safe(() => computeMaSet(c1d)) : null,
  };
}

/** Resolve o valor numérico de uma condição (null = sem dados). */
export function resolveValue(d: MonData, c: MonCondition): number | null {
  switch (c.indicator) {
    case 'trend': {
      if (c.tf !== '1h' && c.tf !== '4h' && c.tf !== '1d') return null;
      const s = d.trend[c.tf]?.[c.field as 'curto' | 'medio' | 'longo'] ?? null;
      return s == null ? null : TREND_LEVEL[s];
    }
    case 'rsi':
      return d.rsi[c.tf];
    case 'stoch':
      return c.field === 'd' ? d.stochD[c.tf] : d.stochK[c.tf];
    case 'macd':
      return d.macd[c.tf];
    case 'super': {
      const s = d.super[c.tf];
      return s == null ? null : s === 'BULLISH' ? 1 : 0;
    }
    case 'attention':
      return c.field === 'today' ? d.attToday : d.attRatio;
    case 'ma': {
      if (!d.ma) return null;
      if (c.field === 'sma50_200') {
        const a = d.ma.sma[50];
        const b = d.ma.sma[200];
        return a != null && b != null ? a - b : null;
      }
      const a = d.ma.ema[9];
      const b = d.ma.ema[26];
      return a != null && b != null ? a - b : null;
    }
    default:
      return null;
  }
}

export function evalCondition(d: MonData, c: MonCondition): boolean {
  const v = resolveValue(d, c);
  if (v == null) return false;
  switch (c.op) {
    case 'gte': return v >= c.value;
    case 'lte': return v <= c.value;
    case 'gt': return v > c.value;
    case 'lt': return v < c.value;
    case 'eq': return Math.abs(v - c.value) < 1e-9;
  }
}

/** Filtro casa quando tem ≥1 condição e TODAS passam (AND). */
export function evalFilter(d: MonData, f: MonFilter): boolean {
  return f.conditions.length > 0 && f.conditions.every((c) => evalCondition(d, c));
}

export interface MonMatch {
  symbol: string;
  filterId: string;
}

export function evalMonitor(data: MonData[], filters: MonFilter[]): MonMatch[] {
  const out: MonMatch[] = [];
  for (const d of data) {
    for (const f of filters) {
      if (evalFilter(d, f)) out.push({ symbol: d.symbol, filterId: f.id });
    }
  }
  return out;
}

/** O que precisa ser buscado na rede para avaliar estes filtros (resto vem do universo/spark). */
export interface MonDataPlan {
  /** 'ma': diário 250 (médias) · 'kl': diário ~120 (indicadores) · 'none': nada */
  daily: 'ma' | 'kl' | 'none';
  weekly: boolean;
}

export function planMonitorData(filters: MonFilter[]): MonDataPlan {
  let needMA = false;
  let needDaily = false;
  let needW = false;
  for (const f of filters) {
    for (const c of f.conditions) {
      // Tendência nunca precisa de rede (1d: campos do universo · 1h/4h: sparkline)
      if (c.indicator === 'trend') continue;
      if (c.indicator === 'ma') needMA = true;
      else if (c.indicator === 'attention') needDaily = true;
      else if (c.tf === '1w') needW = true;
      else if (c.tf === '1d') needDaily = true;
      // 1h/4h (rsi/stoch/macd/super): sparkline do universo — zero fetch
    }
  }
  return { daily: needMA ? 'ma' : needDaily ? 'kl' : 'none', weekly: needW };
}

// ---- Filtros prontos ----
const F = (
  id: string, name: string, icon: string, color: MonColor, description: string,
  conditions: MonCondition[],
): MonFilter => ({ id, name, icon, color, description, conditions, preset: true });

export const PRESET_FILTERS: MonFilter[] = [
  F('pullback-alta', 'Pullback em Alta', 'trend-up', 'green', 'Tendência de alta com RSI 4h sobrevendido: possível entrada no pullback.',
    [
      { indicator: 'trend', tf: '1d', field: 'curto', op: 'gte', value: 3 },
      { indicator: 'rsi', tf: '4h', field: 'value', op: 'lte', value: 30 },
    ]),
  F('sobrevenda-diaria', 'Sobrevenda Diária', 'alert', 'yellow', 'RSI diário abaixo de 30.',
    [{ indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 }]),
  F('sobrecompra', 'Sobrecompra', 'flame', 'red', 'RSI diário acima de 70.',
    [{ indicator: 'rsi', tf: '1d', field: 'value', op: 'gte', value: 70 }]),
  F('golden-cross', 'Golden Cross', 'check', 'green', 'EMA 9 acima da EMA 26 no diário.',
    [{ indicator: 'ma', tf: '1d', field: 'ema9_26', op: 'gt', value: 0 }]),
  F('death-cross', 'Death Cross', 'trend-down', 'red', 'EMA 9 abaixo da EMA 26 no diário.',
    [{ indicator: 'ma', tf: '1d', field: 'ema9_26', op: 'lt', value: 0 }]),
  F('alt-momentum', 'AltMomentum', 'gem', 'green', 'Movimento atípico de alta: ≥2× a média de 10 dias.',
    [
      { indicator: 'attention', tf: '1d', field: 'ratio', op: 'gte', value: 2 },
      { indicator: 'attention', tf: '1d', field: 'today', op: 'gt', value: 0 },
    ]),
  F('washout', 'Washout', 'zap', 'yellow', 'RSI diário abaixo de 25: capitulação vendedora.',
    [{ indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 25 }]),
  F('reversao-bearish', 'Reversão Bearish', 'siren', 'red', 'MACD negativo com Supertrend baixista no diário.',
    [
      { indicator: 'macd', tf: '1d', field: 'hist', op: 'lt', value: 0 },
      { indicator: 'super', tf: '1d', field: 'dir', op: 'eq', value: 0 },
    ]),
  F('super-alta-4h', 'Supertrend Alta 4h', 'up-right', 'green', 'Supertrend altista no 4 horas.',
    [{ indicator: 'super', tf: '4h', field: 'dir', op: 'eq', value: 1 }]),
  F('stoch-sobrevendido', 'Estocástico Sobrevendido', 'eye', 'yellow', 'Estocástico rápido ≤20 no 4 horas.',
    [{ indicator: 'stoch', tf: '4h', field: 'k', op: 'lte', value: 20 }]),
];

// ---- firstSeen (quando cada alerta acendeu pela 1ª vez) ----
const FS_KEY = 'cc.monitor.firstSeen';
export function loadFirstSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FS_KEY);
    const j = raw ? JSON.parse(raw) as Record<string, number> : {};
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}
export function saveFirstSeen(m: Record<string, number>): void {
  try {
    localStorage.setItem(FS_KEY, JSON.stringify(m));
  } catch {
    /* armazenamento cheio */
  }
}
