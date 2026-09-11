import type { Candle, ConfluenceData, OpportunityScore, Signal, TrendLabel } from '@/types';
import { snapshot } from '@/engine/indicators';

/**
 * Direção de um timeframe via Supertrend + SMA50×200 (fallbacks EMA/SMA20).
 * Pura em CPU sobre candles já baixados — sem requests.
 */
export function tfDirection(candles: Candle[]): TrendLabel {
  if (candles.length < 30) return 'NEUTRAL';
  const s = snapshot(candles);
  const price = candles.length ? candles[candles.length - 1].close : 0;
  const cross: TrendLabel | null =
    s.sma50 != null && s.sma200 != null
      ? (s.sma50 > s.sma200 ? 'BULLISH' : 'BEARISH')
      : s.ema12 != null && s.ema26 != null
        ? (s.ema12 > s.ema26 ? 'BULLISH' : 'BEARISH')
        : s.sma20 != null && price > 0
          ? (price > s.sma20 ? 'BULLISH' : 'BEARISH')
          : null;
  if (s.supertrend && cross) return s.supertrend === cross ? s.supertrend : 'NEUTRAL';
  return s.supertrend ?? cross ?? 'NEUTRAL';
}

/** Escore de confluência 0–15: acordo direcional vale 15, indefinição 5, divergência 0. */
export function confluenceScore(a: TrendLabel, b: TrendLabel): number {
  if (a === 'NEUTRAL' || b === 'NEUTRAL') return 5;
  return a === b ? 15 : 0;
}

function dirWord(d: TrendLabel): string {
  return d === 'BULLISH' ? 'altista' : d === 'BEARISH' ? 'baixista' : 'neutra';
}

/**
 * Aplica confluência a um score pronto: soma bônus (teto 100), anexa
 * ConfluenceData e registra o motivo em why/risks. Não re-scoring.
 */
export function applyConfluence(
  base: OpportunityScore,
  tfA: string,
  dirA: TrendLabel,
  tfB: string,
  dirB: TrendLabel,
): OpportunityScore {
  const bonus = confluenceScore(dirA, dirB);
  const agree = dirA !== 'NEUTRAL' && dirA === dirB;
  const conf: ConfluenceData = { tfA, dirA, tfB, dirB, full: agree, bonus };
  const why = [...base.why];
  const risks = [...base.risks];
  if (agree) why.push(`✓ Confluência ${tfA}+${tfB} ${dirWord(dirA)}`);
  else if (dirA !== 'NEUTRAL' && dirB !== 'NEUTRAL' && dirA !== dirB)
    risks.push(`⚠ Divergência ${tfA} (${dirWord(dirA)}) vs ${tfB} (${dirWord(dirB)})`);
  return {
    ...base,
    score: Math.max(0, Math.min(100, base.score + bonus)),
    confluence: conf,
    why,
    risks,
  };
}

/** Sinal esperado a partir de direção de TF (para gates de tier). */
export function signalOfDir(d: TrendLabel): Signal | null {
  return d === 'BULLISH' ? 'BUY' : d === 'BEARISH' ? 'SELL' : null;
}
