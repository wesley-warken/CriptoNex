# Pulso de Mercado — Registro de Progresso

> Última atualização: 09/09/2026

---

## Resumo Executivo

Aplicação local de análise de criptos e ações com 19 páginas funcionais, 4 temas, 4 feeds de dados, motores de análise técnica completos, portfólio v2 com operações, alertas, social, notícias com sentimento, bubbles 3D com layout d3-pack, e radar com virtualização.

---

## ✅ Concluído (F0–F17)

### Infraestrutura
- [x] Vite 6 + React 18 + TypeScript strict + Tailwind 3.4
- [x] shadcn/ui componentes base
- [x] Zustand 5 (persist) para estado global
- [x] TanStack Virtual para virtualização
- [x] Recharts + lightweight-charts + D3 para gráficos
- [x] Lucide icons + date-fns + idb-keyval
- [x] 4 temas CSS (glass/light/neon/brutal) via variáveis CSS
- [x] Build produção: `vite build` verde (~1MB JS, ~15KB CSS)
- [x] TypeScript: `tsc --noEmit` limpo

### Motor de Análise Técnica
- [x] Indicadores: SMA/EMA/RSI/MACD/ADX/ATR/Stochastic/CCI/WILLR/WilliamsR/Bollinger Bands/Volume Profile/Pivot Points
- [x] Sinais: buy/sell/neutral baseados em cruzamento e divergência
- [x] Scoring: 8 dimensões (Trend 20, Momentum 20, RS 15, Volume 15, RSI 10, MACD 10, Volatility 5, Regime 5) — config centralizada em `scoring.config.ts`
- [x] Regime de mercado: trend/range/transition
- [x] Ranking: ordenação por score com filtros
- [x] Backtesting engine
- [x] Padrões de candle: double top/bottom, channel, breakout, RSI divergence
- [x] Ciclo de mercado: 0–100% com detecção de fase
- [x] Money flow CMF
- [x] Scan conditions (múltiplas condições)
- [x] Correlação entre ativos
- [x] Pivot Points (floor pivots S1–S3 / R1–R3, agregados semanais/mensais)

### Páginas
- [x] Dashboard: Fear & Greed gauge, BTC dominance sparkline, gold, dollar, overview cards
- [x] Radar: 13 abas de indicadores, top-100 cache 1h, MarketStrip (F&G + dominance + gold + dollar)
- [x] Monitor: crypto (Binance) + stocks (Yahoo), pivots overlay, MTF trends, Trade Plan (entry/stop 1.5×ATR/targets R:R), search bar
- [x] Portfólio v2: operações (buy/sell), wallets, método Standard vs Investor, FX conversion (USD/BRL/EUR/GBP)
- [x] Alertas: price alerts + conditional scans
- [x] Notícias: sentimento, tradução (MyMemory), thumbnails RSS (CoinDesk/Cointelegraph/Decrypt/Bitcoin Magazine)
- [x] Social: category treemap com dados Reddit
- [x] DeepChart: correlação + conversor de moedas
- [x] Opportunities: ranking segmentado (All/Crypto/B3/EUA/Mine) com auto-scan
- [x] TopHunter: ciclo 0–100%, detecção de padrões, EMA9×26/12 crosses, volume spike
- [x] Universo Completo Crypto: 17k+ coins via CoinGecko paginado (500ms delay, rate-limited), cached em IDB, virtualized Radar

### Ações
- [x] B3: ~1,977 tickers (Brapi available + Yahoo fallback)
- [x] EUA: ~13,189 tickers (nasdaqlisted + otherlisted TSV parsed em Web Worker)
- [x] Scanner com progresso, cache, resume
- [x] Brapi batch quotes com fallback queue
- [x] Yahoo quotes com auto-detection (.SA / US tickers)
- [x] Rate limiter compartilhado (per-host backoff) — `rateLimit.ts`
- [x] IndexedDB via idb-keyval para universos, scores, quotes, dominance history
- [x] Company logos: `logos.ts` + `company-domains.json` (~170 tickers) → Google favicon com fallback avatar-letter

### Bubbles
- [x] CoinGecko → CoinPaprika → CoinLore triple fallback feed
- [x] Segmentos: CRYPTO / EUA / BRASIL com d3-pack layout
- [x] Perf/Size toggle (sqrt scaling para dimensão do círculo)
- [x] Radial-gradient glow style
- [x] Company logos para stocks (Google favicon via `companyLogo()`)
- [x] Crypto images (CoinGecko image ou CoinCap CDN)
- [x] Rank pagination

### Testes
- [x] 59/59 testes passando (universe types, portfolio/fx, engine indicators, rate limiting, scan ordering, patterns, cycle, bubbles, logos, news, scan conditions)

---

## 🔧 Em Andamento

### Radar — RSI multi-timeframe (1h/4h/1d/1s + AVG) com filtros
- [x] Novo `src/services/rsiTable.ts`: RSI(14)+AVG via Binance 1h/4h/1d/1s, IDB 1h, probe único, fallback CoinGecko p/ 1d (09/09/2026)
- [x] Colunas Moeda/Rank/Preço/8 RSIs coloridos (<30 vermelho, >70 verde, resto âmbar), ordenação em todas
- [x] Modal Filtrar: coluna + operador (≥/≤/>/<) + valor, ex. "4h ≥ 70"
- [x] Fallback 100% CoinGecko (Binance bloqueada): 1d do diário, 1s do diário reamostrado, 1h/4h do horário + preenchimento progressivo + aviso "Binance fora" (09/09/2026)
- [x] 5 testes novos — 69/69 passando, `tsc` limpo

### Radar — Rank oficial CoinGecko (não mais calculado local)
- [x] `UniverseCoin.rank` via `market_cap_rank`; Rank/TopN usam oficial com fallback local (09/09/2026)

### Radar — Performance com setinhas de ordenação
- [x] Colunas 1h/24h/7d/30d/1a/Preço clicáveis (▼ maiores → ▲ menores), seta ⇅ sempre visível (09/09/2026)

### Monitor absurdamente mais rápido (fetch condicional + SWR)
- [x] `planMonitorData`: busca SÓ o que os filtros ativos exigem (1h/4h sempre do spark; semanal só se usado; MA-250 só com filtro de médias) — padrão cai de ~4 para ~1 call/moeda (10/09/2026)
- [x] Stale-while-revalidate em `coinHistory`/`coinHistoryHours`/`getIntervalKlines`: dado morno serve na hora + atualiza em background
- [x] Título mostra "avaliado em Xs"; 1 teste novo — 98/98 passando, `tsc` limpo

### Intradiário instantâneo via sparkline (sem fetch por moeda)
- [x] Universo com sparkline em todas as páginas; Tendência 1h/4h, RSI/Stoch/BB/Super 1h/4h calculados localmente na hora (10/09/2026)
- [x] Rede agora só para diário/semanal (multi-fonte + cache); Monitor usa spark p/ 1h/4h
- [x] 2 testes novos (`coinTrendIntraday`) — 97/97 passando, `tsc` limpo

### Health-check por provedora (cascata somava timeouts)
- [x] 1 probe leve (Kraken Time / Coinbase ticker) decide por 5min; provedora morta é pulada sem custo por moeda; timeouts 8s → 6s (10/09/2026)
- [x] `tsc` limpo, 95/95 passando

### Klines multi-fonte (Binance→Kraken→Coinbase→CoinGecko)
- [x] Novo `src/services/providers/multiKlines.ts`: sem key, com cooldown compartilhado e probe barato (10/09/2026)
- [x] Todas as abas (Tendência/Stoch/RSI/Super/BB/SMA/EMA/Monitor) usam as 4 fontes; carga distribuída em vez de 1 API sobrecarregada
- [x] Fases por streaming: as 100 primeiras aparecem primeiro, 101–200 e 201–300 entram em seguida com progresso
- [x] 4 testes novos (parsers com dados reais) — 95/95 passando, `tsc` limpo

### Travamento em 104/200 (lote congelado)
- [x] Causa: espera ilimitada no rate-limit da CoinGecko (espiral de 429 segurava o lote inteiro) (10/09/2026)
- [x] `tryAcquire` com prazo (8s): sem vez, a moeda vira "—" e o lote anda; preenche no refresh/cache
- [x] Cache de klines 1h → 2h (menos tempestades de refetch)
- [x] 2 testes novos — 91/91 passando, `tsc` limpo

### Performance Top 200/300 (lentidão após as 100)
- [x] Cooldown único da Binance compartilhado (maDaily não paga mais 8s de timeout por moeda) (10/09/2026)
- [x] Lotes maiores (12/8 em vez de 4/6): rápidos não ficam presos atrás dos lentos
- [x] Pelotão Top N memoizado (sem reordenar 6k moedas a cada tick de progresso)
- [x] `tsc` limpo, 89/89 passando

### Busca de ativos instantânea + Top N em todos os radares
- [x] `useLookup` local-primeiro: crypto + B3 + EUA na hora, Yahoo complementa dedupado (Monitor, busca global e Portfólio) (10/09/2026)
- [x] Top 100/200/300/Todas global em todas as abas (klines: Todas=300; universo puro: todas mesmo)
- [x] 3 testes novos — 89/89 passando, `tsc` limpo

### Radar — Monitor UX no padrão referência
- [x] Toolbar Indicadores: Business/Realtime com ícones, ★ favoritas, funil (filtros), ☰ (novo alerta), expandir, atualizar (10/09/2026)
- [x] Abas em estilo sublinhado; feed com ícone da moeda, sem coluna Data no Business, ações gráfico/info
- [x] `tsc` limpo, 86/86 passando

### Radar — Monitor com Business/Realtime + filtros prontos e personalizados
- [x] Novo `src/engine/monitor.ts`: 10 filtros prontos (Pullback em Alta, Sobrevenda, Sobrecompra, Golden/Death Cross, AltMomentum, Washout, Reversão Bearish, Supertrend 4h, Estocástico) + motor de condições (tendência/RSI/stoch/MACD/supertrend/atenção/médias × 1h/4h/1d/1s, junção AND) (10/09/2026)
- [x] Feed Data/Moeda/Descrição com toggle Business (tudo ativo) / Realtime (últimos 90min, "há X min"), linhas coloridas por filtro
- [x] Construtor de filtro próprio: nome + ícone + cor + descrição + N condições; ativos/inativos e exclusão; persistido no store
- [x] 5 testes novos — 86/86 passando, `tsc` limpo

### Radar — SMA/EMA com popup de configuração + cruzamentos
- [x] Clicar em SMA/EMA abre "Selecione uma opção": Price Cross + fast 9/12/26/50/100, com busca (10/09/2026)
- [x] Colunas Moeda/Preço Atual + cruzamentos da rápida vs 12/26/50/100/200 (Acima/Abaixo), ordenáveis
- [x] `src/services/maTable.ts`: SMA/EMA 9–200 (250 candles, cache 1h, 1d/1h/4h) + 4 testes
- [x] `tsc` limpo, 81/81 passando

### Radar — Bollinger no padrão referência + seletor de tempo gráfico
- [x] Colunas Moeda/Rank/Preço Atual/Cruzando Banda Superior/Cruzando Banda Inferior (Acima/Abaixo), 1d diário + 1h/4h via klines (10/09/2026)
- [x] Seletor 1h/4h/1d agora em Tendência, Stoch e Bollinger
- [x] `tsc` limpo, 77/77 passando

### Radar — Volume de Atenção (movimentos atípicos ≥2× média 10d)
- [x] Novo `src/engine/attention.ts`: hoje vs média em módulo das últimas 10 barras; pílulas ↑/↓ ×média ou Normal (09/09/2026)
- [x] Colunas Moeda/Rank/Preço/Hoje/Média 10d/× Média/Status/Vol 24h, ordenação em Hoje e × Média
- [x] 4 testes novos — 77/77 passando, `tsc` limpo

### Radar — Stoch Rápido/Lento + Supertrend multi-timeframe
- [x] Stoch: colunas Moeda/Rank/Rápido(%K)/Lento(%D)/Status Rápido/Status Lento (Sobrevendido <20, Sobrecomprado >80), com seletor 1h/4h/1d (09/09/2026)
- [x] Supertrend: Valor + Tendência (Alta/Baixa) em 1h/4h/1d/1s; `calcSupertrendFull` retorna direção + nível; ordenação por direção
- [x] 1 teste novo — 73/73 passando, `tsc` limpo

### Radar — Tendência com seletor 1 hora / 4 horas / 1 dia
- [x] Motor generalizado (`coinTrendFromLegs`/`coinTrendFromCloses`): 1h → curto 4h/médio 24h/longo 7d; 4h → curto 24h/médio 7d/longo 30d; 1 dia mantém 1h/24h/7d/30d (09/09/2026)
- [x] Klines 1h/4h reutilizando o cache da aba RSI + fallback CoinGecko horário, top-100 com progresso
- [x] Ordenação e filtros respeitam o tempo gráfico ativo
- [x] 3 testes novos — 72/72 passando, `tsc` limpo

### Radar — Tendência multi-timeframe (estilo referência)
- [x] Novo `src/engine/trend.ts`: estados Alta Forte/Alta/Neutro/Baixa/Baixa Forte com limites ×√t, cadeia 1h→24h→7d→30d e deltas de mudança (09/09/2026)
- [x] Colunas Moeda/Rank/Curto/Médio/Longo/Mudança(C/M/L) com pílulas coloridas e ordenação em todas
- [x] 5 testes novos — 64/64 passando, `tsc` limpo
- **Status**: Corrigido, precisa recarregar a página para validação visual

### Radar — Abas de indicadores mostravam "—" (travava em "calculando 12/100")
- **Problema**: `ensureTopKlines` só buscava na Binance direta (sem proxy, sem retry útil, sem fallback) — 451/429/timeout → tudo null → "—" em BTC/ETH inclusive
- **Correções aplicadas (09/09/2026)**:
  - [x] Probe Binance (1 request decide; se falhar, pula Binance por 5min em vez de pagar 100 timeouts)
  - [x] Fallback CoinGecko `market_chart` → pseudo-candles (RSI/MACD/SMA/EMA/BB exatos; Stoch/Supertrend aproximados via range sintético ±0,05%)
  - [x] Cobre stablecoins (USDT/USDC sem par USDT) e Binance bloqueada
  - [x] `tsc --noEmit` limpo, 59/59 testes passando
- **Status**: Corrigido, precisa recarregar a página e abrir a aba Stoch para validação visual

### Bubbles Brasil/EUA — Tamanho Uniforme
- **Problema**: Círculos apareciam com tamanhos praticamente uniformes
- **Causa identificada**:
  1. `extraBR` enrichment processava apenas 60 tickers → outros 90 nunca recebiam dados Yahoo
  2. Sem enrichment, `c7d`/`c30d`/`c1y` eram null → `chg()` retornava null → `v = 0` → `maxV = 0.01` → todo tamanho = 1
  3. Dependency `[seg, rowsBR.length > 0]` impedia re-execução quando `rowsBR` atualizava
- **Correções aplicadas (09/09/2026)**:
  - [x] Enrichment expandido para todos os 150 tickers (não apenas 60)
  - [x] Ref `enrichedRef` para rastrear tickers já enriquecidos (evita loop infinito)
  - [x] Dependency array trocada para `[seg, b3syms.join(',')]` — re-executa quando símbolos mudam
  - [x] Fallback no cálculo de tamanho: quando `v = 0` (change null), usa `moneyVol` ou `mcap` em vez de 1
  - [x] Ref limpa ao trocar de segmento (evita dados residuais)
- **Status**: Corrigido, precisa de screenshot para validação visual

---

## ❌ Faltando / A Fazer

### Prioridade Alta
1. **Bubbles sizing fix** ✅: Corrigido — enrichment expandido, fallback moneyVol/mcap, dependency array corrigida
2. **Verificar company logos nos bubbles**: Confirmar que `<BubbleAvatar>` renderiza ícones (pode haver 429 do `google.com/s2/favicons`)
3. **Re-screenshot bubbles**: Confirmar visual parity com imagem de referência do usuário

### Prioridade Média
4. **Brapi token**: Solicitar ao usuário token para acesso completo a B3 quotes (sem token, muitos dados ficam como `null`)
5. **Portfólio v2**: Adicionar importação/exportação de operações (CSV/JSON)
6. **Alertas**: Notificação desktop via Web Notifications API
7. **Backtesting**: Interface visual de resultado (equity curve, drawdown, win rate)
8. **Dashboard**: Adicionar mais cards de resumo (top gainers, top losers, news headlines)
9. **Social**: Expandir beyond Reddit (Twitter/X, Telegram sentiment se disponível)
10. **Mobile responsiveness**: Otimizar layouts para telas menores

### Prioridade Baixa
11. **PWA**: Service worker para modo offline
12. **Export**: PDF/CSV de relatórios e análises
13. **Dark mode per se**: Já tem tema glass/dark, mas pode ser melhorado
14. **Internacionalização**: i18n para português/inglês
15. **Documentação**: README.md atualizado com instruções de uso

---

## Arquitetura Chave

| Componente | Caminho | Notas |
|---|---|---|
| Store global | `src/stores/useStore.ts` | Zustand persist v5, operations/wallets/alerts |
| Motor scoring | `src/engine/scoring/scoring.config.ts` | Pesos centralizados |
| Rate limiter | `src/services/rateLimit.ts` | Per-host backoff (coingecko, brapi, yahoo) |
| Universe | `src/services/universe.ts` | CoinGecko paginated + IDB |
| Scanner | `src/services/scanner.ts` | Background scan, 6h cache, crypto+stocks |
| Pivots | `src/engine/pivots.ts` | Floor pivots + aggregateClosed |
| Stock quotes | `src/services/stockQuotes.ts` | Brapi→Yahoo fallback, 60s TTL, concurrent 6 |
| Bubbles feed | `src/services/bubbles.ts` | CoinGecko→Paprika→CoinLore |
| Company logos | `src/lib/logos.ts` | Google favicon + avatar-letter fallback |
| Domains | `src/data/company-domains.json` | ~170 tickers → domain mapping |
| Market strip | `src/components/analysis/MarketStrip.tsx` | F&G gauge + BTC dominance + gold/dollar |
| Vite proxy | `vite.config.ts` | CoinGecko, Yahoo, ylookup, Reddit, Nasdaq Trader |
| Themes | `src/styles/themes.css` | glass/light/neon/brutal via CSS variables |
