import { TREND_LEVEL, type TrendState } from '@/engine/trend';
import type { SetupKind } from './types';

export type { SetupKind };

export interface SetupInput {
  trendW: TrendState | null;
  trendD: TrendState | null;
  rsiD: number | null;
  macdBull: boolean | null;
  volRatio: number | null;
  atrPct: number | null;
  /** Percentil 0–100 do desvio vs SMA20 (null = desconhecido). */
  stretchPct: number | null;
  /** (máxima 20d/preço − 1) em % (null = desconhecido). */
  distHigh20Pct: number | null;
}

export interface ClassifiedSetup {
  kind: SetupKind;
  reasons: string[];
}

export const SETUP_LABELS: Record<SetupKind, string> = {
  'trend-continuation': 'Tendência (continuação)',
  pullback: 'Pullback em tendência',
  breakout: 'Rompimento',
  momentum: 'Momentum',
  reversal: 'Reversão',
  watch: 'Observação',
};

/**
 * Classificação LONG-only v1 (documentado): os 4 setups robustos exigem
 * contexto altista semanal/diário; fora disso, Observação. Ordem de
 * prioridade: continuação > pullback > rompimento > momentum > reversão.
 * Esticado (stretch ≥ p90) bloqueia continuation/pullback (perseguição).
 */
export function classifySetup(x: SetupInput): ClassifiedSetup {
  const lvlW = x.trendW == null ? -1 : TREND_LEVEL[x.trendW];
  const lvlD = x.trendD == null ? -1 : TREND_LEVEL[x.trendD];
  const rsi = x.rsiD;
  const vol = x.volRatio ?? 0;
  const stretched = (x.stretchPct ?? 0) >= 90;
  const rsiTxt = rsi == null ? 'RSI indisponível' : `RSI diário ${rsi.toFixed(0)}`;
  const volTxt = x.volRatio == null ? 'volume indisponível' : `volume ${x.volRatio.toFixed(1)}× a média`;

  if (lvlW >= 3 && lvlD >= 3 && rsi != null && rsi >= 50 && rsi <= 70 && !stretched) {
    return {
      kind: 'trend-continuation',
      reasons: [`Tendência semanal ${x.trendW}`, `Tendência diária ${x.trendD}`, `${rsiTxt} em zona saudável`, volTxt],
    };
  }
  if (lvlW >= 3 && lvlD <= 2 && lvlD >= 0 && rsi != null && rsi < 55 && !stretched) {
    return {
      kind: 'pullback',
      reasons: [`Tendência semanal ${x.trendW} intacta`, `Diário em desconto (${x.trendD})`, rsiTxt, volTxt],
    };
  }
  if (lvlD >= 3 && x.distHigh20Pct != null && x.distHigh20Pct <= 2 && vol >= 1.5) {
    return {
      kind: 'breakout',
      reasons: [`A ${x.distHigh20Pct.toFixed(1)}% da máxima de 20 dias`, `Tendência diária ${x.trendD}`, volTxt],
    };
  }
  if (rsi != null && rsi >= 60 && x.macdBull === true && vol >= 1.5) {
    return {
      kind: 'momentum',
      reasons: [`${rsiTxt} com força`, 'MACD comprado', volTxt],
    };
  }
  if (lvlW <= 1 && lvlW >= 0 && lvlD >= 3 && rsi != null && rsi >= 30 && rsi <= 60 && (x.stretchPct ?? 100) < 60 && vol >= 1.0) {
    return {
      kind: 'reversal',
      reasons: [`Fundo contra tendência semanal ${x.trendW}`, `Diário ${x.trendD} com fôlego`, rsiTxt, volTxt],
    };
  }
  const why: string[] = [];
  if (lvlW >= 0) why.push(`Semanal ${x.trendW}`);
  if (lvlD >= 0) why.push(`diário ${x.trendD}`);
  why.push(rsiTxt);
  if (stretched) why.push('esticado: aguardar pullback');
  return { kind: 'watch', reasons: why.length ? why : ['Sem estrutura clara'] };
}
