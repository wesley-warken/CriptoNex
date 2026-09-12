import { scoreAsset } from '@/engine/scoring';
import { convictionOf } from '@/engine/ranking';
import { buildPlan } from '@/engine/scoring/plan';
import { snapshot } from '@/engine/indicators';
import { validateCandles } from '@/engine/dataQuality';
import type { Candle } from '@/types';

export interface WFRequest {
  /** Candles diários por símbolo (main thread busca; worker só calcula). */
  candles: Record<string, Candle[]>;
  horizons: number[];
  /** Passo entre fechamentos avaliados (2 = a cada 2 candles). */
  stride: number;
  /** Registra sinal a partir deste score. */
  minScore: number;
}

export interface WFHorizon {
  n: number;
  wins: number;
}

export interface WFTierAgg {
  n: number;
  byHorizon: Record<number, WFHorizon>;
  rrSum: number;
  rrN: number;
}

export interface WFStats {
  perTier: Record<string, WFTierAgg>;
  /** Primeiros 70% temporais de cada série (treino/calibração). */
  inSample: Record<string, WFTierAgg>;
  /** Últimos 30% temporais (validação out-of-sample). */
  outOfSample: Record<string, WFTierAgg>;
  isRatio: number;
  symbols: number;
  skippedSymbols: number;
  steps: number;
  horizons: number[];
  stride: number;
  computedAt: number;
}

export type WFOut =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; stats: WFStats }
  | { type: 'error'; message: string };

/** Corte temporal in-sample/out-of-sample por série. */
export const WF_IS_RATIO = 0.7;

function bucket(perTier: Record<string, WFTierAgg>, tier: string): WFTierAgg {
  let b = perTier[tier];
  if (!b) {
    b = { n: 0, byHorizon: {}, rrSum: 0, rrN: 0 };
    perTier[tier] = b;
  }
  return b;
}

function hbucket(b: WFTierAgg, h: number): WFHorizon {
  let x = b.byHorizon[h];
  if (!x) {
    x = { n: 0, wins: 0 };
    b.byHorizon[h] = x;
  }
  return x;
}

function record(
  maps: Record<string, WFTierAgg>[],
  tier: string,
  h: number,
  win: boolean,
  rr: number | null,
  isMaxH: boolean,
): void {
  for (const m of maps) {
    const b = bucket(m, tier);
    const hb = hbucket(b, h);
    hb.n += 1;
    if (win) hb.wins += 1;
    if (isMaxH && rr != null) {
      b.rrSum += rr;
      b.rrN += 1;
    }
  }
}

self.onmessage = (ev: MessageEvent<WFRequest>) => {
  const post = (m: WFOut) =>
    (self as unknown as { postMessage: (x: unknown) => void }).postMessage(m);
  try {
    const { candles, horizons, stride, minScore } = ev.data;
    const syms = Object.keys(candles);
    const maxH = Math.max(...horizons);
    const perTier: Record<string, WFTierAgg> = {};
    const inSample: Record<string, WFTierAgg> = {};
    const outOfSample: Record<string, WFTierAgg> = {};
    let steps = 0;
    let skippedSymbols = 0;
    syms.forEach((sym, si) => {
      const kl = candles[sym] ?? [];
      if (kl.length >= 60 + maxH + 1) {
        let dqOk = true;
        try {
          dqOk = validateCandles(kl, { minCandles: 60 }).integrity >= 80;
        } catch {
          dqOk = false;
        }
        if (!dqOk) {
          skippedSymbols += 1;
        } else {
          const cut = Math.floor(kl.length * WF_IS_RATIO);
          for (let i = 60; i + maxH < kl.length; i += Math.max(1, stride)) {
            const window = kl.slice(0, i + 1);
            let s;
            try {
              s = scoreAsset({ symbol: sym, candles: window });
            } catch {
              continue;
            }
            if (s.score < minScore || s.signal === 'NEUTRAL') continue;
            const entry = kl[i].close;
            if (!(entry > 0)) continue;
            let atr: number | null = null;
            try {
              atr = snapshot(window).atr ?? null;
            } catch {
              atr = null;
            }
            const plan = buildPlan(window, s.signal, atr);
            const tier = convictionOf(s);
            const isIS = i < cut;
            bucket(perTier, tier).n += 1;
            bucket(isIS ? inSample : outOfSample, tier).n += 1;
            steps += 1;
            for (const h of horizons) {
              const fwd = kl[i + h];
              if (!fwd || !(fwd.close > 0)) continue;
              let win: boolean;
              let rr: number | null = null;
              if (plan) {
                let hitT = false;
                let hitS = false;
                for (let j = i + 1; j <= i + h; j++) {
                  const bar = kl[j];
                  if (s.signal === 'BUY') {
                    if (bar.low <= plan.stop) { hitS = true; break; }
                    if (bar.high >= plan.target1) { hitT = true; break; }
                  } else {
                    if (bar.high >= plan.stop) { hitS = true; break; }
                    if (bar.low <= plan.target1) { hitT = true; break; }
                  }
                }
                win = hitT && !hitS;
                if (h === maxH) rr = win ? plan.rr1 : -1;
              } else {
                const ret = fwd.close / entry - 1;
                win = s.signal === 'BUY' ? ret > 0 : ret < 0;
              }
              record([perTier, isIS ? inSample : outOfSample], tier, h, win, rr, h === maxH);
            }
          }
        }
      }
      if (si % 5 === 0 || si === syms.length - 1) post({ type: 'progress', done: si + 1, total: syms.length });
    });
    post({
      type: 'done',
      stats: { perTier, inSample, outOfSample, isRatio: WF_IS_RATIO, symbols: syms.length, skippedSymbols, steps, horizons, stride, computedAt: Date.now() },
    });
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : 'walk-forward falhou' });
  }
};

export {};
