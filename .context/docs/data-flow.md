# Data Flow — Pulso de Mercado

## Crypto top (tempo real operacional)
Binance REST (klines 1h/4h/1d) + WS miniTicker só p/ visíveis → `useCryptoMarket`
→ candles em memória → `useAnalysis` (regime + scores + interpretações) →
Dashboard/Radar/Opportunities/Monitor.

## Universo crypto (~17k)
CoinGecko `/coins/markets` per_page=250, page=1..N, delay 1,2s, sparkline só
págs 1-2 → IndexedDB `cc.universe.crypto` TTL 10min → boot renderiza cache,
atualiza em background → tabela virtualizada no /radar. 429 → badge
"cache há X min" + backoff exponencial.

## Ações
- B3: seed `src/data/b3-seed.json` + lista Brapi `/api/available` (24h) →
  `cc.universe.stocks.b3`; cotações em lote Brapi (tickers por vírgula).
- EUA: `nasdaqlisted.txt` + `otherlisted.txt` via proxy `/nasdaq` → parse no
  Web Worker → `cc.universe.stocks.us` TTL 24h.
- Global: Yahoo `/v1/finance/lookup` via proxy `/api/ylookup` (fallback
  query2) → qualquer ticker/ETF/índice/moeda. Cotações via `/v8/finance/chart`
  (proxy `/api/yahoo`, fallback query2), cache 60s, só linhas visíveis.

## Notícias e derivativos
- RSS (CoinDesk, Cointelegraph, Decrypt, Bitcoin Magazine) via proxies
  `/api/rss-*` → parse + tags de moedas → `/news` com busca/filtros.
- Futuros Binance (sem chave): funding, open interest, long/short global e
  taker ratio → `/derivatives`.
- Alertas de preço custom (`cc.user.alerts`) avaliados por `AlertChecker`
  global com som + toast.
- Varreduras combinadas (`cc.user.customScans`): condições por indicador
  avaliadas sobre klines Binance com cache 5min (`engine/scanConditions.ts`).
- Topo/fundo: posição no ciclo 0–100% (`engine/cycle.ts`) + padrões
  gráficos (`engine/patterns.ts`) no Top Hunter.
- Money Flow: CMF(20) diário (Binance spot) na página Fluxo.
- Notícias: RSS + sentimento 1–10 heurístico + tradução MyMemory sob demanda.

## Proxies dev (`vite.config.ts`)
`/api/coingecko`, `/api/yahoo`, `/api/ylookup`, `/api/reddit`, `/nasdaq`.
Sem backend: tudo com timeout 12s, retry com teto, fallback e estado de erro.
