import { classifyRegime, type RegimeTone } from './entities';

/**
 * domain/pulse — monta o pulso do mercado (7d semanal, 30d mensal) de forma
 * pura. Formatação de números fica na presentation; aqui só decisão e tom.
 */

export interface PulseLegInput {
  ret7d: number | null;
  ret30d: number | null;
  trend30: string | null;
}

export interface PulseLeg extends PulseLegInput {
  up7d: boolean | null;
  up30d: boolean | null;
}

export interface MarketPulseInput {
  btc: PulseLegInput;
  br: PulseLegInput;
  us: PulseLegInput;
  breadth: number;
  regimeLabel: string;
}

export type BreadthTone = 'alta' | 'baixa' | 'neutra';

export function breadthTone(breadth: number): BreadthTone {
  if (breadth >= 55) return 'alta';
  if (breadth <= 45) return 'baixa';
  return 'neutra';
}

export interface MarketPulse {
  btc: PulseLeg;
  br: PulseLeg;
  us: PulseLeg;
  breadth: number;
  breadthTone: BreadthTone;
  regimeLabel: string;
  regimeTone: RegimeTone;
}

const leg = (x: PulseLegInput): PulseLeg => ({
  ...x,
  up7d: x.ret7d == null ? null : x.ret7d >= 0,
  up30d: x.ret30d == null ? null : x.ret30d >= 0,
});

/** Nulo quando não há dado suficiente para decidir (tela mostra "—"). */
export function buildMarketPulse(input: MarketPulseInput | null): MarketPulse | null {
  if (!input) return null;
  return {
    btc: leg(input.btc),
    br: leg(input.br),
    us: leg(input.us),
    breadth: input.breadth,
    breadthTone: breadthTone(input.breadth),
    regimeLabel: input.regimeLabel,
    regimeTone: classifyRegime(input.regimeLabel),
  };
}
