import type { HorizonCandidate } from '@/services/horizon';
import type { HorizonFacts } from '@/engine/horizon/types';
import { buildOpportunities, type BuildCtx } from '@/engine/horizon/rank';
import { filterAndRank, type FilterState } from '../domain/filters';
import { buildMarketPulse, type MarketPulse, type MarketPulseInput } from '../domain/pulse';
import type { Setup } from '../domain/entities';
import type { AnalysisPort } from '../infrastructure/ports';

/**
 * application/usecases — orquestram ports + domain. Sem JSX, sem hooks.
 * Fluxo: Adapter → UseCase → Domain → Hook → UI.
 */

export type FetchPhase = 'instant' | 'universe' | 'done';

export interface FetchCallbacks {
  onPhase: (phase: FetchPhase) => void;
  onProgress: (done: number, total: number) => void;
}

export interface FactsBundle {
  facts: HorizonFacts[];
  instantCount: number;
  universeCount: number;
  skippedNoPair: number;
  skippedShort: number;
  skippedFailed: number;
  firstError: string | null;
}

/**
 * FetchSetups: instantâneo (top-25, segundos) e depois o universo em fundo.
 * O instantâneo vence na deduplicação por símbolo.
 */
export async function fetchSetupsFacts(
  analysis: AnalysisPort,
  instant: HorizonCandidate[],
  universe: HorizonCandidate[],
  cbs: FetchCallbacks,
  signal: AbortSignal,
): Promise<FactsBundle> {
  const seen = new Map<string, HorizonFacts>();
  let instantCount = 0;
  let universeCount = 0;
  let skippedNoPair = 0;
  let skippedShort = 0;
  let skippedFailed = 0;
  let firstError: string | null = null;

  const absorb = (facts: HorizonFacts[], instantWins: boolean) => {
    for (const f of facts) {
      if (instantWins || !seen.has(f.symbol)) seen.set(f.symbol, f);
    }
  };
  const absorbMeta = (r: { skippedNoPair: number; skippedShort: number; skippedFailed: number }) => {
    skippedNoPair += r.skippedNoPair;
    skippedShort += r.skippedShort;
    skippedFailed += r.skippedFailed;
  };

  if (instant.length > 0 && !signal.aborted) {
    cbs.onPhase('instant');
    try {
      const r = await analysis.analyze(
        instant,
        (p) => cbs.onProgress(p.done, p.total),
        signal,
      );
      absorb(r.facts, true);
      absorbMeta(r);
      instantCount = r.facts.length;
    } catch (e) {
      if (!signal.aborted) firstError = e instanceof Error ? e.message : 'Falha na análise';
    }
  }

  if (universe.length > 0 && !signal.aborted) {
    cbs.onPhase('universe');
    try {
      const r = await analysis.analyze(
        universe,
        (p) => cbs.onProgress(p.done, p.total),
        signal,
      );
      absorb(r.facts, false);
      absorbMeta(r);
      universeCount = r.facts.length;
      if (r.errors.length > 0 && !firstError) firstError = `${r.errors[0].symbol} (${r.errors[0].reason})`;
    } catch (e) {
      if (!signal.aborted) firstError = firstError ?? (e instanceof Error ? e.message : 'Falha na análise');
    }
  }

  cbs.onPhase('done');
  return {
    facts: [...seen.values()],
    instantCount, universeCount,
    skippedNoPair, skippedShort, skippedFailed,
    firstError,
  };
}

/** Monta oportunidades a partir dos fatos (fino sobre o engine). */
export function assembleSetups(facts: HorizonFacts[], ctx: BuildCtx): Setup[] {
  return buildOpportunities(facts, ctx);
}

/** FilterSetups + RankSetups: funil mínimo e ordenação (puros, via domain). */
export function rankSetupsView(items: Setup[], f: FilterState): Setup[] {
  return filterAndRank(items, f);
}

/** BuildMarketPulse: pulso semanal/mensal (puro, via domain). */
export function buildMarketPulseView(input: MarketPulseInput | null): MarketPulse | null {
  return buildMarketPulse(input);
}
