import type { Conviction } from '@/engine/ranking';
import type { MarketRegime, OpportunityScore, Signal, TrendLabel } from '@/types';
import type { TrendState } from '@/engine/trend';

export type HorizonKey = '7d' | '1m' | '3m' | '4m' | '12m';

export type SetupKind =
  | 'trend-continuation'
  | 'pullback'
  | 'breakout'
  | 'momentum'
  | 'reversal'
  | 'watch';

export interface Scenario {
  name: 'bull' | 'base' | 'bear';
  condition: string;
  low: number | null;
  high: number | null;
  /** ex: "+18,4%" ou "−6,2%". null sem base numérica. */
  pct: string | null;
}

export type RegimeFit = 'favoravel' | 'neutro' | 'contra';
export type Liquidity = 'alta' | 'media' | 'baixa';

/** Plano geométrico validado (sem R:R impossível). UI mostra N/A quando null. */
export interface SwingPlan {
  ideal: number;
  zoneLow: number;
  zoneHigh: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number | null;
  rr1: number;
  rr2: number;
  rr3: number | null;
  stopPct: number;
  basis: string;
  scenarios: Scenario[];
}

/** Fatos crus por ativo (IDB-safe): o stage-2 busca, o rank interpreta. */
export interface HorizonFacts {
  symbol: string;
  name: string;
  price: number;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  /** Score 1d completo (confiança, why/risks, sinal, stretch, base de DQ). */
  score1d: OpportunityScore;
  rsiD: number | null;
  macdBull: boolean | null;
  volRatio: number | null;
  /** Chaikin Money Flow 20d (interesse comprador real). */
  cmfD: number | null;
  atrPct: number | null;
  superD: 'BULLISH' | 'BEARISH' | null;
  trendW: TrendState | null;
  trendD: TrendState | null;
  distHigh20Pct: number | null;
  plan: SwingPlan | null;
  dqScore: number;
  provider: string | null;
  fetchedAt: number | null;
  candles: number;
}

export interface Evidence {
  /** ex: "20d por tier (proxy p/ position)". */
  label: string;
  n: number;
  hit: number | null;
  rr: number | null;
  strength: 'insuficiente' | 'limitada' | 'moderada' | 'forte';
}

export interface HorizonOpportunity {
  symbol: string;
  name: string;
  price: number;
  horizon: HorizonKey;
  setup: SetupKind;
  setupReasons: string[];
  /** Score 0–100 do horizonte (ranking técnico, NÃO probabilidade). */
  score: number;
  confidence: number;
  tier: Conviction;
  /** null sem plano (UI mostra N/A — nunca inventado). */
  entryIdeal: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  /** (preço − ideal)/ideal em %. */
  entryDistPct: number | null;
  entryExtended: boolean;
  stop: number | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  stopPct: number | null;
  /** (t2/entrada − 1) em % — potencial do cenário base. */
  basePct: number | null;
  scenarios: Scenario[];
  invalidation: string[];
  why: string[];
  risks: string[];
  regime: string;
  regimeFit: RegimeFit;
  rs7: number | null;
  stretchPct: number | null;
  /** false = sem interesse comprador comprovado (badge + tier degradado). */
  demandPass: boolean;
  demandNote: string | null;
  /** Média 0–100 das pernas W/D (para "melhor tendência" no comparador). */
  trendScore: number;
  volumeRatio: number | null;
  atrPct: number | null;
  liquidity: Liquidity;
  dqScore: number;
  provider: string | null;
  updatedAt: number | null;
  candles: number;
  fresh: boolean;
  evidence: Evidence | null;
  confFull: boolean;
  confLabel: string | null;
  signal: Signal;
}
