import type { HorizonCandidate, HorizonProgress, HorizonResult } from '@/services/horizon';
import type { MarketContextData } from '@/services/marketContext';
import type { WFReport } from '@/services/walkforward';

/**
 * infrastructure/ports — contratos que a application exige.
 * Implementações concretas (adapters.ts) falam com Yahoo, candles locais
 * e IA; os hooks nunca importam serviço externo direto.
 */

export interface ProgressCallback {
  (p: HorizonProgress): void;
}

/** Stage-2 do horizonte: instantâneo + universo, com progresso e aborto. */
export interface AnalysisPort {
  analyze(
    candidates: HorizonCandidate[],
    onProgress: ProgressCallback,
    signal: AbortSignal,
  ): Promise<HorizonResult>;
}

/** Contexto mensal/semanal (Ibovespa + S&P via Yahoo, com cache IDB). */
export interface MarketContextPort {
  load(): Promise<{ data: MarketContextData | null; stale: boolean }>;
  refresh(): Promise<MarketContextData>;
}

/** Evidência histórica walk-forward (cache; recálculo fica no worker). */
export interface EvidencePort {
  load(): Promise<WFReport | null>;
}

export interface AiResult {
  ok: boolean;
  text: string | null;
  /** Badge de degradação (ex.: versão Lite) — null quando tier principal. */
  badge?: string | null;
}

export interface AiQuota {
  left: number | null;
  cap: number;
}

/** IA opcional, sempre sob clique: resumo do pulso + análise do setup. */
export interface AiPort {
  quota(): Promise<AiQuota>;
  quotaLite(): Promise<AiQuota>;
  summarizeContext(prompt: string): Promise<AiResult>;
  analyzeSetup(prompt: string): Promise<AiResult>;
}
