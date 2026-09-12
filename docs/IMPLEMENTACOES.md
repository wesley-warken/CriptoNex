# Histórico de Implementações — CriptoNex

Período: 11–12/09/2026. Tudo abaixo foi implementado, testado (`vitest`), tipado (`tsc --noEmit`) e com build (`vite build`) passando. Repositório: `wesley-warken/CriptoNex`, branch `main`.

Legenda de estado: ✅ no GitHub · 🟡 só na máquina (não commitado).

## 1. Auditoria completa do sistema + 5 bugfixes críticos ✅ (`dd866e0` incluído)

**Diagnóstico:** 138/138 testes, `tsc` limpo, build OK — base saudável, com 5 bugs críticos confirmados por 3 auditorias paralelas (engine, services, frontend).

| # | Bug | Correção | Arquivo |
|---|---|---|---|
| 1 | Alerta reativado nunca redisparava (`firedRef` eterno) | Libera o id ao reativar; chave única por toast | `components/analysis/AlertChecker.tsx` |
| 2 | Fallback copiava candles do BTC p/ altcoins + cache key só por tamanho | `[]` em vez de BTC; chave pela composição; `change1h` sem proxy diário | `services/market.ts` |
| 3 | Backup perdia `monFilters`/`monDisabled`/`brapiToken`/`muted` | Backup v6 com tudo + `clearAll` coerente | `stores/useStore.ts` |
| 4 | ADX e Volume forçavam BUY sem direção | Neutro sem direção definida | `engine/signals/index.ts` |
| 5 | Botão "tentar de novo" não recarregava (Monitor/Backtesting) | `retryKey` real | `pages/Monitor.tsx`, `pages/BacktestingPage.tsx` |

## 2. Aba Oportunidades v1 ✅ (`dd866e0`)

- Renomeada para **Oportunidades** (rota nova `/oportunidades`, antiga mantida).
- Tiers de convicção ELITE/FORTE/OBSERVAR/EVITAR (`engine/ranking`), spotlight ELITE top 3, ordenação (score/confiança/qualidade/alinhamento), filtros (segmento, tier, só-compra, ocultar parciais).
- Categorias enganosas corrigidas (`Most Oversold/Overbought` → Maior Confiança / Melhor Qualidade).
- Sinais e UI em PT-BR (Compra/Venda/Neutro).

## 3. Oportunidades v2 — ranking por valor esperado, Fases 0–4 ✅ (`bb13a6d`)

- **Fase 0:** invariante de contadores, exchange sob demanda (`*.SA`→B3), `rankOpportunities` com `!= null`, clamp 0–100, `topCategories(baseRanked)`, badges unificados, memos. Teste `ranking.test.ts`.
- **Fase 1:** `engine/scoring/plan.ts` (R:R via pivôs S/R — mesma matemática do Monitor), `stretch` (desvio vs SMA20 em percentil, degrada tier ≥p90), `tierSeen` + feed Transições + `novo há Xmin`, filtro `R:R ≥`, spotlight com R:R e 24h.
- **Fase 2:** `engine/scoring/confluence.ts` + stage 2 no scanner (4h+1d crypto, 1h+1d ações, cache IDB 45min, pausável, botão MTF); gates (ELITE só com acordo total); chip `4h✓ 1d✓`; filtro de confluência total.
- **Fase 3:** worker `walkforward.ts` (rejoga score por fechamento, alvo-antes-stop 10/20 candles, por tier), painel Calibração (hit/R:R por tier, `suggestGates` aplicável, tooltip nos badges), cache IDB 7 dias.
- **Fase 4:** `entryTier/score/RR/stretch/conf` em `Operation`, botão ＋ na linha → Portfolio pré-preenchido (`pendingOp`), `statsByEntryTier` (FIFO), ring buffer `entrySnapshots`, painel Sua estatística, gates pessoais (≥30 trades), feed "desde sua última visita".
- `OpportunityScore` estendido: `plan`, `stretchRaw`, `confluence` (todos opcionais — compatível com cache antigo).

## 4. Quant Integrity v1 🟡 (implementado e verde, não commitado)

Auditoria de precisão com TDD (teste vermelho antes de cada fix):

- **Data Quality** (`engine/dataQuality.ts`): valida timestamps, ordem, duplicatas, gaps (fim de semana ignorado p/ ações), OHLC inválido, preço ≤ 0, close fora do range, volume negativo, amostra mínima e frescor por timeframe (1h:20min · 4h:2h · 1d:30h · 1w:8d). Nada descartado em silêncio: `errors[]`/`warnings[]` + índices em `invalid[]`. Score 40/40/20 documentado.
- **Indicadores**: guards finito-ou-nulo em RSI/MACD/Stoch/BB/ADX/ATR (RSI retornava **100 com NaN**!); Supertrend sem viés altista padrão (lateral → `null`); `detectDivergence` com índices corrigidos; 12 testes sintéticos (constante, NaN, zeros, monotonicidade). Achado honesto: MACD em série linear pura dá histograma → 0 (matemática correta, premissa do teste é que estava errada).
- **Terminologia**: "Golden/Death Cross" → "Cruz Altista/Baixista EMA 9/26" (ids preservados p/ filtros salvos) + teste de regressão.
- **Score honesto**: `confidenceBasis: 'heuristic-v1'`, `provider/fetchedAt/scoredAt` em todo score, `interpret()` sem "probabilística".
- **Backtest profissional** (`engine/backtesting`): direcional (short em SELL), alvo-antes-stop, fee 0,1%+slippage 0,05% no fill, teto 5 simultâneas (`skippedOverlap`), equity composta (`equity[t]=equity[t-1]·(1+r)`, DD do pico), PF `∞`/`—` (nunca 9.99), benchmark B&H + alpha, mediana/mín/máx/expectancy/N, `sampleLabel`, entradas inválidas puladas e contadas. Sharpe recusado com motivo.
- **Walk-forward IS/OOS**: split temporal 70/30 por série, `skippedSymbols`, cache v2, coluna IS→OOS na Calibração.
- **Símbolos**: `canonicalSymbol` (BTC/BTCUSDT/BTC-USD/XBTUSD→BTC; pegou bug real `XBTUSD`→`XB` via TDD).
- **Alertas**: timestamp no disparo (dedup já existia).
- **Docs**: `docs/quant-methodology.md` (score vs confidence vs edge, custos, IS/OOS, limitações).
- Evidência: **203/203 testes**, tsc limpo, build OK, sensores `test`+`build` passed no harness.

## 5. Medição antes/depois (evidência, não chute)

Mesma cesta (10 ativos × 400 candles Binance 1d), mesma régua (sinal ≥70, acerto direcional 10/20d), código `bb13a6d` vs atual:

- **Hit por tier em dado limpo: +0,0pp** (ELITE 3,0%, FORTE 2,1% — idênticos; janela é bear market com B&H de −9% a −74%, ou seja, base rate, não veredito).
- **Dados com lixo** (NaN + duplicata + high<low): antes `avgReturn=null` (NaN!), 242 trades com 1 fantasma; depois **164 trades (−32%)**, 0 NaN, 4 pulados+contados, DQ 78 com 5 erros.
- Metodologia: PF 9,99→`∞`, DD soma→composto (−60→−51 no exemplo), série em queda −1,45%→positivo (short).
- Conclusão honesta: ganho em robustez/honestidade, não em hit-rate; +10pp no ELITE exige calibração ao vivo (botão na aba).

## 6. Skills instaladas via skills.sh 🟡 (arquivos na máquina)

- `obra/superpowers` (14): systematic-debugging, verification-before-completion, test-driven-development, requesting-code-review, writing-plans, executing-plans… (usadas neste trabalho).
- `vercel-labs/agent-skills` (9): vercel-react-best-practices, web-design-guidelines…
- Destino: `.agents/skills/` (23 skills) + `opencode.json` com `skills.paths` ✅ (commitado em `333e3bc`; reiniciar o opencode para carregar).

## 7. Loop daily-triage instalado 🟡 (arquivos na máquina)

`npx @cobusgreyling/loop-init . --pattern daily-triage --tool opencode`: `skills/loop-{triage,budget,constraints}`, `LOOP.md`, `STATE.md` (runs registradas), `loop-*.md`, `skills-lock.json`, `AGENTS.md` (regras L1/L2). Protocolo seguido: L2 só com pedido direto, verifier após implementar, sem push sem aprovação.

## 8. Radar Tendência idêntico à referência ✅ (`333e3bc`)

- Linha: ícone real da moeda + `MOEDA Nome`, Rank, pills Alta/Alta Forte/Baixa/Baixa Forte/Neutro, transições `X para Y`/`Mantém X`, ☆ fav + `+W` + botão gráfico.
- Chrome: barra **Indicadores** (timeframe + select top-200 que filtra + star + expandir, tudo funcional), setas ◀ ▶ no tab strip, sort Moeda ⇅, pill-row separada, headers em trilho único contínuo.
- Decisões: sem paywall (terminal gratuito), sem logos copiados (avatares por letra + ícones do CoinGecko vindos dos dados), sem cor hardcoded (vars do tema `nex`).
- `trendBadge`/`shiftBadge` extraídos e puros + `RadarBadges.test.ts` (5). Verifier: APPROVE.

## 9. Commits no GitHub

| Commit | Conteúdo |
|---|---|
| `dd866e0` | Auditoria + 5 fixes + Oportunidades v1 |
| `bb13a6d` | Oportunidades v2 Fases 0–4 |
| `333e3bc` | Radar Tendência idêntico + `opencode.json` + `STATE.md` |

**Ainda fora do Git:** arquivos do item 4, item 6 (`.agents/`), item 7 (loop), sujeira pré-existente (PROGRESS.md, monitor/patterns/assetCandles/multiKlines, wedges). Diga o que commitar.

## 10. Como validar

```powershell
npm run test    # 208/208
npx tsc --noEmit
npm run build
```
