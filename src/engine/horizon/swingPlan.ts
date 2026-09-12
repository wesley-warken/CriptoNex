import type { Candle, Signal, TrendLabel } from '@/types';
import { aggregateClosed, floorPivots } from '@/engine/pivots';
import { buildPlan } from '@/engine/scoring/plan';
import { riskReward } from '@/engine/risk';
import type { Scenario, SwingPlan } from './types';

const pct = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;

/**
 * Plano swing LONG-only v1 sobre candles diários: reusa buildPlan (geometria
 * validada: stop do lado certo, alvo oposto) e estende com T3 (R3/S3),
 * zona de entrada [−0.5·ATR, entrada] e cenários com níveis reais.
 * Retorna null quando não há setup válido — a UI mostra "N/A".
 */
export function buildSwingPlan(daily: Candle[], signal: Signal, atr: number | null): SwingPlan | null {
  if (signal === 'NEUTRAL' || daily.length < 10) return null;
  const price = daily.length ? daily[daily.length - 1].close : 0;
  if (!(price > 0)) return null;
  const base = buildPlan(daily, signal, atr);
  if (!base) return null;
  const long = signal === 'BUY';
  const t3 = (() => {
    const agg = aggregateClosed(daily, 5) ?? aggregateClosed(daily, 1);
    if (!agg) return null;
    const pv = floorPivots(agg.high, agg.low, agg.close);
    const raw = long ? pv.r3 : pv.s3;
    if (!(raw > 0)) return null;
    if (long && !(raw > base.target2)) return null;
    if (!long && !(raw < base.target2)) return null;
    return raw;
  })();
  const rr3 = t3 != null ? riskReward(base.entry, base.stop, t3) : null;
  const half = atr != null && atr > 0 ? 0.5 * atr : 0;
  const zoneLow = long ? base.entry - half : base.entry;
  const zoneHigh = long ? base.entry : base.entry + half;
  const entry = base.entry;
  const mk = (low: number | null, high: number | null): string | null => {
    if (low == null || high == null || !(entry > 0)) return null;
    return pct(((high - low) / entry) * 100);
  };
  const scenarios: Scenario[] = [
    {
      name: 'base',
      condition: long ? `Preço se mantém acima de ${base.stop}` : `Preço se mantém abaixo de ${base.stop}`,
      low: entry, high: base.target2, pct: mk(entry, base.target2),
    },
    {
      name: 'bull',
      condition: long ? `Fechamento acima de ${base.target1} abre ${base.target2} → ${t3 ?? '—'}` : `Fechamento abaixo de ${base.target1} abre ${base.target2} → ${t3 ?? '—'}`,
      low: base.target2, high: t3, pct: t3 != null ? mk(base.target2, t3) : null,
    },
    {
      name: 'bear',
      condition: long ? `Perda de ${base.stop} invalida` : `Superação de ${base.stop} invalida`,
      low: long ? base.stop : entry, high: long ? entry : base.stop,
      pct: long ? `−${Math.abs(base.stopPct).toFixed(1)}%` : `−${Math.abs(base.stopPct).toFixed(1)}%`,
    },
  ];
  return {
    ideal: entry, zoneLow, zoneHigh, stop: base.stop,
    t1: base.target1, t2: base.target2, t3,
    rr1: base.rr1, rr2: base.rr2, rr3,
    stopPct: base.stopPct, basis: base.basis, scenarios,
  };
}

export interface InvalidationInput {
  stop: number;
  side: 'long';
  supertrend: 'BULLISH' | 'BEARISH' | null;
  regimeLabel: string;
  rs7: number | null;
  stretchPct: number | null;
}

/** Condições de invalidação com valores reais (nunca genéricas falsas). */
export function buildInvalidation(x: InvalidationInput): string[] {
  const out = [`Fechamento diário ${x.side === 'long' ? 'abaixo' : 'acima'} de ${x.stop} (stop do plano)`];
  if (x.regimeLabel.includes('RISK-OFF')) out.push(`Mercado em ${x.regimeLabel} desfavorece a tese`);
  if (x.supertrend === 'BEARISH' && x.side === 'long') out.push('Supertrend diário baixista contra a entrada');
  if (x.rs7 != null && x.rs7 < 0) out.push(`Força relativa 7d ${x.rs7.toFixed(1)}% — monitorar perda de momentum`);
  if (x.stretchPct != null && x.stretchPct >= 90) out.push('Entrada esticada (percentil ≥90): aguardar pullback em vez de perseguir');
  return out;
}
