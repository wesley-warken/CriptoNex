/** Correlação de Pearson entre séries de retornos. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function returns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push(closes[i] / closes[i - 1] - 1);
  }
  return out;
}

export function correlationMatrix(series: Record<string, number[]>): { symbols: string[]; matrix: (number | null)[][] } {
  const symbols = Object.keys(series);
  const rets = Object.fromEntries(symbols.map((s) => [s, returns(series[s])]));
  const matrix = symbols.map((a) => symbols.map((b) => (a === b ? 1 : pearson(rets[a], rets[b]))));
  return { symbols, matrix };
}
