const QUOTES = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USD', 'BRL', 'EUR', 'GBP'];
const ALIASES: Record<string, string> = { XBT: 'BTC' };

/**
 * Identidade canônica do instrumento econômico: BTC, BTCUSDT, BTC-USD e
 * XBTUSD colapsam para BTC; PETR4.SA e PETR4 colapsam para PETR4.
 * Tickers de índice (^BVSP) são preservados. Pares FX (EURUSD=X) reduzem
 * à moeda base — limitação documentada (não usar para P&L de FX).
 */
export function canonicalSymbol(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (t.startsWith('^')) return t;
  let s = t.replace(/[\s\-/]/g, '').replace(/=[A-Z]$/, '').replace(/\.[A-Z]{1,4}$/, '');
  // Corta a quote que deixa a maior base (evita 'XBTUSD'→'XB' via TUSD;
  // base mínima de 2 chars preserva stablecoins como 'BUSD'/'TUSD').
  let best = '';
  for (const q of QUOTES) {
    if (s.endsWith(q) && s.length - q.length >= 2) {
      const base = s.slice(0, -q.length);
      if (base.length > best.length) best = base;
    }
  }
  if (best) s = best;
  return ALIASES[s] ?? s;
}
