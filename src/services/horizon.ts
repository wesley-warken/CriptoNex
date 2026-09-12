import { fetchMtfCandles, resampleCandles, resolveAsset } from '@/services/assetCandles';
import { scoreAsset } from '@/engine/scoring';
import { snapshot, calcSupertrend } from '@/engine/indicators';
import { cmf } from '@/engine/moneyflow';
import { consensusOf } from '@/engine/trend';
import { buildSwingPlan } from '@/engine/horizon/swingPlan';
import { validateCandles } from '@/engine/dataQuality';
import { idbGet, idbSet } from '@/lib/idb';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import type { HorizonFacts } from '@/engine/horizon/types';
import type { Candle } from '@/types';

export const HORIZON_TTL_MS = 60 * 60 * 1000;
/** Chave de cache IDB dos fatos stage-2 (reuso p/ leitura leve, ex.: brief). */
export const horizonCacheKey = (symbol: string) => `cc.horizon:v1:${symbol}`;
const HZ_KEY = horizonCacheKey;
const CANDIDATE_CAP = 120;
const CONCURRENCY = 2;
const GAP_MS = 1200;
const WEEK_MS = 7 * 86400_000;

export interface HorizonCandidate {
  symbol: string;
  name: string;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
}

export interface HorizonProgress {
  done: number;
  total: number;
}

export interface HorizonResult {
  facts: HorizonFacts[];
  errors: { symbol: string; reason: string }[];
  skippedNoPair: number;
  skippedShort: number;
  skippedFailed: number;
}

const pairOf = (() => {
  let m: Map<string, string> | null = null;
  return (symbol: string): string | null => {
    if (!m) m = new Map(CRYPTO_ASSETS.filter((a) => a.binanceSymbol).map((a) => [a.symbol, a.binanceSymbol as string]));
    return m.get(symbol) ?? null;
  };
})();

/** Pares conhecidos primeiro (evita sondar pares inexistentes), teto de candidatos. */
export function orderCandidates(items: HorizonCandidate[], cap = CANDIDATE_CAP): HorizonCandidate[] {
  const known = items.filter((c) => pairOf(c.symbol) != null);
  const rest = items.filter((c) => pairOf(c.symbol) == null);
  return [...known, ...rest].slice(0, cap);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function factsFor(c: HorizonCandidate): Promise<HorizonFacts | 'no-pair' | 'short'> {
  const resolved = resolveAsset(c.symbol);
  if (resolved.kind !== 'crypto' || !resolved.binanceSymbol) return 'no-pair';
  const asset = { ...resolved, yahooSymbol: null };
  const d1 = await fetchMtfCandles(asset, '1d');
  if (d1.length < 60) return 'short';
  let w1: Candle[];
  try {
    w1 = await fetchMtfCandles(asset, '1w');
  } catch {
    w1 = [];
  }
  if (w1.length < 15) {
    try {
      w1 = resampleCandles(d1, WEEK_MS);
    } catch {
      w1 = [];
    }
  }
  const price = d1.length ? d1[d1.length - 1].close : 0;
  if (!(price > 0)) return 'short';
  const fetchedAt = Date.now();
  const s1d = snapshot(d1);
  const score1d = scoreAsset({ symbol: c.symbol, candles: d1, provider: 'multi-fonte', fetchedAt });
  const atr = s1d.atr ?? null;
  const plan = buildSwingPlan(d1, 'BUY', atr);
  const highs20 = d1.slice(-20).map((k) => k.high);
  const maxHigh20 = highs20.length ? Math.max(...highs20) : NaN;
  const dq = validateCandles(d1, { provider: 'multi-fonte', fetchedAt, timeframe: '1d', market: 'crypto', minCandles: 60 });
  const closesW = w1.map((k) => k.close);
  const highsW = w1.map((k) => k.high);
  const lowsW = w1.map((k) => k.low);
  return {
    symbol: c.symbol,
    name: c.name || c.symbol,
    price,
    change7d: c.change7d,
    marketCap: c.marketCap,
    volume24h: c.volume24h,
    score1d,
    rsiD: s1d.rsi ?? null,
    macdBull: s1d.macdHist == null ? null : s1d.macdHist > 0,
    volRatio: s1d.volumeRatio ?? null,
    cmfD: (() => {
      try {
        const v = cmf(d1);
        return v != null && Number.isFinite(v) ? v : null;
      } catch {
        return null;
      }
    })(),
    atrPct: atr != null && price > 0 ? (atr / price) * 100 : null,
    superD: calcSupertrend(d1),
    trendW: w1.length >= 15 ? consensusOf(closesW, highsW, lowsW) : null,
    trendD: consensusOf(
      d1.map((k) => k.close),
      d1.map((k) => k.high),
      d1.map((k) => k.low),
    ),
    distHigh20Pct: Number.isFinite(maxHigh20) && maxHigh20 > 0 ? (maxHigh20 / price - 1) * 100 : null,
    plan,
    dqScore: dq.score,
    provider: 'multi-fonte',
    fetchedAt,
    candles: d1.length,
  };
}

/**
 * Stage-2 do horizonte: 1d+1w por candidato (cache IDB 60min, concorrência 2,
 * pausa via AbortSignal). Reutiliza fetchMtfCandles/scoreAsset/snapshot —
 * nenhum motor novo de scoring.
 */
export async function analyzeHorizons(
  candidates: HorizonCandidate[],
  onProgress?: (p: HorizonProgress) => void,
  signal?: AbortSignal,
): Promise<HorizonResult> {
  const queue = orderCandidates(candidates);
  const facts: HorizonFacts[] = [];
  const errors: { symbol: string; reason: string }[] = [];
  let skippedNoPair = 0;
  let skippedShort = 0;
  let skippedFailed = 0;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.({ done, total: queue.length });
  };
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    if (signal?.aborted) break;
    type Item =
      | { kind: 'hit'; c: HorizonCandidate; facts: HorizonFacts }
      | { kind: 'skip'; c: HorizonCandidate; skip: 'nopair' | 'short' }
      | { kind: 'fail'; c: HorizonCandidate; error: string };
    const batch: Item[] = await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(async (c): Promise<Item> => {
        try {
          const cached = await idbGet<HorizonFacts>(HZ_KEY(c.symbol));
          if (cached && !cached.stale) return { kind: 'hit', c, facts: cached.data as HorizonFacts };
          const f = await factsFor(c);
          if (f === 'no-pair') return { kind: 'skip', c, skip: 'nopair' };
          if (f === 'short') return { kind: 'skip', c, skip: 'short' };
          await idbSet(HZ_KEY(c.symbol), f, HORIZON_TTL_MS);
          return { kind: 'hit', c, facts: f };
        } catch (e) {
          return { kind: 'fail', c, error: e instanceof Error ? e.message : 'falha' };
        }
      }),
    );
    for (const r of batch) {
      if (r.kind === 'hit') {
        facts.push(r.facts);
      } else if (r.kind === 'skip') {
        if (r.skip === 'nopair') skippedNoPair += 1;
        else skippedShort += 1;
      } else {
        skippedFailed += 1;
        if (errors.length < 20) errors.push({ symbol: r.c.symbol, reason: r.error });
      }
      tick();
    }
    if (signal?.aborted) break;
    await sleep(GAP_MS);
  }
  return { facts, errors, skippedNoPair, skippedShort, skippedFailed };
}
