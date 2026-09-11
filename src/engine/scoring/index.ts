import type { Candle, MarketRegime, OpportunityScore, Signal } from '@/types';
import { snapshot } from '@/engine/indicators';
import { buildSignals } from '@/engine/signals';
import { buildPlan } from '@/engine/scoring/plan';
import { SCORING_WEIGHTS, classifyScore } from '@/engine/scoring/scoring.config';

export interface ScoreInput {
  symbol: string;
  candles: Candle[];
  btcChange7d?: number | null;
  change7d?: number | null;
  regime?: MarketRegime | null;
}

export function dataQuality(candles: Candle[]): number {
  if (!candles.length) return 0;
  let missing = 0;
  for (let i = 1; i < candles.length; i++) {
    if (!candles[i] || candles[i].close <= 0) missing++;
  }
  const depth = Math.min(100, (candles.length / 200) * 100);
  const completeness = candles.length ? ((candles.length - missing) / candles.length) * 100 : 0;
  return Math.round(depth * 0.4 + completeness * 0.6);
}

export function scoreAsset(input: ScoreInput): OpportunityScore {
  const { symbol, candles, regime } = input;
  const snap = snapshot(candles);
  const sig = buildSignals(candles, snap);
  const price = candles.length ? candles[candles.length - 1].close : 0;
  const W = SCORING_WEIGHTS;

  const trendPts = (() => {
    let p = W.trend / 2;
    if (snap.sma50 != null && snap.sma200 != null) p += snap.sma50 > snap.sma200 ? W.trend / 2 : -W.trend / 2;
    else if (snap.sma20 != null) p += price > snap.sma20 ? W.trend / 4 : -W.trend / 4;
    if (snap.supertrend === 'BULLISH') p += 2;
    else if (snap.supertrend === 'BEARISH') p -= 2;
    return Math.max(0, Math.min(W.trend, p));
  })();
  const momentumPts = (() => {
    let p = W.momentum / 2;
    if (snap.macdSignal === 'BUY') p += 5;
    else if (snap.macdSignal === 'SELL') p -= 5;
    if (snap.adx != null && snap.adx >= 25) p += 3;
    if (snap.rsi != null) p += snap.rsi >= 50 && snap.rsi <= 70 ? 3 : snap.rsi < 30 || snap.rsi > 70 ? -2 : 0;
    return Math.max(0, Math.min(W.momentum, p));
  })();
  const relPts = (() => {
    const a = input.change7d ?? 0;
    const b = input.btcChange7d ?? 0;
    const d = a - b;
    if (d >= 8) return W.relativeStrength;
    if (d >= 3) return W.relativeStrength * 0.8;
    if (d >= 0) return W.relativeStrength * 0.55;
    if (d >= -5) return W.relativeStrength * 0.3;
    return W.relativeStrength * 0.1;
  })();
  const volPts = snap.volumeRatio == null ? W.volume * 0.4 : Math.min(W.volume, (Math.min(snap.volumeRatio, 3) / 3) * W.volume + (sig.signal === 'BUY' ? 3 : 0));
  const rsiPts = snap.rsi == null ? W.rsi * 0.4 : snap.rsi >= 50 && snap.rsi <= 68 ? W.rsi : snap.rsi >= 40 && snap.rsi < 50 ? W.rsi * 0.55 : W.rsi * 0.25;
  const macdPts = snap.macdSignal === 'BUY' ? W.macd : snap.macdSignal === 'SELL' ? W.macd * 0.15 : W.macd * 0.5;
  const volatPts = (() => {
    if (snap.atr == null || !price) return W.volatility * 0.5;
    const pct = (snap.atr / price) * 100;
    if (pct <= 2.5) return W.volatility;
    if (pct <= 4.5) return W.volatility * 0.6;
    return W.volatility * 0.3;
  })();
  const regimePts = !regime ? W.regime * 0.5 : regime.label.includes('RISK-ON') && sig.signal === 'BUY' ? W.regime : regime.label.includes('RISK-OFF') && sig.signal === 'SELL' ? W.regime : W.regime * 0.5;

  const breakdown = [
    { label: 'TREND', earned: Math.round(trendPts), max: W.trend },
    { label: 'MOMENTUM', earned: Math.round(momentumPts), max: W.momentum },
    { label: 'RELATIVE STRENGTH', earned: Math.round(relPts), max: W.relativeStrength },
    { label: 'VOLUME', earned: Math.round(Math.min(W.volume, volPts)), max: W.volume },
    { label: 'RSI', earned: Math.round(rsiPts), max: W.rsi },
    { label: 'MACD', earned: Math.round(macdPts), max: W.macd },
    { label: 'VOLATILITY', earned: Math.round(volatPts), max: W.volatility },
    { label: 'REGIME', earned: Math.round(regimePts), max: W.regime },
  ];
  const score = Math.max(0, Math.min(100, breakdown.reduce((a, b) => a + b.earned, 0)));
  const dq = dataQuality(candles);
  const agreeing = Math.max(sig.summary.bullish, sig.summary.bearish);
  const timeframeAlignment = Math.round(Math.min(100, 45 + agreeing * 7));
  const confidence = Math.round(sig.confidence * 0.6 + timeframeAlignment * 0.2 + dq * 0.2);

  const why: string[] = [];
  const risks: string[] = [];
  if (snap.sma50 != null && snap.sma200 != null) why.push(snap.sma50 > snap.sma200 ? '✓ SMA50 > SMA200' : '✕ SMA50 < SMA200');
  if (snap.macdSignal === 'BUY') why.push('✓ MACD bullish');
  else if (snap.macdSignal === 'SELL') risks.push('⚠ MACD bearish');
  if (snap.rsi != null) (snap.rsi >= 50 && snap.rsi <= 70 ? why : risks).push(`${snap.rsi >= 50 && snap.rsi <= 70 ? '✓' : '⚠'} RSI = ${snap.rsi.toFixed(1)}`);
  if (snap.volumeRatio != null && snap.volumeRatio >= 1.5) why.push(`✓ Volume = ${snap.volumeRatio.toFixed(1)}× média`);
  if (snap.supertrend) (snap.supertrend === 'BULLISH' ? why : risks).push(`${snap.supertrend === 'BULLISH' ? '✓' : '⚠'} Supertrend ${snap.supertrend.toLowerCase()}`);
  if (snap.atr != null && price) {
    const pct = (snap.atr / price) * 100;
    if (pct > 4.5) risks.push('⚠ Volatilidade elevada — risco de falsos rompimentos');
  }
  if (regime && regime.label.includes('RISK-OFF') && sig.signal === 'BUY') risks.push('⚠ Regime desfavorável ao sinal');
  if (dq < 55) risks.push('⚠ Baixa confiança nos dados');

  const signal: Signal = sig.signal;
  const stretchRaw =
    snap.sma20 != null && snap.sma20 > 0 && price > 0 ? ((price - snap.sma20) / snap.sma20) * 100 : null;
  return { symbol, score, classification: classifyScore(score), confidence, dataQuality: dq, timeframeAlignment, signal, breakdown, why, risks, plan: buildPlan(candles, signal, snap.atr ?? null), stretchRaw };
}

export function interpret(symbol: string, tf: string, o: OpportunityScore, regime: MarketRegime | null): string {
  const dir = o.signal === 'BUY' ? 'predominantemente altista' : o.signal === 'SELL' ? 'predominantemente baixista' : 'indefinida, sem dominância clara';
  return (
    `${symbol} apresenta estrutura ${dir} no timeframe ${tf}. ` +
    `Score ${o.score}/100 (${o.classification}) com confiança de ${o.confidence}%. ` +
    (o.why.length ? `Pontos de suporte: ${o.why.join('; ')}. ` : '') +
    (o.risks.length ? `Pontos de atenção: ${o.risks.join('; ')}. ` : '') +
    (regime ? `Contexto: Market Regime ${regime.label} (confiança ${regime.confidence}%). ` : '') +
    `Leitura probabilística, não garantia: aguardar confirmação por preço e volume antes de qualquer decisão.`
  );
}
