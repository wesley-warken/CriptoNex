import type { Candle } from '@/types';
import { calcRSI } from '@/engine/indicators';
import { verifyWedge, type WedgeKind } from '@/engine/wedges';

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

  // Canal de Baixa / Alta: regressão inclinada + preço do lado fraco
  if (n >= 30) {
    const w = closes.slice(-30);
    const m = w.length;
    const mx = (m - 1) / 2;
    const my = w.reduce((s, v) => s + v, 0) / m;
    const den = w.reduce((s, _, i) => s + (i - mx) ** 2, 0);
    const slope = den ? w.reduce((s, v, i) => s + (i - mx) * (v - my), 0) / den : 0;
    const slopePct = (slope * m) / (my || 1) * 100;
    const sma20 = sma(20, closes);
    if (slopePct < -4 && sma20 != null && last < sma20) {
      out.push({
        pattern: 'Canal de Baixa',
        stage: 'Emergente',
        sentiment: 'Bearish',
        confidence: 58,
        detail: `Declive de ${slopePct.toFixed(1)}% em 30 barras, preço abaixo da SMA20`,
      });
    } else if (slopePct > 4 && sma20 != null && last > sma20) {
      out.push({
        pattern: 'Canal de Alta',
        stage: 'Emergente',
        sentiment: 'Bullish',
        confidence: 58,
        detail: `Rampa de +${slopePct.toFixed(1)}% em 30 barras, preço acima da SMA20`,
      });
    }
  }

  // Cunhas VERIFICADAS (selo binário 7/7, sem "meia cunha"): só vela fechada —
  // a série chega com o candle em formação, que é descartado aqui.
  const closedCloses = closes.slice(0, -1);
  const closedVols = candles.slice(0, -1).map((c) => c.volume);
  for (const kind of ['desc', 'asc'] as WedgeKind[]) {
    let res;
    try {
      res = verifyWedge(closedCloses, closedVols, kind);
    } catch {
      continue;
    }
    if (!res.verified || res.state === 'invalidated') continue; // selo revogado: fora do feed
    const isDesc = kind === 'desc';
    out.push({
      pattern: isDesc ? 'Cunha Descendente Verificada' : 'Cunha Ascendente Verificada',
      stage: res.state === 'confirmed' ? 'Confirmado' : 'Emergente',
      sentiment: isDesc ? 'Bullish' : 'Bearish',
      // confidence aqui é só rank (verificação já foi sim/não nas 7 portas)
      confidence: 70,
      detail: `Geometria verificada 7/7 · ${res.state === 'confirmed' ? 'rompida' : 'formando'} · ápice ~${Math.max(1, Math.round(res.apexBars ?? 0))} velas · qualidade ${res.quality}`,
    });
  }

  // Níveis: mínima/máxima de 20 (excluindo a barra atual)
  const sup20 = Math.min(...closes.slice(-21, -1));
  const res20 = Math.max(...closes.slice(-21, -1));
  const distSup = ((last - sup20) / last) * 100;
  const distRes = ((res20 - last) / last) * 100;

  // Sobrevendido no Suporte / Sobrecomprado na Resistência
  if (rsi != null && rsi <= 30 && distSup >= 0 && distSup <= 2) {
    out.push({
      pattern: 'Sobrevendido no Suporte',
      stage: 'Emergente',
      sentiment: 'Bullish',
      confidence: 64,
      detail: `RSI ${rsi.toFixed(1)} a ${distSup.toFixed(1)}% do suporte de 20 (${sup20.toFixed(2)})`,
    });
  }
  if (rsi != null && rsi >= 70 && distRes >= 0 && distRes <= 2) {
    out.push({
      pattern: 'Sobrecomprado na Resistência',
      stage: 'Emergente',
      sentiment: 'Bearish',
      confidence: 64,
      detail: `RSI ${rsi.toFixed(1)} a ${distRes.toFixed(1)}% da resistência de 20 (${res20.toFixed(2)})`,
    });
  }

  // Aproximando-se do Suporte / Resistência (observação, sem exaustão)
  if (distSup > 2 && distSup <= 5) {
    out.push({
      pattern: 'Aproximando-se do Suporte',
      stage: 'Emergente',
      sentiment: 'Neutro',
      confidence: 52,
      detail: `A ${distSup.toFixed(1)}% do suporte de 20 (${sup20.toFixed(2)})`,
    });
  }
  if (distRes > 2 && distRes <= 5) {
    out.push({
      pattern: 'Aproximando-se da Resistência',
      stage: 'Emergente',
      sentiment: 'Neutro',
      confidence: 52,
      detail: `A ${distRes.toFixed(1)}% da resistência de 20 (${res20.toFixed(2)})`,
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

  // Polaridade: nível rompido que troca de lado (reteste com defesa/rejeição).
  // Nível antigo = extremas de 20 barras terminando 5 barras atrás (fora do ruído
  // recente); rompimento = fechamento além dele nos últimos 15; reteste = último
  // fechamento colado (±1,5%) e do lado certo. Pavio atravessando e fechando de
  // volta = defesa confirmada.
  if (closes.length >= 45) {
    const highs = candles.map((c) => c.high).filter((v) => v > 0);
    const lows = candles.map((c) => c.low).filter((v) => v > 0);
    if (highs.length >= 45 && lows.length >= 45) {
      const oldHighs = highs.slice(-25, -5);
      const oldLows = lows.slice(-25, -5);
      const rOld = Math.max(...oldHighs);
      const sOld = Math.min(...oldLows);
      const recentCloses = closes.slice(-15);
      const brokeUp = recentCloses.some((c) => c > rOld);
      const brokeDown = recentCloses.some((c) => c < sOld);
      const rangePct = ((rOld - sOld) / last) * 100;
      if (rangePct >= 2 && rOld > 0 && sOld > 0) {
        const distROld = ((last - rOld) / last) * 100; // ≥0 segura acima
        if (brokeUp && distROld >= 0 && distROld <= 1.5) {
          const defended = (candles[candles.length - 1]?.low ?? last) < rOld;
          out.push({
            pattern: 'Resistência virou Suporte',
            stage: defended ? 'Confirmado' : 'Emergente',
            sentiment: 'Bullish',
            confidence: defended ? 68 : 63,
            detail: `Rompeu ${rOld.toFixed(2)} e segura acima a ${distROld.toFixed(1)}%${defended ? ' (pavio defendeu)' : ''}`,
          });
        }
        const distSOld = ((sOld - last) / last) * 100; // ≥0 rejeita abaixo
        if (brokeDown && distSOld >= 0 && distSOld <= 1.5) {
          const rejected = (candles[candles.length - 1]?.high ?? last) > sOld;
          out.push({
            pattern: 'Suporte virou Resistência',
            stage: rejected ? 'Confirmado' : 'Emergente',
            sentiment: 'Bearish',
            confidence: rejected ? 68 : 63,
            detail: `Perdeu ${sOld.toFixed(2)} e rejeita abaixo a ${distSOld.toFixed(1)}%${rejected ? ' (pavio rejeitou)' : ''}`,
          });
        }
      }
    }
  }

  return out.sort((x, y) => y.confidence - x.confidence).slice(0, 4);
}

// ---- firstSeen (quando cada padrão acendeu pela 1ª vez) ----
const PAT_FS_KEY = 'cc.patterns.firstSeen';
export function loadPatSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PAT_FS_KEY);
    const j = raw ? JSON.parse(raw) as Record<string, number> : {};
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}
export function savePatSeen(m: Record<string, number>): void {
  try {
    const keys = Object.keys(m);
    const trimmed: Record<string, number> = {};
    for (const k of keys.slice(-500)) trimmed[k] = m[k];
    localStorage.setItem(PAT_FS_KEY, JSON.stringify(trimmed));
  } catch {
    /* armazenamento cheio */
  }
}
