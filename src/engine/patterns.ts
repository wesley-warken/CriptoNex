import type { Candle } from '@/types';
import { calcRSI } from '@/engine/indicators';

export type PatternStage = 'Emergente' | 'Rompimento' | 'Confirmado';
export type PatternSentiment = 'Bullish' | 'Bearish' | 'Neutro';

export interface DetectedPattern {
  pattern: string;
  stage: PatternStage;
  sentiment: PatternSentiment;
  confidence: number;
  detail: string;
}

interface Swing {
  index: number;
  price: number;
}

function swings(closes: number[], order = 3): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = order; i < closes.length - order; i++) {
    const w = closes.slice(i - order, i + order + 1);
    const v = closes[i];
    if (v === Math.max(...w)) highs.push({ index: i, price: v });
    if (v === Math.min(...w)) lows.push({ index: i, price: v });
  }
  return { highs, lows };
}

const near = (a: number, b: number, tolPct: number) => Math.abs(a / b - 1) * 100 <= tolPct;

/**
 * Detecta padrões clássicos por regras explícitas (heurística, não garantia).
 * Retorna lista ordenada por confiança.
 */
export function detectPatterns(candles: Candle[]): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  const closes = candles.map((c) => c.close).filter((c) => c > 0);
  if (closes.length < 60) return out;
  const last = closes[closes.length - 1];
  const { highs, lows } = swings(closes, 3);
  const rsi = calcRSI(candles);

  // Topo duplo / fundo duplo
  const H = highs.slice(-3);
  if (H.length >= 2) {
    const [h1, h2] = H.slice(-2);
    const trough = Math.min(...closes.slice(h1.index, h2.index + 1));
    const neckBreak = last < trough;
    if (near(h1.price, h2.price, 3) && h2.index - h1.index >= 5) {
      out.push({
        pattern: 'Topo Duplo',
        stage: neckBreak ? 'Rompimento' : 'Emergente',
        sentiment: 'Bearish',
        confidence: neckBreak ? 68 : 55,
        detail: `Dois topos em ${h1.price.toFixed(2)}/${h2.price.toFixed(2)}${neckBreak ? ' com perda do pescoço' : ', pescoço ainda válido'}`,
      });
    }
  }
  const L = lows.slice(-3);
  if (L.length >= 2) {
    const [l1, l2] = L.slice(-2);
    const peak = Math.max(...closes.slice(l1.index, l2.index + 1));
    const neckBreak = last > peak;
    if (near(l1.price, l2.price, 3) && l2.index - l1.index >= 5) {
      out.push({
        pattern: 'Fundo Duplo',
        stage: neckBreak ? 'Rompimento' : 'Emergente',
        sentiment: 'Bullish',
        confidence: neckBreak ? 68 : 55,
        detail: `Dois fundos em ${l1.price.toFixed(2)}/${l2.price.toFixed(2)}${neckBreak ? ' com superação do pescoço' : ', pescoço ainda válido'}`,
      });
    }
  }

  // Canal lateral: regressão quase plana + toques alternados
  const n = Math.min(40, closes.length);
  const seg = closes.slice(-n);
  const xs = seg.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = seg.reduce((s, v) => s + v, 0) / n;
  const slope = seg.reduce((s, v, i) => s + (i - mx) * (v - my), 0) / seg.reduce((s, _, i) => s + (i - mx) ** 2, 0);
  const slopePct = (slope * n) / my * 100;
  const hi = Math.max(...seg);
  const lo = Math.min(...seg);
  const rangePct = ((hi - lo) / lo) * 100;
  if (Math.abs(slopePct) < 4 && rangePct > 3 && rangePct < 40) {
    const distTop = ((hi - last) / last) * 100;
    const distBot = ((last - lo) / last) * 100;
    out.push({
      pattern: distTop < rangePct * 0.2 ? 'Sobrecompra na Resistência' : distBot < rangePct * 0.2 ? 'Aproximando-se do Suporte' : 'Canal Lateral',
      stage: 'Emergente',
      sentiment: distTop < rangePct * 0.2 ? 'Bearish' : distBot < rangePct * 0.2 ? 'Bullish' : 'Neutro',
      confidence: 58,
      detail: `Range ${lo.toFixed(2)}–${hi.toFixed(2)} (${rangePct.toFixed(1)}%) com inclinação ${slopePct.toFixed(1)}%`,
    });
  }

  // Rompimento: fechamento além da máxima de 20 com volume acima da média
  const prevHigh = Math.max(...closes.slice(-21, -1));
  const vols = candles.map((c) => c.volume);
  const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
  const curVol = vols[vols.length - 1] ?? 0;
  if (last > prevHigh && avgVol > 0) {
    out.push({
      pattern: curVol >= avgVol * 1.5 ? 'Rompimento de Resistência' : 'Rompimento',
      stage: curVol >= avgVol * 1.5 ? 'Confirmado' : 'Emergente',
      sentiment: 'Bullish',
      confidence: curVol >= avgVol * 1.5 ? 70 : 58,
      detail: `Fechamento acima da máxima de 20 (${prevHigh.toFixed(2)}) com volume ${(curVol / avgVol).toFixed(1)}× a média`,
    });
  }
  const prevLow = Math.min(...closes.slice(-21, -1));
  if (last < prevLow && avgVol > 0) {
    out.push({
      pattern: 'Rompimento de Suporte',
      stage: curVol >= avgVol * 1.5 ? 'Confirmado' : 'Emergente',
      sentiment: 'Bearish',
      confidence: curVol >= avgVol * 1.5 ? 70 : 58,
      detail: `Fechamento abaixo da mínima de 20 (${prevLow.toFixed(2)})`,
    });
  }

  // Retração em tendência de alta: SMA50 > SMA200 e pullback de 3–8% da máxima recente
  const sma = (p: number, arr: number[]) => (arr.length >= p ? arr.slice(-p).reduce((s, v) => s + v, 0) / p : null);
  const sma50 = sma(50, closes);
  const sma200 = sma(200, closes);
  const recentHigh = Math.max(...closes.slice(-30));
  const pullback = ((recentHigh - last) / recentHigh) * 100;
  if (sma50 != null && sma200 != null && sma50 > sma200 && pullback >= 3 && pullback <= 12) {
    out.push({
      pattern: 'Retração em Tendência de Alta',
      stage: 'Emergente',
      sentiment: 'Bullish',
      confidence: 60,
      detail: `SMA50 acima da SMA200 com pullback de ${pullback.toFixed(1)}% da máxima de 30`,
    });
  }

  // Sobrecompra no RSI
  if (rsi != null && rsi >= 70) {
    out.push({
      pattern: 'Sobrecompra (RSI)',
      stage: 'Emergente',
      sentiment: 'Bearish',
      confidence: 57,
      detail: `RSI em ${rsi.toFixed(1)} — momentum esticado, risco de realização`,
    });
  }
  if (rsi != null && rsi <= 30) {
    out.push({
      pattern: 'Sobrevenda (RSI)',
      stage: 'Emergente',
      sentiment: 'Bullish',
      confidence: 57,
      detail: `RSI em ${rsi.toFixed(1)} — exaustão vendedora possível`,
    });
  }

  return out.sort((x, y) => y.confidence - x.confidence).slice(0, 4);
}
