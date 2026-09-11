import type { Candle, PlanData, Signal } from '@/types';
import { aggregateClosed, floorPivots } from '@/engine/pivots';

/**
 * Plano de trade direcional a partir de pivôs S/R (mesma lógica do TradePlan
 * do Monitor, extraída para reuso em CPU sobre candles já baixados).
 * Retorna null quando não há setup válido (sem S/R, stop do lado errado,
 * risco nulo ou sinal neutro) — o chamador exibe "sem plano".
 */
export function buildPlan(candles: Candle[], signal: Signal, atr: number | null): PlanData | null {
  if (signal === 'NEUTRAL' || candles.length < 10) return null;
  const price = candles.length ? candles[candles.length - 1].close : 0;
  if (!(price > 0)) return null;
  // Pivô um grau acima do diário (semanal); cai para diário se insuficiente.
  const stats = aggregateClosed(candles, 5) ?? aggregateClosed(candles, 1);
  if (!stats || !(stats.high > stats.low) || !(stats.high > 0) || !(stats.low > 0)) return null;
  const pv = floorPivots(stats.high, stats.low, stats.close);
  const atrStop = atr != null && atr > 0 ? 1.5 * atr : null;
  const long = signal === 'BUY';
  const stop = long
    ? (atrStop != null ? Math.min(pv.s1, price - atrStop) : pv.s1)
    : (atrStop != null ? Math.max(pv.r1, price + atrStop) : pv.r1);
  const t1 = long ? pv.r1 : pv.s1;
  const t2 = long ? pv.r2 : pv.s2;
  if (!(stop > 0) || !(t1 > 0) || !(t2 > 0)) return null;
  // Stop e alvo precisam estar em lados opostos da entrada.
  if (long && !(stop < price && t1 > price)) return null;
  if (!long && !(stop > price && t1 < price)) return null;
  const risk = Math.abs(price - stop);
  if (!(risk > 0)) return null;
  const rr1 = Math.abs(t1 - price) / risk;
  const rr2 = Math.abs(t2 - price) / risk;
  if (!Number.isFinite(rr1) || !Number.isFinite(rr2)) return null;
  return {
    entry: price,
    stop,
    target1: t1,
    target2: t2,
    rr1,
    rr2,
    stopPct: ((stop - price) / price) * 100,
    basis: `pivô ${stats.sessions >= 5 ? 'semanal' : 'diário'}`,
  };
}
