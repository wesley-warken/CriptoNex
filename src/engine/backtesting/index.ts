import type { Candle } from '@/types';
import { scoreAsset } from '@/engine/scoring';
import { snapshot } from '@/engine/indicators';
import { buildPlan } from '@/engine/scoring/plan';
import { validateCandles, type DataQualityReport } from '@/engine/dataQuality';

export interface BacktestTrade {
  entryIdx: number;
  exitIdx: number;
  entryPx: number;
  exitPx: number;
  grossPct: number;
  netPct: number;
  reason: 'target' | 'stop' | 'time';
  side: 'long' | 'short';
}

export interface BacktestOptions {
  /** Taxa por lado (ex: 0.001 = 0.1%). Padrão 0.1%. */
  feePct?: number;
  /** Derrapagem por lado no fill (ex: 0.0005 = 0.05%). Padrão 0.05%. */
  slippagePct?: number;
  /** Posições simultâneas máximas (fração igual do equity). Padrão 5. */
  maxPositions?: number;
  /** Usa alvo/stop do plano (alvo-antes-stop). Padrão true. */
  usePlan?: boolean;
  /** Valida a série e pula entradas inválidas. Padrão true. */
  validate?: boolean;
  market?: 'crypto' | 'stock';
}

export type SampleLabel = 'insuficiente' | 'fraca' | 'moderada' | 'boa' | 'forte';

/** Classificação de confiabilidade estatística por N (P13). */
export function sampleLabel(n: number): SampleLabel {
  if (n < 20) return 'insuficiente';
  if (n < 50) return 'fraca';
  if (n < 100) return 'moderada';
  if (n < 300) return 'boa';
  return 'forte';
}

/** '—' sem trades, '∞' sem perdas, senão 2 casas. Nunca número artificial. */
export function formatPF(v: number, trades: number): string {
  if (!trades) return '—';
  if (!Number.isFinite(v)) return '∞';
  return v.toFixed(2);
}

export interface BacktestResult {
  trades: number;
  wins: number;
  winRate: number;
  /** Média dos retornos líquidos por trade (%, continuidade do headline antigo). */
  avgReturn: number;
  expectancy: number;
  medianReturn: number;
  best: number;
  worst: number;
  /** Infinity quando há ganhos e zero perdas; 0 sem trades. */
  profitFactor: number;
  /** Equity composta (eventos), NÃO soma de %. Negativo = perda máxima. */
  maxDrawdown: number;
  totalReturn: number;
  benchmarkReturn: number;
  alpha: number;
  maxSimultaneous: number;
  skippedOverlap: number;
  skippedInvalid: number;
  /** Fração média do equity alocada (0–100). */
  capitalUtilization: number;
  sampleEnough: boolean;
  sampleLabel: SampleLabel;
  /** Retornos líquidos por trade (%). */
  returns: number[];
  /** Curva de equity por evento, começa em 1. */
  equity: number[];
  tradesLog: BacktestTrade[];
  dataQuality: DataQualityReport | null;
}

/**
 * Curva de equity por retornos percentuais com fração alocada.
 * equity[t] = equity[t-1] + equity[t-1]·frac·(r/100); drawdown = equity/pico − 1.
 */
export function equityFromReturns(
  returns: number[],
  frac = 1,
): { equity: number[]; maxDrawdown: number; totalReturn: number } {
  const equity = [1];
  let eq = 1;
  let peak = 1;
  let maxDD = 0;
  for (const r of returns) {
    eq += eq * frac * (r / 100);
    equity.push(eq);
    if (eq > peak) peak = eq;
    if (peak > 0) maxDD = Math.min(maxDD, (eq / peak - 1) * 100);
  }
  return { equity, maxDrawdown: maxDD, totalReturn: (eq - 1) * 100 };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const empty = (dataQuality: DataQualityReport | null): BacktestResult => ({
  trades: 0, wins: 0, winRate: 0, avgReturn: 0, expectancy: 0, medianReturn: 0,
  best: 0, worst: 0, profitFactor: 0, maxDrawdown: 0, totalReturn: 0,
  benchmarkReturn: 0, alpha: 0, maxSimultaneous: 0, skippedOverlap: 0,
  skippedInvalid: 0, capitalUtilization: 0, sampleEnough: false,
  sampleLabel: 'insuficiente', returns: [], equity: [1], tradesLog: [], dataQuality,
});

// Sem look-ahead: o score do candle i usa apenas candles[0..i].
// Direcional: BUY opera comprado, SELL vendido, NEUTRAL não opera.
export function backtest(
  candles: Candle[],
  threshold = 80,
  holdDays = 7,
  opts: BacktestOptions = {},
): BacktestResult {
  const {
    feePct = 0.001, slippagePct = 0.0005, maxPositions = 5,
    usePlan = true, validate = true, market = 'crypto',
  } = opts;
  const dq = validate ? validateCandles(candles, { market, minCandles: 60 }) : null;
  if (candles.length < 60) return empty(dq);
  const invalid = new Set(dq?.invalid ?? []);

  const maxPos = Math.max(1, Math.floor(maxPositions));
  const frac = 1 / maxPos;
  const feeMult = (1 - feePct) / (1 + feePct);
  const trades: BacktestTrade[] = [];
  const open: number[] = [];
  const diff = new Array<number>(candles.length + 1).fill(0);
  let skippedOverlap = 0;
  let skippedInvalid = 0;
  let maxSim = 0;

  for (let i = 50; i < candles.length - holdDays; i++) {
    if (invalid.has(i)) {
      skippedInvalid += 1;
      continue;
    }
    const window = candles.slice(0, i + 1);
    let s;
    try {
      s = scoreAsset({ symbol: 'BT', candles: window });
    } catch {
      skippedInvalid += 1;
      continue;
    }
    if (s.score < threshold || s.signal === 'NEUTRAL') continue;
    const entryRaw = candles[i].close;
    if (!(entryRaw > 0)) {
      skippedInvalid += 1;
      continue;
    }
    const long = s.signal === 'BUY';
    // Remove posições encerradas até i e aplica teto de simultâneas.
    for (let k = open.length - 1; k >= 0; k--) if (open[k] <= i) open.splice(k, 1);
    if (open.length >= maxPos) {
      skippedOverlap += 1;
      continue;
    }
    let atr: number | null = null;
    try {
      atr = snapshot(window).atr ?? null;
    } catch {
      atr = null;
    }
    const plan = usePlan ? buildPlan(window, s.signal, atr) : null;
    const entryFill = long ? entryRaw * (1 + slippagePct) : entryRaw * (1 - slippagePct);
    let exitIdx = Math.min(i + holdDays, candles.length - 1);
    let exitRaw = candles[exitIdx].close;
    let reason: BacktestTrade['reason'] = 'time';
    if (plan) {
      for (let j = i + 1; j <= exitIdx; j++) {
        const b = candles[j];
        if (!(b.high > 0) || !(b.low > 0)) continue;
        if (long) {
          if (b.low <= plan.stop) { exitIdx = j; exitRaw = plan.stop; reason = 'stop'; break; }
          if (b.high >= plan.target1) { exitIdx = j; exitRaw = plan.target1; reason = 'target'; break; }
        } else {
          if (b.high >= plan.stop) { exitIdx = j; exitRaw = plan.stop; reason = 'stop'; break; }
          if (b.low <= plan.target1) { exitIdx = j; exitRaw = plan.target1; reason = 'target'; break; }
        }
      }
    }
    if (!(exitRaw > 0)) {
      skippedInvalid += 1;
      continue;
    }
    const exitFill = long ? exitRaw * (1 - slippagePct) : exitRaw * (1 + slippagePct);
    const grossPct = (long ? exitRaw / entryRaw - 1 : entryRaw / exitRaw - 1) * 100;
    const netMult = (long ? exitFill / entryFill : entryFill / exitFill) * feeMult;
    const netPct = (netMult - 1) * 100;
    if (!Number.isFinite(netPct) || !Number.isFinite(grossPct)) {
      skippedInvalid += 1;
      continue;
    }
    trades.push({
      entryIdx: i, exitIdx, entryPx: entryFill, exitPx: exitFill,
      grossPct, netPct, reason, side: long ? 'long' : 'short',
    });
    open.push(exitIdx);
    maxSim = Math.max(maxSim, open.length);
    diff[i + 1] = (diff[i + 1] ?? 0) + 1;
    diff[exitIdx + 1] = (diff[exitIdx + 1] ?? 0) - 1;
  }

  if (!trades.length) {
    const r = empty(dq);
    r.skippedOverlap = skippedOverlap;
    r.skippedInvalid = skippedInvalid;
    const first = candles[0]?.close ?? 0;
    const last = candles[candles.length - 1]?.close ?? 0;
    r.benchmarkReturn = first > 0 && last > 0 ? ((last * (1 - feePct)) / (first * (1 + feePct)) - 1) * 100 : 0;
    r.alpha = r.totalReturn - r.benchmarkReturn;
    return r;
  }

  const nets = trades.map((t) => t.netPct);
  const wins = nets.filter((r) => r > 0);
  const grossW = wins.reduce((a, b) => a + b, 0);
  const grossL = Math.abs(nets.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
  const eq = equityFromReturns(nets, frac);
  let run = 0;
  let openSum = 0;
  for (let i = 0; i < candles.length; i++) {
    run += diff[i] ?? 0;
    openSum += Math.max(0, run);
  }
  const first = candles[0]?.close ?? 0;
  const last = candles[candles.length - 1]?.close ?? 0;
  const benchmarkReturn = first > 0 && last > 0 ? ((last * (1 - feePct)) / (first * (1 + feePct)) - 1) * 100 : 0;
  const label = sampleLabel(trades.length);
  return {
    trades: trades.length,
    wins: wins.length,
    winRate: (wins.length / trades.length) * 100,
    avgReturn: nets.reduce((a, b) => a + b, 0) / nets.length,
    expectancy: nets.reduce((a, b) => a + b, 0) / nets.length,
    medianReturn: median(nets),
    best: Math.max(...nets),
    worst: Math.min(...nets),
    profitFactor: grossL === 0 ? (grossW > 0 ? Infinity : 0) : grossW / grossL,
    maxDrawdown: eq.maxDrawdown,
    totalReturn: eq.totalReturn,
    benchmarkReturn,
    alpha: eq.totalReturn - benchmarkReturn,
    maxSimultaneous: maxSim,
    skippedOverlap,
    skippedInvalid,
    capitalUtilization: Math.min(100, (openSum / Math.max(1, candles.length)) / maxPos * 100),
    sampleEnough: trades.length >= 20,
    sampleLabel: label,
    returns: nets,
    equity: eq.equity,
    tradesLog: trades,
    dataQuality: dq,
  };
}

export interface ForwardStats {
  up2d24h: number | null;
  up5d7d: number | null;
  n: number;
  mean7: number | null;
  median7: number | null;
  best7: number | null;
  /** Soma ganhos/soma |perdas| em 7d; Infinity sem perdas. */
  pf7: number | null;
  sampleLabel: SampleLabel;
}

export function signalForwardStats(candles: Candle[], threshold = 80): ForwardStats {
  const r1: number[] = [];
  const r7: number[] = [];
  if (candles.length < 60) {
    return { up2d24h: null, up5d7d: null, n: 0, mean7: null, median7: null, best7: null, pf7: null, sampleLabel: 'insuficiente' };
  }
  for (let i = 50; i < candles.length - 7; i++) {
    const s = scoreAsset({ symbol: 'S', candles: candles.slice(0, i + 1) });
    if (s.score >= threshold) {
      const e = candles[i].close;
      if (e > 0) {
        r1.push(candles[i + 1].close / e - 1);
        r7.push(candles[i + 7].close / e - 1);
      }
    }
  }
  if (r1.length < 10) {
    return { up2d24h: null, up5d7d: null, n: r1.length, mean7: null, median7: null, best7: null, pf7: null, sampleLabel: sampleLabel(r1.length) };
  }
  const gW = r7.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const gL = Math.abs(r7.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
  return {
    up2d24h: (r1.filter((r) => r >= 0.02).length / r1.length) * 100,
    up5d7d: (r7.filter((r) => r >= 0.05).length / r7.length) * 100,
    n: r1.length,
    mean7: (r7.reduce((a, b) => a + b, 0) / r7.length) * 100,
    median7: median(r7) * 100,
    best7: Math.max(...r7) * 100,
    pf7: gL === 0 ? (gW > 0 ? Infinity : 0) : gW / gL,
    sampleLabel: sampleLabel(r1.length),
  };
}
