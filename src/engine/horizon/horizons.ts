import type { HorizonKey } from './types';

export type { HorizonKey };

export interface HorizonWeights {
  /** Tendência semanal (perna longa do position). */
  trendW: number;
  /** Tendência diária (timing/contexto). */
  trendD: number;
  /** Encaixe com o market regime. */
  regime: number;
  /** Força relativa 7d vs BTC (percentil). */
  rs: number;
  /** Estrutura: plano válido + R:R (percentil por hurdle). */
  struct: number;
  /** Volume acima da média. */
  vol: number;
  /** Volatilidade comportada (ATR%). */
  volat: number;
  /** Liquidez (market cap + volume). */
  liq: number;
}

export interface HorizonDef {
  key: HorizonKey;
  label: string;
  /** Duração de referência em dias (rótulos e evidência). */
  days: number;
  weights: HorizonWeights;
  /** R:R mínimo de referência do horizonte. */
  minRR: number;
}

/**
 * Pesos por horizonte (somam 100 — testado). Leitura: quanto maior o
 * horizonte, mais a perna semanal e o regime pesam; o diário nunca domina
 * um position trade, só refina timing (princípio do produto).
 * 3–4 meses é o default: W25/D15/regime15/RS10/estrutura15/vol5/volat5/liq10.
 */
export const HORIZONS: Record<HorizonKey, HorizonDef> = {
  '7d': {
    key: '7d', label: '1–7 dias', days: 7, minRR: 1.5,
    weights: { trendW: 5, trendD: 30, regime: 10, rs: 15, struct: 15, vol: 10, volat: 5, liq: 10 },
  },
  '1m': {
    key: '1m', label: '1–4 semanas', days: 30, minRR: 2,
    weights: { trendW: 15, trendD: 25, regime: 10, rs: 15, struct: 15, vol: 5, volat: 5, liq: 10 },
  },
  '3m': {
    key: '3m', label: '1–3 meses', days: 90, minRR: 2,
    weights: { trendW: 25, trendD: 15, regime: 15, rs: 10, struct: 15, vol: 5, volat: 5, liq: 10 },
  },
  '4m': {
    key: '4m', label: '3–4 meses', days: 120, minRR: 2,
    weights: { trendW: 25, trendD: 15, regime: 15, rs: 10, struct: 15, vol: 5, volat: 5, liq: 10 },
  },
  '12m': {
    key: '12m', label: '6–12 meses', days: 365, minRR: 2.5,
    weights: { trendW: 30, trendD: 10, regime: 15, rs: 10, struct: 15, vol: 5, volat: 5, liq: 10 },
  },
};

export const DEFAULT_HORIZON: HorizonKey = '4m';

export const HORIZON_ORDER: HorizonKey[] = ['7d', '1m', '3m', '4m', '12m'];
