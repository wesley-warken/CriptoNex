/**
 * Volume de Atenção: detecta movimentações atípicas de preço.
 *
 * Compara a variação de hoje com a média (em módulo) das últimas 10 barras
 * diárias. Se hoje andou ≥2× essa média — para cima ou para baixo —, a moeda
 * entra em atenção: algo fora do padrão está acontecendo (não é recomendação
 * de investimento, é um alerta para olhar o gráfico com mais cuidado).
 */

export const ATTENTION_LOOKBACK = 10;
export const ATTENTION_RATIO = 2;

export interface AttentionSignal {
  /** Variação de hoje (%) */
  todayPct: number;
  /** Média das |variações| das últimas 10 barras (%) */
  avg10: number;
  /** |hoje| / média — ≥2 é atípico */
  ratio: number;
  dir: 'up' | 'down' | 'flat';
  unusual: boolean;
}

export function unusualMove(closes: number[], lookback = ATTENTION_LOOKBACK, threshold = ATTENTION_RATIO): AttentionSignal | null {
  const clean = closes.filter((v) => v > 0);
  if (clean.length < lookback + 2) return null;
  const window = clean.slice(-(lookback + 2));
  const pcts: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1];
    if (!prev) return null;
    pcts.push((window[i] / prev - 1) * 100);
  }
  // pcts tem lookback+1 entradas: as `lookback` primeiras formam a base, a última é hoje
  const baseline = pcts.slice(0, lookback);
  const today = pcts[pcts.length - 1];
  const avg = baseline.reduce((a, b) => a + Math.abs(b), 0) / lookback;
  const ratio = avg < 1e-9 ? (Math.abs(today) < 1e-9 ? 0 : 99) : Math.abs(today) / avg;
  return {
    todayPct: today,
    avg10: avg,
    ratio,
    dir: today > 0 ? 'up' : today < 0 ? 'down' : 'flat',
    unusual: ratio >= threshold,
  };
}
