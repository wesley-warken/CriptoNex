import type { OpportunityScore } from '@/types';
export interface RankFilters {
  minScore?: number;
  minConfidence?: number;
  signal?: 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL';
  query?: string;
}
export function rankOpportunities(items: OpportunityScore[], f: RankFilters = {}): OpportunityScore[] {
  return items
    .filter((o) => (f.minScore ? o.score >= f.minScore : true))
    .filter((o) => (f.minConfidence ? o.confidence >= f.minConfidence : true))
    .filter((o) => (f.signal && f.signal !== 'ALL' ? o.signal === f.signal : true))
    .filter((o) => (f.query ? o.symbol.toLowerCase().includes(f.query.toLowerCase()) : true))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
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

/** Tier de convicção: combina score + confiança + qualidade + sinal. */
export function convictionOf(o: OpportunityScore): Conviction {
  if (o.signal === 'SELL') return 'EVITAR';
  if (o.signal === 'BUY' && o.score >= 75 && o.confidence >= 65 && o.dataQuality >= 60) return 'ELITE';
  if (o.score >= 65 && o.confidence >= 55 && o.dataQuality >= 50) return 'FORTE';
  if (o.score >= 50) return 'OBSERVAR';
  return 'EVITAR';
}
