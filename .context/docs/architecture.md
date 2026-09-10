# Architecture — Pulso de Mercado

```
src/
  components/layout/Shell.tsx   # sidebar + header (busca global, Crypto|Stocks, mute, tema, avatar)
  components/ui/kit.tsx         # Panel, Stat, Badge, Empty, ErrorBox, Skeleton
  components/charts/            # Sparkline, CandleChart (lightweight-charts), Fullscreen
  components/analysis/          # ScoreAudit (modal auditável do score)
  pages/                        # 16 páginas, uma por rota
  services/providers/           # binance.ts, coingecko.ts, sentiment.ts, stocks.ts, assets.ts, lookup.ts, brapi.ts, nasdaq.ts
  services/cache/               # cache 60s em memória + snapshot localStorage + fetchWithTimeout + retry
  services/market.ts            # useCryptoMarket (top 25 + candles)
  services/universe.ts          # useUniverseCrypto (17k moedas, paginado, background)
  services/universeStocks.ts    # useUniverseStocks (B3 + EUA)
  engine/indicators|signals|scoring|regime|ranking|backtesting|risk
  stores/useStore.ts            # Zustand persist cc.user (settings, favs, watchlist, aportes, setores)
  lib/format.ts|utils.ts|alerts.ts|useAnalysis.ts|idb.ts
  workers/parseStocks.ts        # parse TSV Nasdaq em Web Worker
```

Regras: UI nunca chama HTTP direto (só via services); pesos de scoring só em
`engine/scoring/scoring.config.ts`; sem `any` sem justificativa; todo painel de
dados tem estados loading/empty/error/stale + retry; nunca inventar dados.
