# Testing Strategy — Pulso de Mercado

- Vitest (`npm run test`, include `src/**/*.test.ts`).
- Motor analítico (`src/engine/engine.test.ts`): SMA/EMA/RSI, Supertrend,
  snapshot, signals, scoring+breakdown, regime, backtest sem look-ahead.
- Parsers de universo (`src/services/universe.test.ts`): TSV Nasdaq
  (pipe, footer File Creation Time), normalize do Yahoo lookup
  (quoteType → kind), merge de páginas CoinGecko (dedupe por id),
  filtro ativas/stablecoins, chunking de lote Brapi.
- Build (`npm run build`) como gate: tsc --noEmit precisa zerar erros.
- Smoke manual: /radar com >10k linhas sem travar; busca "shiba";
  /stocks B3+EUA; lookup TSM, PETR4.SA, ^BVSP, GC=F, EURUSD=X, VWRA.L.
