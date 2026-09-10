// Configuração central de pesos do scoring — nunca espalhar pesos nos componentes.
export const SCORING_WEIGHTS = {
  trend: 20,
  momentum: 20,
  relativeStrength: 15,
  volume: 15,
  rsi: 10,
  macd: 10,
  volatility: 5,
  regime: 5,
} as const;
export type ScoringWeights = typeof SCORING_WEIGHTS;

export function classifyScore(score: number): string {
  if (score >= 90) return 'EXCEPTIONAL';
  if (score >= 80) return 'VERY STRONG';
  if (score >= 70) return 'STRONG';
  if (score >= 60) return 'POSITIVE';
  if (score >= 50) return 'NEUTRAL';
  if (score >= 40) return 'WEAK';
  if (score >= 30) return 'VERY WEAK';
  return 'BEARISH';
}
