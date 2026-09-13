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
import { calcMACD, calcStoch, calcSupertrendFull, rsiWithAvg, RSI_MIN_BARS } from '@/engine/indicators';
import { computeMaSet, type MaSet } from '@/services/maTable';
import { unusualMove } from '@/engine/attention';

export type MonTf = '1h' | '4h' | '1d' | '1w';
export type MonIndicator = 'trend' | 'rsi' | 'stoch' | 'macd' | 'super' | 'attention' | 'ma' | 'sr';
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
  { k: 'attention', label: 'Movimento Atípico' },
  { k: 'ma', label: 'Médias (diário)' },
  { k: 'sr', label: 'Suporte/Resistência' },
];

export const MON_FIELDS: Record<MonIndicator, { k: string; label: string; hint?: string }[]> = {
  trend: [
    { k: 'curto', label: 'Curto prazo', hint: 'nível 0 (Baixa Forte) a 4 (Alta Forte)' },
    { k: 'medio', label: 'Médio prazo', hint: 'nível 0 (Baixa Forte) a 4 (Alta Forte)' },
    { k: 'longo', label: 'Longo prazo', hint: 'nível 0 (Baixa Forte) a 4 (Alta Forte)' },
  ],
  rsi: [{ k: 'value', label: 'Valor', hint: '0 a 100 (≤30 sobrevenda, ≥70 sobrecompra)' }],
  stoch: [
    { k: 'k', label: 'Rápido %K', hint: '0 a 100 (≤20 sobrevendido, ≥80 sobrecomprado)' },
    { k: 'd', label: 'Lento %D', hint: '0 a 100 (≤20 sobrevendido, ≥80 sobrecomprado)' },
  ],
  macd: [{ k: 'hist', label: 'Histograma', hint: 'diferença absoluta (>0 altista, <0 baixista)' }],
  super: [{ k: 'dir', label: 'Direção', hint: '1 = Alta, 0 = Baixa' }],
  attention: [
    { k: 'ratio', label: '× Média', hint: 'múltiplo da média de 10 dias (≥2 = atípico)' },
    { k: 'today', label: 'Hoje %', hint: 'variação de hoje em %' },
  ],
  ma: [
    { k: 'ema9_26', label: 'EMA9 − EMA26', hint: 'diferença absoluta (>0 golden, <0 death)' },
    { k: 'sma50_200', label: 'SMA50 − SMA200', hint: 'diferença absoluta (>0 altista)' },
  ],
  sr: [
    { k: 'distSup', label: 'Dist. Suporte %', hint: '% até o suporte de 20 (≤0 = perdeu o suporte)' },
    { k: 'distRes', label: 'Dist. Resistência %', hint: '% até a resistência de 20 (≤0 = rompeu)' },
  ],
};

/**
 * Matriz indicador × timeframes suportados (fonte única da verdade;
 * espelha o que resolveValue/buildMonData realmente avaliam).
 * attention/ma ignoram o seletor (sempre diário); trend não tem semanal.
 */
export const MON_TF_BY_INDICATOR: Record<MonIndicator, MonTf[]> = {
  trend: ['1h', '4h', '1d'],
  rsi: ['1h', '4h', '1d', '1w'],
  stoch: ['1h', '4h', '1d', '1w'],
  macd: ['1h', '4h', '1d', '1w'],
  super: ['1h', '4h', '1d', '1w'],
  attention: ['1d'],
  ma: ['1d'],
  sr: ['1h', '4h', '1d', '1w'],
};

/** null = combinação válida; string = motivo da incompatibilidade. */
export function validateCondition(c: MonCondition): string | null {
  const tfs = MON_TF_BY_INDICATOR[c.indicator];
  if (!tfs) return `indicador desconhecido (${c.indicator})`;
  if (!tfs.includes(c.tf)) {
    const ind = MON_INDICATORS.find((o) => o.k === c.indicator)?.label ?? c.indicator;
    return `${ind} não suporta o timeframe ${c.tf} (vale: ${tfs.join(', ')})`;
  }
  if (!MON_FIELDS[c.indicator].some((o) => o.k === c.field)) {
    return `campo desconhecido (${c.field}) para este indicador`;
  }
  return null;
}

/** Motivos de incompatibilidade do filtro (vazio = válido). */
export function validateFilter(f: MonFilter): string[] {
  if (!f.conditions.length) return ['filtro sem condições'];
  const out: string[] = [];
  f.conditions.forEach((c, i) => {
    const reason = validateCondition(c);
    if (reason) out.push(`condição ${i + 1}: ${reason}`);
  });
  return out;
}

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
  srDistSup: Record<MonTf, number | null>;
  srDistRes: Record<MonTf, number | null>;
}

const num = (v: number | null | undefined): number | null => (v == null || Number.isNaN(v) ? null : v);
const safe = <T>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/**
 * Monta todos os valores avaliáveis de uma moeda a partir dos klines por tempo.
 * `kl` é a base de closes (sintético do sparkline ou real — vale para os
 * indicadores close-only: RSI/MACD/SMA/EMA/BB/atenção/SR). `rangeKl` traz o
 * OHLC REAL por TF para Estocástico/Supertrend/voto-Stoch; TF ausente aqui =
 * sem range confiável (esses indicadores ficam null = indisponível, sem
 * votar no fictício). Sem `rangeKl`, usa `kl` (comportamento legado).
 */
export function buildMonData(
  coin: UniverseCoin,
  kl: Record<MonTf, Candle[] | null>,
  rangeKl?: Partial<Record<MonTf, Candle[] | null>>,
): MonData {
  const get = (tf: MonTf): Candle[] => kl[tf] ?? [];
  const rangeOf = (tf: MonTf): Candle[] => (rangeKl ? (rangeKl[tf] ?? []) : get(tf));
  const closesOf = (tf: MonTf): number[] => get(tf).map((k) => k.close);
  const rsi: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const stochK: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const stochD: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const macd: Record<MonTf, number | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  const sup: Record<MonTf, 'BULLISH' | 'BEARISH' | null> = { '1h': null, '4h': null, '1d': null, '1w': null };
  (Object.keys(rsi) as MonTf[]).forEach((tf) => {
    const k = get(tf);
    // Warmup de Wilder (paridade TV): abaixo de 100 barras o valor desloca.
    if (k.length >= RSI_MIN_BARS) rsi[tf] = num(safe(() => rsiWithAvg(k).rsi));
    // Range (high/low) só vale com OHLC real da exchange: sintético de
    // closes tem range fictício (±0,05%) e forjaria Estocástico/Supertrend.
    const rk = rangeOf(tf);
    if (rk.length >= 15) {
      const s = safe(() => calcStoch(rk));
      stochK[tf] = num(s?.k ?? null);
      stochD[tf] = num(s?.d ?? null);
    }
    if (k.length >= 35) macd[tf] = num(safe(() => calcMACD(k).hist));
    if (rk.length >= 15) sup[tf] = safe(() => calcSupertrendFull(rk))?.dir ?? null;
  });
  const c1d = closesOf('1d');
  const att = c1d.length >= 12 ? safe(() => unusualMove(c1d)) : null;
  // S/R: distância % ao suporte/resistência de 20 barras (excluindo a atual).
  // distRes ≤ 5 → aproximando-se da resistência; ≤ 0 → rompimento acima.
  // distSup ≤ 5 → aproximando-se do suporte; ≤ 0 → perda do suporte.
  const srOf = (kl: Candle[] | null): { sup: number | null; res: number | null } => {
    if (!kl || kl.length < 22) return { sup: null, res: null };
    const closes = kl.map((k) => k.close).filter((v) => v > 0);
    if (closes.length < 22) return { sup: null, res: null };
    const last = closes[closes.length - 1];
    if (!(last > 0)) return { sup: null, res: null };
    const window = closes.slice(-21, -1);
    const sup20 = Math.min(...window);
    const res20 = Math.max(...window);
    if (!(sup20 > 0) || !(res20 > 0)) return { sup: null, res: null };
    return {
      sup: num(((last - sup20) / last) * 100),
      res: num(((res20 - last) / last) * 100),
    };
  };
  // Tendência por consenso na MESMA série de cada tempo (fonte única por perna).
  // 1d sem klines: cold-start % dos campos do universo; com klines: consenso.
  // Tendência multi-TF: cada perna no seu timeframe (1d → 4h/diário/semanal).
  // 1d sem klines: cold-start % dos campos do universo.
  const ohlcOf = (tf: MonTf): TrendOhlc | null => {
    // Perna real disponível: usa a série real inteira (closes+range alinhados).
    const rk = rangeOf(tf);
    if (rk.length >= 15) {
      return { closes: rk.map((k) => k.close), highs: rk.map((k) => k.high), lows: rk.map((k) => k.low) };
    }
    // Sem range real: closes sintéticos com highs/lows vazios — o voto-Stoch
    // abstém-se (hasRange exige mesmos comprimentos) em vez de votar no fictício.
    const kl = get(tf);
    if (!kl || kl.length < 15) return null;
    return { closes: kl.map((k) => k.close), highs: [], lows: [] };
  };
  const rec = {
    '1h': ohlcOf('1h'),
    '4h': ohlcOf('4h'),
    '1d': ohlcOf('1d'),
    '1w': ohlcOf('1w'),
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
    srDistSup: {
      '1h': srOf(get('1h')).sup, '4h': srOf(get('4h')).sup,
      '1d': srOf(get('1d')).sup, '1w': srOf(get('1w')).sup,
    },
    srDistRes: {
      '1h': srOf(get('1h')).res, '4h': srOf(get('4h')).res,
      '1d': srOf(get('1d')).res, '1w': srOf(get('1w')).res,
    },
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
    case 'sr':
      return c.field === 'distRes' ? d.srDistRes[c.tf] : d.srDistSup[c.tf];
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
  return evalConditionState(d, c) === 'active';
}

/**
 * Estado triplo da condição: 'active' | 'inactive' | 'unknown'.
 * Falha de dado (resolveValue null) é 'unknown' — NUNCA false, para uma
 * queda de rede não forjar borda falsa de saída/retorno.
 */
export type MonEdgeState = 'active' | 'inactive' | 'unknown';

export function evalConditionState(d: MonData, c: MonCondition): MonEdgeState {
  const v = resolveValue(d, c);
  if (v == null) return 'unknown';
  switch (c.op) {
    case 'gte': return v >= c.value ? 'active' : 'inactive';
    case 'lte': return v <= c.value ? 'active' : 'inactive';
    case 'gt': return v > c.value ? 'active' : 'inactive';
    case 'lt': return v < c.value ? 'active' : 'inactive';
    case 'eq': return Math.abs(v - c.value) < 1e-9 ? 'active' : 'inactive';
  }
}

/** Filtro casa quando tem ≥1 condição e TODAS passam (AND). */
export function evalFilter(d: MonData, f: MonFilter): boolean {
  return evalFilterState(d, f) === 'active';
}

/**
 * Estado triplo do filtro (lógica 3VL: false domina; senão unknown se
 * houver condição desconhecida, senão active). Filtro vazio = inactive.
 */
export function evalFilterState(d: MonData, f: MonFilter): MonEdgeState {
  if (!f.conditions.length) return 'inactive';
  let sawUnknown = false;
  for (const c of f.conditions) {
    const s = evalConditionState(d, c);
    if (s === 'inactive') return 'inactive';
    if (s === 'unknown') sawUnknown = true;
  }
  return sawUnknown ? 'unknown' : 'active';
}

const OP_SYMBOL: Record<MonOp, string> = { gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=' };

/** Rótulo legível da condição (ex.: "RSI 4h"). */
export function condLabel(c: MonCondition): string {
  const ind = MON_INDICATORS.find((o) => o.k === c.indicator)?.label ?? c.indicator;
  const tf = MON_TFS.find((o) => o.k === c.tf)?.label ?? c.tf;
  return `${ind} ${tf}`;
}

const fmtVal = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** Valor atual formatado da condição (ex.: "Alta", "28,1") ou null sem dados. */
export function condValueText(d: MonData, c: MonCondition): string | null {
  const v = resolveValue(d, c);
  if (v == null) return null;
  if (c.indicator === 'trend') {
    return TREND_LEVEL_OPTIONS.find((o) => o.value === v)?.label ?? fmtVal(v);
  }
  if (c.indicator === 'super') return v === 1 ? 'Alta' : 'Baixa';
  return fmtVal(v).replace('.', ',');
}

/**
 * Porquê da linha do Monitor: cada condição com valor atual e alvo
 * (ex.: "RSI 4 horas 25 ≤ 30 · Super Diário Baixa = Baixa").
 */
export function whyFilter(d: MonData, f: MonFilter): string {
  return f.conditions.map((c) => {
    const cur = condValueText(d, c);
    const field = MON_FIELDS[c.indicator].find((o) => o.k === c.field);
    const target = c.indicator === 'trend'
      ? (TREND_LEVEL_OPTIONS.find((o) => o.value === c.value)?.label ?? String(c.value))
      : c.indicator === 'super'
        ? (c.value === 1 ? 'Alta' : 'Baixa')
        : String(c.value).replace('.', ',');
    const left = field && field.k !== 'value' && field.k !== 'dir' ? `${condLabel(c)} ${field.label} ${cur ?? '—'}` : `${condLabel(c)} ${cur ?? '—'}`;
    return `${left} ${OP_SYMBOL[c.op]} ${target}`;
  }).join(' · ');
}

/** O que precisa ser buscado na rede para avaliar estes filtros (resto vem do universo/spark). */
export interface MonDataPlan {
  /** 'ma': diário 250 (médias) · 'kl': diário ~120 (indicadores) · 'none': nada */
  daily: 'ma' | 'kl' | 'none';
  weekly: boolean;
  /** Timeframes onde algum filtro avalia indicador de range (stoch/super/voto-Stoch): exigem OHLC real. */
  rangeTf: MonTf[];
  /** Timeframes onde algum filtro avalia RSI: exigem closes reais (paridade TV). */
  rsiTf: MonTf[];
}

export function planMonitorData(filters: MonFilter[]): MonDataPlan {
  let needMA = false;
  let needDaily = false;
  let needW = false;
  const range = new Set<MonTf>();
  const rsi = new Set<MonTf>();
  for (const f of filters) {
    for (const c of f.conditions) {
      // Tendência não força fetch real sozinha: o voto-Stoch abstém-se nas
      // pernas sintéticas; quando outro indicador busca o TF real, ela aproveita.
      if (c.indicator === 'trend') continue;
      if (c.indicator === 'stoch' || c.indicator === 'super') range.add(c.tf);
      if (c.indicator === 'rsi') rsi.add(c.tf);
      if (c.indicator === 'ma') needMA = true;
      else if (c.indicator === 'attention') needDaily = true;
      else if (c.indicator === 'sr' && (c.tf === '1d' || c.tf === '1w')) {
        if (c.tf === '1w') needW = true;
        else needDaily = true;
      }
      else if (c.tf === '1w') needW = true;
      else if (c.tf === '1d') needDaily = true;
      // 1h/4h (rsi/stoch/macd/super/sr): sparkline do universo — zero fetch
    }
  }
  return { daily: needMA ? 'ma' : needDaily ? 'kl' : 'none', weekly: needW, rangeTf: [...range], rsiTf: [...rsi] };
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
  F('golden-cross', 'Cruz Altista EMA 9/26', 'check', 'green', 'EMA 9 acima da EMA 26 no diário. Não é o Golden Cross clássico (SMA50/200).',
    [{ indicator: 'ma', tf: '1d', field: 'ema9_26', op: 'gt', value: 0 }]),
  F('death-cross', 'Cruz Baixista EMA 9/26', 'trend-down', 'red', 'EMA 9 abaixo da EMA 26 no diário. Não é o Death Cross clássico (SMA50/200).',
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
  F('prox-resistencia', 'Aproximando da Resistência', 'up-right', 'yellow', 'A até 5% da máxima de 20 no diário: teste de resistência se aproxima.',
    [{ indicator: 'sr', tf: '1d', field: 'distRes', op: 'lte', value: 5 }]),
  F('prox-suporte', 'Aproximando do Suporte', 'trend-down', 'yellow', 'A até 5% da mínima de 20 no diário: teste de suporte se aproxima.',
    [{ indicator: 'sr', tf: '1d', field: 'distSup', op: 'lte', value: 5 }]),
  F('rompimento-resistencia', 'Rompimento de Resistência', 'zap', 'green', 'Fechou acima da máxima de 20 no diário.',
    [{ indicator: 'sr', tf: '1d', field: 'distRes', op: 'lte', value: 0 }]),
  F('sobrevendido-suporte', 'Sobrevendido no Suporte', 'gem', 'green', 'RSI diário ≤30 colado no suporte de 20 (até 2%).',
    [
      { indicator: 'rsi', tf: '1d', field: 'value', op: 'lte', value: 30 },
      { indicator: 'sr', tf: '1d', field: 'distSup', op: 'lte', value: 2 },
    ]),
  F('sobrecomprado-resistencia', 'Sobrecomprado na Resistência', 'flame', 'red', 'RSI diário ≥70 colado na resistência de 20 (até 2%).',
    [
      { indicator: 'rsi', tf: '1d', field: 'value', op: 'gte', value: 70 },
      { indicator: 'sr', tf: '1d', field: 'distRes', op: 'lte', value: 2 },
    ]),
];

// ---- Bordas de ativação (realtime de verdade) ----

/** Limite de eventos guardados no feed realtime. */
export const MON_EVENTS_CAP = 200;

export interface MonEdgeEvent {
  /** `${filterId}:${symbol}` */
  key: string;
  filterId: string;
  symbol: string;
  /** Timestamp da transição inativo→ativo. */
  ts: number;
}

/**
 * Diferença por borda: só `inactive/ausente → active` vira evento, com o
 * timestamp da transição. 'unknown' (falha de dado) mantém o estado
 * anterior — nunca forja saída nem retorno. Puro e testável.
 */
export function diffEdgeEvents(
  prevActive: Record<string, true>,
  states: { key: string; filterId: string; symbol: string; state: MonEdgeState }[],
  now: number,
): { active: Record<string, true>; events: MonEdgeEvent[]; changed: boolean } {
  const active: Record<string, true> = {};
  const events: MonEdgeEvent[] = [];
  let changed = false;
  const seen = new Set<string>();
  for (const s of states) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    if (s.state === 'active') {
      active[s.key] = true;
      if (!prevActive[s.key]) {
        events.push({ key: s.key, filterId: s.filterId, symbol: s.symbol, ts: now });
        changed = true;
      }
    } else if (s.state === 'unknown' && prevActive[s.key]) {
      // Falha transitória com condição ativa antes: mantém ativo, sem evento.
      active[s.key] = true;
    } else if (s.state === 'inactive' && prevActive[s.key]) {
      changed = true;
    }
  }
  if (!changed) {
    // Nada mudou: mantém o mapa anterior (evita churn de objeto).
    let same = true;
    for (const k of Object.keys(active)) if (!prevActive[k]) { same = false; break; }
    if (same) for (const k of Object.keys(prevActive)) if (!active[k]) { same = false; break; }
    if (same) return { active: prevActive, events, changed: false };
  }
  return { active, events, changed };
}

const MON_ACTIVE_KEY = 'cc.monitor.active';
const MON_EVENTS_KEY = 'cc.monitor.events';

/** Conjunto ativo persistido (sobrevive ao reload: ativo antes ≠ novo alerta). */
export function loadMonActive(): Record<string, true> {
  try {
    const raw = localStorage.getItem(MON_ACTIVE_KEY);
    const j = raw ? JSON.parse(raw) as Record<string, true> : {};
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

export function saveMonActive(m: Record<string, true>): void {
  try {
    localStorage.setItem(MON_ACTIVE_KEY, JSON.stringify(m));
  } catch {
    /* armazenamento cheio */
  }
}

/** Últimas bordas por chave (cap 200, mais recentes primeiro ao ler). */
export function loadMonEvents(): MonEdgeEvent[] {
  try {
    const raw = localStorage.getItem(MON_EVENTS_KEY);
    const j = raw ? JSON.parse(raw) as MonEdgeEvent[] : [];
    if (!Array.isArray(j)) return [];
    return j
      .filter((e) => e && typeof e.key === 'string' && typeof e.ts === 'number')
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MON_EVENTS_CAP);
  } catch {
    return [];
  }
}

export function saveMonEvents(events: MonEdgeEvent[]): void {
  try {
    const byKey = new Map<string, MonEdgeEvent>();
    for (const e of [...events].sort((a, b) => b.ts - a.ts)) {
      if (!byKey.has(e.key)) byKey.set(e.key, e);
    }
    localStorage.setItem(MON_EVENTS_KEY, JSON.stringify([...byKey.values()].slice(0, MON_EVENTS_CAP)));
  } catch {
    /* armazenamento cheio */
  }
}

/**
 * Universo do Monitor: sempre Top N por market cap (rank oficial, senão
 * ordenação por marketCap). Nunca a ordem visual da tabela. Retorna vazio
 * quando não há market cap carregado — o chamador pausa com aviso.
 */
export function selectTopByMcap(
  coins: UniverseCoin[],
  topN: number | null,
  fetchN: number,
): UniverseCoin[] {
  const withMcap = coins.filter((c) => (c.marketCap ?? 0) > 0);
  if (!withMcap.length) return [];
  if (topN == null) {
    return [...withMcap]
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, fetchN);
  }
  const hasOfficial = withMcap.some((c) => c.rank != null);
  const pool = hasOfficial
    ? withMcap.filter((c) => (c.rank ?? Infinity) <= topN)
    : [...withMcap]
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, topN);
  return pool
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, fetchN);
}
