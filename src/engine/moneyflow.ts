import type { Candle } from '@/types';

/**
 * Chaikin Money Flow (padrão 20): mede pressão de compra/venda pelo fluxo
 * de volume. +1 = toda pressão compradora, −1 = toda vendedora.
 */
export function cmf(candles: Candle[], period = 20): number | null {
  const win = candles.filter((c) => c.close > 0 && c.volume > 0).slice(-period);
  if (win.length < period) return null;
  let mfvSum = 0;
  let volSum = 0;
  for (const c of win) {
    const range = c.high - c.low;
    const mfm = range > 0 ? ((c.close - c.low) - (c.high - c.close)) / range : 0;
    mfvSum += mfm * c.volume;
    volSum += c.volume;
  }
  if (!volSum) return null;
  return mfvSum / volSum;
}

export interface FlowRow {
  symbol: string;
  cmf: number;
  price: number;
  change24h: number | null;
}

/** Interpretação direta do CMF para exibição. */
export function cmfLabel(v: number): string {
  if (v >= 0.2) return 'acumulação forte';
  if (v >= 0.05) return 'compra leve';
  if (v <= -0.2) return 'distribuição forte';
  if (v <= -0.05) return 'venda leve';
  return 'neutro';
}
