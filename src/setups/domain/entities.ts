import type { HorizonKey } from '@/engine/horizon/horizons';
import type { SetupKind } from '@/engine/horizon/setups';
import type { HorizonOpportunity, Liquidity, RegimeFit } from '@/engine/horizon/types';

/**
 * domain/entities — entidades puras do dashboard de setups.
 * Sem React, sem API, sem IO. Reaproveita os tipos canônicos do engine
 * (já puros) e acrescenta só o vocabulário que a tela minimalista exige:
 * qualidade fundida com score, tom de regime e direção da tese.
 */

/** Oportunidade ranqueada (alias do tipo canônico do engine). */
export type Setup = HorizonOpportunity;

export type { HorizonKey, SetupKind, Liquidity, RegimeFit };

/** Qualidade fundida com score: Todos (piso) / Forte 70+ / Elite 80+. */
export type Quality = 'elite' | 'forte' | 'base';

/** Piso de score: abaixo disso a lista prefere ficar vazia a forçar setup. */
export const SCORE_FLOOR = 60;
export const SCORE_FORTE = 70;
export const SCORE_ELITE = 80;

export function qualityOf(score: number): Quality {
  if (score >= SCORE_ELITE) return 'elite';
  if (score >= SCORE_FORTE) return 'forte';
  return 'base';
}

/** Tom do regime para o badge de texto com dot (sem gauge). */
export type RegimeTone = 'on' | 'off' | 'flat';

export function classifyRegime(label: string): RegimeTone {
  if (label.includes('RISK-ON')) return 'on';
  if (label.includes('RISK-OFF')) return 'off';
  return 'flat';
}

/**
 * Direção da tese para colorir sinal e score (linhas nunca têm tint).
 * aligned: vento a favor (regime favorável + demanda comprovada).
 * against: contra o vento (regime contra).
 * neutral: resto.
 */
export type ThesisDirection = 'aligned' | 'against' | 'neutral';

export function thesisDirection(o: Pick<Setup, 'regimeFit' | 'demandPass'>): ThesisDirection {
  if (o.regimeFit === 'favoravel' && o.demandPass) return 'aligned';
  if (o.regimeFit === 'contra') return 'against';
  return 'neutral';
}

/** Predicado componível sobre setups (base do funil mínimo). */
export type Predicate = (o: Setup) => boolean;

export function all(...ps: Predicate[]): Predicate {
  return (o) => ps.every((p) => p(o));
}

export function any(...ps: Predicate[]): Predicate {
  return (o) => ps.some((p) => p(o));
}
