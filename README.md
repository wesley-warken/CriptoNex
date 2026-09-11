# Pulso de Mercado — Terminal Local de Cripto & Ações

Terminal pessoal de análise de mercado que roda 100% no navegador: **19 páginas**, radar de milhares de criptos e ações (B3 + EUA), indicadores multi-timeframe, monitor com alertas em tempo real e gráficos ao vivo — sem backend, sem conta, sem custo.

![stack](https://img.shields.io/badge/Vite-6React-18TypeScript-blue) ![testes](https://img.shields.io/badge/testes-113_ok-green) ![build](https://img.shields.io/badge/build-verde-green)

## O que tem dentro

### 📡 Crypto Radar (a estrela)
| Aba | O que mostra |
|---|---|
| **Monitor** | Feed Business/Realtime com 10 filtros prontos (Pullback em Alta, Golden/Death Cross, AltMomentum, Washout…) + construtor de filtros próprios (indicador × tempo × operador × valor) e **vigia em background com notificação desktop** |
| **Performance** | Variações 1h/24h/7d/30d/1a ordenáveis + Top 100/200/300 |
| **Tendência** | Curto/Médio/Longo + mudanças (Alta Forte → Baixa Forte…) em 1h/4h/1d |
| **RSI** | 1h/4h/1d/1s + médias, cores sobrevenda/sobrecompra, modal de filtros |
| **Stoch** | %K rápido / %D lento + status, em 1h/4h/1d |
| **Supertrend** | Nível + direção (Alta/Baixa) em 1h/4h/1d/1s |
| **Volume de Atenção** | Movimentos ≥2× a média de 10 barras (↑/↓/Normal) |
| **MACD · Bollinger** | Histograma/sinal; cruzamento de bandas Acima/Abaixo |
| **SMA / EMA** | Popup de configuração (Price Cross, 9/12/26/50/100) + cruzamentos |
| **BTC vs Altcoins** | Força relativa contra o BTC |

### 📈 Monitor (página do ativo)
Gráfico candlestick **em tempo real** (WebSocket Binance + polling de segurança), eixo em **horário de Brasília**, até 1000 velas, suportes/resistências por pivôs, tendências 1H/4H/1D/1W, score, backtest, trade plan com entrada/stop/alvos e **detecção de par deslistado** (nunca mais gráfico congelado de 2024).

### ➕ Mais páginas
Dashboard · Portfólio v2 (operações, carteiras, FX) · Opportunities · Market Regime · Stocks (B3 ~2 mil + EUA ~13 mil tickers) · Watchlist · Bubbles 3D · DeepChart · Top Hunter · Money Flow · Derivativos · Notícias com sentimento · Alertas · Social · Favoritos · Backtesting · Trainings · Settings.

## Fontes de dados (todas gratuitas, sem key)

| Fonte | Uso | Fallback automático |
|---|---|---|
| Binance | Klines + WebSocket tempo real | → |
| Kraken | Klines 1h/4h/1d/1s | → |
| Coinbase | Klines 1h/4h/1d | → |
| CoinGecko | Universo, preços, histórico | → cache |
| Yahoo Finance | Ações, fallback crypto (`XXX-USD`) | → |
| Brapi / Nasdaq Trader | Cotações e listas B3/EUA | → |

Com health-check por provedora, cooldown compartilhado, rate-limit com backoff e validação de frescor (par morto é pulado, não exibido).

## Começando

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # tsc + vite build (atualiza dist/)
npm run test     # suite vitest (113 testes)
```

## Arquitetura (resumo)

```
src/
  pages/        → 19 telas (Radar, Monitor, Stocks…)
  engine/       → indicadores, scoring, backtest, trend, attention, monitor
  services/     → providers (multiKlines), cache IDB, rate-limit, watchers
  components/   → charts (lightweight-charts), ui kit, analysis
  stores/       → zustand persist (favoritos, filtros, operações, alertas)
```

- **Estado**: Zustand 5 com persistência (filtros do Monitor e firstSeen sobrevivem reload).
- **Cache**: IndexedDB com TTL + stale-while-revalidate (2ª visita é instantânea).
- **Intradiário 1h/4h**: calculado do sparkline local — zero fetch.
- **Testes**: `npm run test` (unitários de motor, serviços e formatos).

## Atalhos úteis

- **Radar → Monitor**: Business = o que continua ativo · Realtime = últimas 90 min.
- **Sino no Monitor**: ativa notificações desktop da vigia (roda em qualquer página, a cada 5 min).
- **Busca global**: local-primeiro (21 mil ativos instantâneos), Yahoo complementa.

---
Feito para análise pessoal — sem recomendação de investimento. Dados podem atrasar conforme rate-limit das fontes gratuitas.
