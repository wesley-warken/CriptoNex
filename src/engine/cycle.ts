import type { Candle } from '@/types';
import { calcRSI } from '@/engine/indicators';

export type CycleZone = 'acumulacao' | 'neutra' | 'euforia' | 'topo-risco';

export interface CycleReading {
  /** 0–100: posição do preço dentro do range [mín, máx] da janela */
  pct: number;
  zone: CycleZone;
  drawdownFromHigh: number;
  windowLabel: string;
  note: string;
}

export function zoneOf(pct: number): CycleZone {
  if (pct >= 90) return 'topo-risco';
  if (pct >= 70) return 'euforia';
  if (pct <= 20) return 'acumulacao';
  return 'neutra';
}

const ZONE_NOTE: Record<CycleZone, string> = {
  'acumulacao': 'Preço próximo às mínimas da janela — região onde fundos costumam se formar. Probabilidade, não certeza.',
  'neutra': 'Preço no meio do range — sem extremo de ciclo.',
  'euforia': 'Preço próximo às máximas — euforia crescente, suba o stop e reduza alavancagem.',
  'topo-risco': 'Topo do range atingido — historicamente região de fim de ciclo e reversões. Probabilidade, não previsão.',
};

/**
 * Posição de ciclo: onde o preço atual está dentro do range da janela.
 * Equivalente funcional honesto ao "percentual de topo/fundo": 100% = máxima
 * da janela (alerta de possível fim de ciclo), 0% = mínima (possível fundo).
 */
export function cycleReading(candles: Candle[], windowLabel: string): CycleReading | null {
  const closes = candles.map((c) => c.close).filter((c) => c > 0);
  if (closes.length < 10) return null;
  const last = closes[closes.length - 1];
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);
  if (hi <= lo) return null;
  const pct = Math.round(((last - lo) / (hi - lo)) * 100);
  const zone = zoneOf(pct);
  return {
    pct,
    zone,
    drawdownFromHigh: ((last / hi - 1) * 100),
    windowLabel,
    note: ZONE_NOTE[zone],
  };
}

/** Série para o gráfico de área colorido por zona (laranja = quente, cinza = frio). */
export function cycleSeries(candles: Candle[], span: number): { time: number; price: number; pct: number }[] {
  const closes = candles.map((c) => ({ time: c.time, close: c.close })).filter((c) => c.close > 0);
  const win = closes.slice(-span);
  if (win.length < 10) return [];
  const hi = Math.max(...win.map((c) => c.close));
  const lo = Math.min(...win.map((c) => c.close));
  return win.map((c) => ({
    time: c.time,
    price: c.close,
    pct: hi <= lo ? 50 : Math.round(((c.close - lo) / (hi - lo)) * 100),
  }));
}

export function rsiMood(candles: Candle[]): string {
  const rsi = calcRSI(candles);
  if (rsi == null) return '—';
  if (rsi >= 70) return `Sobrecomprado (${rsi.toFixed(0)})`;
  if (rsi <= 30) return `Sobrevendido (${rsi.toFixed(0)})`;
  return `Neutro (${rsi.toFixed(0)})`;
}
