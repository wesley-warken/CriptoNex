import type { OpportunityScore } from '@/types';
export interface RankFilters {
  minScore?: number;
  minConfidence?: number;
  signal?: 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL';
  query?: string;
  /** R:R mínimo (usa plan.rr1; sem plano o item é excluído quando > 0). */
  minRR?: number;
}
export function rankOpportunities(items: OpportunityScore[], f: RankFilters = {}): OpportunityScore[] {
  return items
    .filter((o) => (f.minScore != null ? o.score >= f.minScore : true))
    .filter((o) => (f.minConfidence != null ? o.confidence >= f.minConfidence : true))
    .filter((o) => (f.signal && f.signal !== 'ALL' ? o.signal === f.signal : true))
    .filter((o) => (f.query ? o.symbol.toLowerCase().includes(f.query.toLowerCase()) : true))
    .filter((o) => (f.minRR != null && f.minRR > 0 ? (o.plan?.rr1 ?? -Infinity) >= f.minRR : true))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

/** Clamp para inputs numéricos de filtro (0–100, inteiro; NaN vira 0). */
export function clampScoreInput(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}
export function topCategories(items: OpportunityScore[]): Record<string, OpportunityScore[]> {
  const by = (fn: (o: OpportunityScore) => number) => [...items].sort((a, b) => fn(b) - fn(a)).slice(0, 5);
  const val = (label: string) => (o: OpportunityScore) => o.breakdown.find((b) => b.label === label)?.earned ?? 0;
  return {
    'Melhor Momentum': by(val('MOMENTUM')),
    'Melhor Tendência': by(val('TREND')),
    'Melhor Volume': by(val('VOLUME')),
    'Melhor Força Relativa': by(val('RELATIVE STRENGTH')),
    'Maior Confiança': [...items].sort((a, b) => b.confidence - a.confidence || b.score - a.score).slice(0, 5),
    'Melhor Qualidade de Dados': [...items].sort((a, b) => b.dataQuality - a.dataQuality || b.score - a.score).slice(0, 5),
  };
}

export type Conviction = 'ELITE' | 'FORTE' | 'OBSERVAR' | 'EVITAR';

/** Gates numéricos dos tiers (sobrescrevíveis por calibração). */
export interface TierGates {
  eliteMinScore: number;
  forteMinScore: number;
}
export const DEFAULT_GATES: TierGates = { eliteMinScore: 75, forteMinScore: 65 };

/** Tier de convicção: combina score + confiança + qualidade + sinal. */
export function convictionOf(o: OpportunityScore, gates: TierGates = DEFAULT_GATES): Conviction {
  if (o.signal === 'SELL') return 'EVITAR';
  if (o.signal === 'BUY' && o.score >= gates.eliteMinScore && o.confidence >= 65 && o.dataQuality >= 60)
    return 'ELITE';
  if (o.score >= gates.forteMinScore && o.confidence >= 55 && o.dataQuality >= 50) return 'FORTE';
  if (o.score >= 50) return 'OBSERVAR';
  return 'EVITAR';
}

/** Percentil 0–100 do atraso (stretchRaw) dentro do universo pontuado. */
export function stretchPercentiles(items: { symbol: string; stretchRaw?: number | null }[]): Map<string, number> {
  const vals = items
    .filter((i) => i.stretchRaw != null && Number.isFinite(i.stretchRaw as number))
    .map((i) => ({ s: i.symbol, v: i.stretchRaw as number }));
  const sorted = [...vals].sort((a, b) => a.v - b.v);
  const map = new Map<string, number>();
  sorted.forEach((it, idx) =>
    map.set(it.s, sorted.length <= 1 ? 50 : (idx / (sorted.length - 1)) * 100),
  );
  return map;
}

/** Gate de atraso: ELITE/FORTE com stretch ≥ p90 degrada 1 tier. */
export function applyStretchGate(
  tier: Conviction,
  stretchPct: number | null | undefined,
  p = 90,
): Conviction {
  if (stretchPct == null || stretchPct < p) return tier;
  if (tier === 'ELITE') return 'FORTE';
  if (tier === 'FORTE') return 'OBSERVAR';
  return tier;
}

/** Gate de confluência: ELITE exige acordo total com o sinal (só pós-stage 2);
 *  sem confluência calculada, ELITE é limitado a FORTE. */
export function applyConfluenceGate(
  tier: Conviction,
  signal: OpportunityScore['signal'],
  conf: OpportunityScore['confluence'],
): Conviction {
  if (!conf) return tier === 'ELITE' ? 'FORTE' : tier;
  const want = signal === 'BUY' ? 'BULLISH' : signal === 'SELL' ? 'BEARISH' : null;
  if (tier === 'ELITE') {
    if (want && conf.full && conf.dirA === want && conf.dirB === want) return 'ELITE';
    return 'FORTE';
  }
  if (tier === 'FORTE' && want) {
    const opp = want === 'BULLISH' ? 'BEARISH' : 'BULLISH';
    if (conf.dirB === opp) return 'OBSERVAR';
  }
  return tier;
}

export interface EffectiveTierOpts {
  stretchPct?: number | null;
  gates?: TierGates;
}

/** Tier efetivo exibido: base → atraso → confluência. */
export function effectiveTier(o: OpportunityScore, opts: EffectiveTierOpts = {}): Conviction {
  let t = convictionOf(o, opts.gates);
  t = applyStretchGate(t, opts.stretchPct);
  t = applyConfluenceGate(t, o.signal, o.confluence);
  return t;
}

export type StockSegment = 'B3' | 'US' | 'GLOBAL';

/** Classifica ação em segmento: universo tem prioridade; fora dele, sufixo Yahoo
 *  (`*.SA` → B3; sem sufixo/ponto → US; resto → GLOBAL). */
export function stockSegment(
  symbol: string,
  yahoo: string | null | undefined,
  b3: ReadonlySet<string>,
  us: ReadonlySet<string>,
): StockSegment {
  if (b3.has(symbol)) return 'B3';
  if (us.has(symbol)) return 'US';
  const y = (yahoo ?? '').trim().toUpperCase();
  if (y.endsWith('.SA')) return 'B3';
  if (y && !y.includes('.') && !y.includes('=') && !y.startsWith('^')) return 'US';
  return 'GLOBAL';
}

/** Particiona itens por segmento. Invariante: B3 + US + GLOBAL == total. */
export function partitionStockSegments(
  items: { symbol: string; yahoo?: string | null }[],
  b3: ReadonlySet<string>,
  us: ReadonlySet<string>,
): Record<StockSegment, string[]> {
  const out: Record<StockSegment, string[]> = { B3: [], US: [], GLOBAL: [] };
  for (const it of items) out[stockSegment(it.symbol, it.yahoo, b3, us)].push(it.symbol);
  return out;
}
