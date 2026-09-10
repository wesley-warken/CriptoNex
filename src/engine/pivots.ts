export interface Pivots {
  p: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

/** Pontos pivô clássicos (floor) a partir de H/L/C do período-base fechado.
 *  R3 = H + 2·(P−L); S3 = L − 2·(H−P) (fórmula clássica). */
export function floorPivots(high: number, low: number, close: number): Pivots {
  const p = (high + low + close) / 3;
  const r1 = 2 * p - low;
  const s1 = 2 * p - high;
  const r2 = p + (high - low);
  const s2 = p - (high - low);
  const r3 = high + 2 * (p - low);
  const s3 = low - 2 * (high - p);
  return { p, r1, r2, r3, s1, s2, s3 };
}

export interface BaseStats {
  high: number;
  low: number;
  close: number;
  sessions: number;
}

/**
 * Agrega os últimos N candles diários FECHADOS (descarta o candle em
 * formação) em H/L/C do período-base. Ex.: N=1 dia, N=5 semana, N=21 mês.
 */
export function aggregateClosed(daily: { high: number; low: number; close: number; time: number }[], n: number): BaseStats | null {
  const closed = daily.filter((c) => c.close > 0).slice(0, -1);
  const window = closed.slice(-n);
  if (!window.length) return null;
  return {
    high: Math.max(...window.map((c) => c.high)),
    low: Math.min(...window.map((c) => c.low)),
    close: window[window.length - 1].close,
    sessions: window.length,
  };
}

export function pivotZone(price: number, pv: Pivots): string {
  if (price >= pv.r3) return 'acima de R3 — extensão de alta';
  if (price >= pv.r2) return 'entre R2 e R3 — pressão vendedora provável';
  if (price >= pv.r1) return 'entre R1 e R2 — testando resistência';
  if (price >= pv.p) return 'entre P e R1 — viés altista no período';
  if (price >= pv.s1) return 'entre S1 e P — viés baixista no período';
  if (price >= pv.s2) return 'entre S2 e S1 — testando suporte';
  if (price >= pv.s3) return 'entre S3 e S2 — pressão compradora provável';
  return 'abaixo de S3 — extensão de baixa';
}
