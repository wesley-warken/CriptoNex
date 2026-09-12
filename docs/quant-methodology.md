# Metodologia quantitativa do CriptoNex

> Regra de ouro: PRECISÃO > FEATURES · EVIDÊNCIA > SCORE ARBITRÁRIO.
> Este documento descreve o que cada número significa — e o que ele NÃO significa.

## 1. Separação de conceitos (P5)

| Métrica | O que é | O que NÃO é |
|---|---|---|
| **Technical Score (0–100)** | Ranking técnico: soma ponderada de 8 componentes (tendência, momentum, força relativa, volume, RSI, MACD, volatilidade, regime). Pesos em `engine/scoring/scoring.config.ts` (somam 100). | Probabilidade de alta. |
| **Technical Confidence (0–95)** | Heurística (`confidenceBasis: 'heuristic-v1'`): acordo entre sinais + qualidade dos dados. | Probabilidade calibrada. Nunca exibir como "% de chance". |
| **Historical Edge** | Taxa de acerto de sinais semelhantes no passado (walk-forward por tier, painel Calibração). Sempre com N. | Garantia futura. |
| **Data Quality (0–100)** | 40% completude + 40% integridade + 20% frescor (`engine/dataQuality.ts`). | Selo de verdade absoluta. |

## 2. Confidence é heurística (P6)

Fórmula atual (sinais): `50 + agreeing·6 + |norm|·30 − neutral·3`, combinada no
score com alinhamento de timeframe e data quality. É uma heurística de
consistência, marcada explicitamente como `heuristic-v1` em cada score.
Calibração estatística real existe apenas via walk-forward por tier
(`tierHit`, sempre com N e split IS/OOS).

## 3. Backtest (P7–P9, P11–P13)

Modelo (`engine/backtesting/index.ts`):

- **Direcional**: BUY opera comprado, SELL vendido, NEUTRAL não opera.
- **Saída**: alvo-antes-stop do plano (pivôs S/R) dentro de `holdDays`; senão saída a tempo.
- **Custos padrão**: fee 0,1%/lado + slippage 0,05%/lado, ambos aplicados no fill.
  Retornos exibidos são **líquidos**.
- **Simultâneas**: teto padrão de 5 posições com fração igual do equity;
  sinais excedentes contam como `skippedOverlap` (nunca como trades fantasmas).
- **Equity**: `equity[t] = equity[t-1] + equity[t-1]·fração·(r/100)`;
  `drawdown = equity/pico − 1` (composto, nunca soma de %).
- **Benchmark**: buy & hold do mesmo período com 1 round-trip de fee; `alpha = estratégia − benchmark`.
- **Profit factor**: `∞` com ganhos e zero perdas; `—` sem trades. Nunca 9.99.
- **Amostra**: insuficiente (N<20) · fraca (20–49) · moderada (50–99) · boa (100–299) · forte (300+).
- Sharpe **não** é exibido: trades são irregularmente espaçados e não há curva
  diária amostrada — seria metodologicamente duvidoso.

Sem look-ahead: o score do candle `i` usa apenas `candles[0..i]`.

## 4. Walk-forward (P10)

Worker (`workers/walkforward.ts`): a cada fechamento (passo 2), recomputa o
score só com dados até `t` e mede alvo-antes-stop em 10/20 candles.
Split temporal por série: **70% in-sample / 30% out-of-sample**.
Cache IDB de 7 dias (`cc.walkforward:v2`). Séries com integridade < 80 são
puladas (`skippedSymbols`).

## 5. Data Quality e freshness (P1–P3)

`validateCandles()` verifica: série vazia, valores não-finitos, preço ≤ 0,
`high<low`, close fora de `[low,high]`, volume negativo, timestamps
duplicados/desordenados/inválidos, gaps (>1,5× o intervalo; fim de semana
ignorado p/ ações), amostra mínima e frescor por timeframe
(1h: 20min · 4h: 2h · 1d: 30h · 1w: 8d).
Nada é descartado silenciosamente: tudo vira `errors[]`/`warnings[]` com
contagem e índices em `invalid[]` (o backtest pula entradas inválidas e conta).
`provider`/`fetchedAt`/`scoredAt` acompanham cada score (origem rastreável).
Confiabilidade a priori por fonte é informativa e documentada como tal.

Símbolos: `canonicalSymbol()` colapsa BTC/BTCUSDT/BTC-USD/XBTUSD → BTC e
PETR4.SA → PETR4 (usado no agrupamento de estatísticas; P&L contábil continua
por símbolo literal).

## 6. Indicadores (P4) e terminologia (P16)

RSI/SMA/EMA/MACD/Stoch/BB/ADX/ATR delegam à `technicalindicators` com guards
de janela + filtro finito-ou-nulo (NaN/Infinity viram `null`, nunca número).
Supertrend é implementação própria sem look-ahead e retorna `null` quando
nenhum candle rompe as bandas (sem viés altista padrão).
Divergência RSI usa índices relativos à janela (regressão coberta por testes).
"E Cruz Altista/Baixista EMA 9/26" nunca se chama Golden/Death Cross
(reservados ao SMA50/200 clássico).

## 7. Alertas (P17)

Disparo único por evento (deduplicação por id, rearma ao reativar), com
timestamp no texto. Preço vazio/zero é bloqueado na criação.
Limitação atual: sem carimbo de provider/qualidade por alerta.

## 8. Limitações conhecidas

1. Score parcial (só fechamentos) não tem plano R:R nem volume.
2. Walk-forward cobre crypto com par Binance; ações dependem de Yahoo (CORS fora do dev).
3. `timeframeAlignment` é intra-TF; confluência inter-TF vem do stage 2.
4. Calibração ajusta gates, não pesos (sem ML).
5. Regime é banner + componente do score, não gate rígido (exceto ELITE exigir contexto via confluência).
6. Backtest usa candles diários por padrão; intraday muda custos efetivos.
