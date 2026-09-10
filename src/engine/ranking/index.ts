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
    'Best Momentum': by(val('MOMENTUM')),
    'Best Trend': by(val('TREND')),
    'Best Volume': by(val('VOLUME')),
    'Best Relative Strength': by(val('RELATIVE STRENGTH')),
    'Most Oversold': [...items].sort((a, b) => a.score - b.score).slice(0, 5),
    'Most Overbought': [...items].sort((a, b) => b.score - a.score).slice(0, 5),
  };
}
