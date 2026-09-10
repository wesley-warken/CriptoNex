import type { Candle } from '@/types';
import type { BinanceInterval } from '@/services/providers/binance';
import { snapshot, calcEMA } from '@/engine/indicators';

export type CondIndicator = 'RSI' | 'TREND' | 'EMA' | 'MACD' | 'SUPERTREND' | 'MARKETCAP' | 'VOLUME';
export type CondOp = 'above' | 'below' | 'between' | 'eq';

export interface AlertCondition {
  id: string;
  indicator: CondIndicator;
  timeframe: BinanceInterval;
  /** Para TREND/SUPERTREND/MACD: v1 1=Alta/positivo, 0=Neutra, -1=Baixa/negativo */
  op: CondOp;
  v1: number;
  v2?: number;
}

export interface CustomScan {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  conditions: AlertCondition[];
  createdAt: string;
}

/** Texto legível da condição (ex: "RSI 4h entre 25 e 30"). */
export function describeCondition(c: AlertCondition): string {
  const opTxt = c.op === 'above' ? 'maior que' : c.op === 'below' ? 'menor que' : c.op === 'eq' ? 'igual a' : `entre ${c.v1} e ${c.v2 ?? ''}`;
  const tfTxt = { '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' } as const;
  const valTxt = (lbl: string) => (lbl === 'TREND' || lbl === 'SUPERTREND' ? (c.v1 > 0 ? 'Alta' : c.v1 < 0 ? 'Baixa' : 'Neutra') : lbl === 'MACD' ? (c.v1 > 0 ? 'positivo' : 'negativo') : opTxt);
  return `${c.indicator} ${tfTxt[c.timeframe]} ${c.indicator === 'MARKETCAP' ? opTxt + ' ' + c.v1 : valTxt(c.indicator)}${c.indicator === 'RSI' || c.indicator === 'EMA' || c.indicator === 'VOLUME' ? (c.op === 'between' ? '' : ' ' + c.v1) : ''}`.trim();
}

function numIn(v: number | null | undefined, op: CondOp, v1: number, v2?: number): boolean {
  if (v == null || Number.isNaN(v)) return false;
  if (op === 'above') return v > v1;
  if (op === 'below') return v < v1;
  if (op === 'eq') return Math.abs(v - v1) <= Math.max(1, Math.abs(v1) * 0.03);
  return v2 != null ? v >= Math.min(v1, v2) && v <= Math.max(v1, v2) : false;
}

/**
 * Avalia UMA condição sobre os candles do timeframe (ou market cap).
 * Retorna false quando faltam dados — condição não atendida, sem exceção.
 */
export function evaluateCondition(candles: Candle[], marketCap: number | null, c: AlertCondition): boolean {
  const snap = candles.length ? snapshot(candles) : null;
  const closes = candles.map((k) => k.close);
  switch (c.indicator) {
    case 'RSI':
      return numIn(snap?.rsi, c.op, c.v1, c.v2);
    case 'TREND': {
      const st = snap?.supertrend;
      const dir = st === 'BULLISH' ? 1 : st === 'BEARISH' ? -1 : 0;
      return dir === (c.v1 > 0 ? 1 : c.v1 < 0 ? -1 : 0);
    }
    case 'EMA': {
      if (closes.length < 28) return false;
      const f = calcEMA(closes, 9);
      const s = calcEMA(closes, 26);
      const diff = f[f.length - 1] - s[s.length - 1];
      if (c.op === 'between') return numIn(diff, c.op, c.v1, c.v2);
      return c.v1 > 0 ? diff > 0 : diff < 0;
    }
    case 'MACD': {
      const h = snap?.macdHist;
      if (h == null) return false;
      return c.v1 > 0 ? h > 0 : h < 0;
    }
    case 'SUPERTREND': {
      const st = snap?.supertrend;
      const dir = st === 'BULLISH' ? 1 : st === 'BEARISH' ? -1 : 0;
      return dir === (c.v1 > 0 ? 1 : c.v1 < 0 ? -1 : 0);
    }
    case 'VOLUME':
      return numIn(snap?.volumeRatio, c.op, c.v1, c.v2);
    case 'MARKETCAP':
      if (marketCap == null) return false;
      if (c.op === 'above') return marketCap >= c.v1;
      if (c.op === 'below') return marketCap <= c.v1;
      if (c.op === 'eq') return marketCap === c.v1;
      return c.v2 != null && marketCap >= Math.min(c.v1, c.v2) && marketCap <= Math.max(c.v1, c.v2);
    default:
      return false;
  }
}

/** Todas as condições precisam ser verdadeiras (E lógico). */
export function evaluateScan(
  getCandles: (tf: BinanceInterval) => Candle[],
  marketCap: number | null,
  scan: CustomScan,
): boolean {
  if (!scan.conditions.length) return false;
  return scan.conditions.every((c) => evaluateCondition(getCandles(c.timeframe), marketCap, c));
}
