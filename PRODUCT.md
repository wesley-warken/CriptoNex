# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trader autônomo de cripto (e ações B3/EUA), operando do desktop. Acompanha tendência multi-timeframe (1h/4h/1d), monta filtros próprios (ex.: ativo em alta forte + RSI 4h sobrevendido para entrada no pullback) e reage a alertas em tempo real. Mobile é consulta, não operação.

## Product Purpose

Terminal local de análise que responde "o que está acontecendo agora e o que continua valendo" no mercado cripto e em ações. Existe para transformar dezenas de indicadores dispersos em decisões rápidas: ver, filtrar, clicar no ativo, operar. Sucesso = achar a entrada em segundos, não minutos.

## Positioning

Radar de eventos por filtros combináveis (Business = estado que perdura, Realtime = transição que acabou de acender) + vigia em background com notificação desktop. Nenhum screener genérico entrega a cadeia completa até o gráfico ao vivo com pivôs e trade plan no mesmo fluxo.

## Operating Context

Desktop, sessões ao longo do dia com a aba aberta; Binance/Kraken/Coinbase/CoinGecko/Yahoo como fontes gratuitas (rate-limit é fato da vida, cache e fallback fazem parte do uso). Fuso de referência: Brasília. Ritual: abrir Radar → filtrar → abrir ativo no Monitor → decidir.

## Capabilities and Constraints

- 19 páginas: Radar (13 abas de indicadores), Monitor, Dashboard, Portfólio, Stocks, Bubbles, DeepChart, Top Hunter, Money Flow, Notícias, Alertas, Social + outras.
- Indicadores calculados localmente (SMA/EMA/RSI/MACD/Stoch/BB/Supertrend/pivôs/backtest); dados via APIs públicas sem key.
- Restrições: sem backend (tudo no browser, IndexedDB); CoinGecko gratuito limita chamadas; Yahoo exige proxy em dev; pares deslistados devem ser rejeitados, nunca exibidos congelados.
- Terminologia: Business/Realtime, Top N por market cap, tempo gráfico 1h/4h/1d/1s, cruzamentos Acima/Abaixo.
- Em aberto: nome e identidade visual novos (usuário autorizou propor).

## Brand Commitments

Nome e identidade serão propostos neste redesign (autorização explícita). Referência vinculante de UX: telas do CryptoControl (feed Business/Realtime, tabelas densas por timeframe, popups de configuração SMA/EMA, filtros construtíveis). Idioma: português do Brasil.

## Evidence on Hand

- Código-fonte em `src/` (React 18 + Vite 6 + TS + Tailwind 3.4 + lightweight-charts v4).
- Screenshots de referência do produto-modelo fornecidos pelo usuário durante a sessão.
- Prints de validação em `C:\Users\wesley warken\AppData\Local\Temp\visual-qa\` (fora do repo).
- Ausências que o redesign não deve fabricar: logo, testimonials, pricing.

## Product Principles

1. Densidade com hierarquia: muita informação, zero ruído — o olho acha o sinal em segundos.
2. Tempo real honesto: dado velho é rotulado ou nem aparece; nada congelado se passando por ao vivo.
3. Filtros antes de tabelas: o usuário descreve a oportunidade, o terminal mostra onde está.
4. Desktop opera, mobile consulta: paridade de leitura, sem paridade de operação.
5. Sobrevive à internet ruim: cache, fallback e degradação explícita em vez de tela quebrada.
