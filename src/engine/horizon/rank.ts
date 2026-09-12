import { TREND_LEVEL, type TrendState } from '@/engine/trend';
import { classifyScore } from '@/engine/scoring/scoring.config';
import { effectiveTier, stretchPercentiles, type Conviction, type TierGates } from '@/engine/ranking';
import { tierHit, tierAvgRR } from '@/services/walkforward';
import type { WFStats } from '@/workers/walkforward';
import type { ConfluenceData } from '@/types';
import { HORIZONS, type HorizonKey } from './horizons';
import { classifySetup, SETUP_LABELS, type SetupKind } from './setups';
import { assessDemand, applyDemandGate } from './demand';
import { buildInvalidation } from './swingPlan';
import type {
  Evidence, HorizonFacts, HorizonOpportunity, Liquidity, RegimeFit,
} from './types';

export interface HorizonFactors {
  trendW: number;
  trendD: number;
  regime: number;
  rs: number;
  struct: number;
  vol: number;
  volat: number;
  liq: number;
}

/**
 * Score 0–100 do horizonte: soma ponderada dos fatores (pesos em
 * horizons.ts, somam 100). Ranking técnico — NÃO probabilidade.
 */
export function horizonScore(f: HorizonFactors, def = HORIZONS['4m']): number {
  const w = def.weights;
  const s =
    f.trendW * w.trendW + f.trendD * w.trendD + f.regime * w.regime + f.rs * w.rs +
    f.struct * w.struct + f.vol * w.vol + f.volat * w.volat + f.liq * w.liq;
  return Math.max(0, Math.min(100, Math.round(s / 100)));
}

/** Alta: mcap ≥ 1 bi + vol24h ≥ 50 mi · Média: ≥ 100 mi + ≥ 5 mi · resto: baixa. */
export function liquidityOf(marketCap: number | null, volume24h: number | null): Liquidity {
  if (marketCap != null && volume24h != null && marketCap >= 1e9 && volume24h >= 5e7) return 'alta';
  if (marketCap != null && volume24h != null && marketCap >= 1e8 && volume24h >= 5e6) return 'media';
  return 'baixa';
}

/** Encaixe LONG com o regime (setups v1 são comprados). */
export function regimeFit(signal: 'BUY', regimeLabel: string): RegimeFit {
  if (regimeLabel.includes('RISK-ON')) return 'favoravel';
  if (regimeLabel.includes('RISK-OFF')) return 'contra';
  return 'neutro';
}

/** Classes de evidência da feature (N sempre exibido junto). */
export function evidenceLabel(n: number): Evidence['strength'] {
  if (n < 30) return 'insuficiente';
  if (n < 100) return 'limitada';
  if (n < 300) return 'moderada';
  return 'forte';
}

/** Percentil 0–100 ascendente sobre mapa (usado no RS, sem equivalente canônico). */
export function percentileMap(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.entries()].sort((a, b) => a[1] - b[1]);
  const map = new Map<string, number>();
  sorted.forEach(([s], i) => map.set(s, sorted.length <= 1 ? 50 : (i / (sorted.length - 1)) * 100));
  return map;
}

export interface BuildCtx {
  horizon: HorizonKey;
  regimeLabel: string;
  btcChange7d: number | null;
  gates?: TierGates;
  wf?: WFStats | null;
  confluenceOf?: (symbol: string) => ConfluenceData | null | undefined;
}

const trendPts = (t: TrendState | null): number => (t == null ? 40 : TREND_LEVEL[t] * 25);

function structPts(rr1: number | null, hurdle: number): number {
  if (rr1 == null) return 0;
  return Math.max(0, Math.min(100, (rr1 / hurdle / 1.5) * 100));
}

/**
 * Monta oportunidades a partir dos fatos (puro e testável): percentis de RS
 * e stretch no pool, setup, score do horizonte, tier efetivo (gates reais),
 * cenários/invalidação do plano e evidência walk-forward por tier.
 */
export function buildOpportunities(factsList: HorizonFacts[], ctx: BuildCtx): HorizonOpportunity[] {
  const def = HORIZONS[ctx.horizon];
  const rsRaw = new Map<string, number>();
  for (const f of factsList) {
    if (f.change7d != null && ctx.btcChange7d != null) rsRaw.set(f.symbol, f.change7d - ctx.btcChange7d);
  }
  const rsPct = percentileMap(rsRaw);
  // Stretch usa o helper canônico (mesma matemática, sem duplicar regra).
  const stretchPct = stretchPercentiles(
    factsList.filter((f) => f.score1d.stretchRaw != null).map((f) => ({ symbol: f.symbol, stretchRaw: f.score1d.stretchRaw as number })),
  );

  return factsList.map((f) => {
    const rs7 = f.change7d != null && ctx.btcChange7d != null ? f.change7d - ctx.btcChange7d : null;
    const sp = stretchPct.get(f.symbol) ?? null;
    const setup = classifySetup({
      trendW: f.trendW, trendD: f.trendD, rsiD: f.rsiD, macdBull: f.macdBull,
      volRatio: f.volRatio, atrPct: f.atrPct, stretchPct: sp, distHigh20Pct: f.distHigh20Pct,
    });
    const fit = regimeFit('BUY', ctx.regimeLabel);
    const liq = liquidityOf(f.marketCap, f.volume24h);
    const plan = f.plan;
    const tW = trendPts(f.trendW);
    const tD = trendPts(f.trendD);
    const score = horizonScore(
      {
        trendW: tW,
        trendD: tD,
        regime: fit === 'favoravel' ? 100 : fit === 'neutro' ? 50 : 0,
        rs: rsPct.get(f.symbol) ?? 40,
        struct: structPts(plan?.rr1 ?? null, def.minRR),
        vol: f.volRatio == null ? 40 : Math.min(100, (f.volRatio / 1.5) * 100),
        volat: f.atrPct == null ? 50 : f.atrPct <= 2.5 ? 100 : f.atrPct <= 4.5 ? 60 : 30,
        liq: liq === 'alta' ? 100 : liq === 'media' ? 60 : 20,
      },
      def,
    );
    const conf = ctx.confluenceOf?.(f.symbol) ?? null;
    const demand = assessDemand({ volRatio: f.volRatio, cmf: f.cmfD });
    const tier: Conviction = applyDemandGate(
      effectiveTier(
        {
          symbol: f.symbol, score, classification: classifyScore(score),
          confidence: f.score1d.confidence, dataQuality: f.dqScore,
          timeframeAlignment: f.score1d.timeframeAlignment, signal: 'BUY',
          breakdown: [], why: [], risks: [], confluence: conf,
        },
        { stretchPct: sp, gates: ctx.gates },
      ),
      demand.pass,
    );
    const extended = sp != null && sp >= 90;
    const entryDistPct = plan ? ((f.price - plan.ideal) / plan.ideal) * 100 : null;
    const basePct = plan ? ((plan.t2 - plan.ideal) / plan.ideal) * 100 : null;
    let evidence: Evidence | null = null;
    if (ctx.wf) {
      const h = Math.max(...ctx.wf.horizons);
      const hit = tierHit(ctx.wf, tier, h);
      const rr = tierAvgRR(ctx.wf, tier);
      const n = ctx.wf.perTier[tier]?.byHorizon[h]?.n ?? 0;
      evidence = {
        label: `Walk-forward ${h}d por tier (proxy p/ position)`,
        n, hit: hit?.hit ?? null, rr: rr?.rr ?? null, strength: evidenceLabel(n),
      };
    }
    return {
      symbol: f.symbol, name: f.name, price: f.price, horizon: ctx.horizon,
      setup: setup.kind, setupReasons: setup.reasons,
      score, confidence: f.score1d.confidence, tier,
      entryIdeal: plan?.ideal ?? null, entryLow: plan?.zoneLow ?? null, entryHigh: plan?.zoneHigh ?? null,
      entryDistPct, entryExtended: extended,
      stop: plan?.stop ?? null, t1: plan?.t1 ?? null, t2: plan?.t2 ?? null, t3: plan?.t3 ?? null,
      rr1: plan?.rr1 ?? null, rr2: plan?.rr2 ?? null, rr3: plan?.rr3 ?? null,
      stopPct: plan?.stopPct ?? null, basePct,
      scenarios: plan?.scenarios ?? [],
      invalidation: plan ? buildInvalidation({
        stop: plan.stop, side: 'long', supertrend: f.superD,
        regimeLabel: ctx.regimeLabel, rs7, stretchPct: sp,
      }) : [],
      why: [...setup.reasons, ...f.score1d.why.slice(0, 3)],
      risks: [...f.score1d.risks],
      regime: ctx.regimeLabel, regimeFit: fit,
      rs7, stretchPct: sp,
      demandPass: demand.pass,
      demandNote: demand.pass ? null : demand.reasons.join(' · '),
      trendScore: Math.round((tW + tD) / 2),
      volumeRatio: f.volRatio, atrPct: f.atrPct, liquidity: liq,
      dqScore: f.dqScore, provider: f.provider, updatedAt: f.fetchedAt,
      candles: f.candles, fresh: true,
      evidence, confFull: conf?.full ?? false,
      confLabel: conf ? `${conf.tfA}+${conf.tfB}` : null,
      signal: 'BUY',
    } as HorizonOpportunity;
  });
}

export interface RankFilters {
  setup: 'all' | SetupKind;
  tier: 'all' | 'ELITE' | 'FORTE';
  regimeFit: 'all' | RegimeFit;
  minRR: number;
  minScore: number;
  liquidity: 'all' | Liquidity;
  query: string;
}

export const DEFAULT_FILTERS: RankFilters = {
  setup: 'all', tier: 'all', regimeFit: 'all', minRR: 0, minScore: 60, liquidity: 'all', query: '',
};

/** Filtra + ordena (score, confiança, R:R). */
export function rankSetups(items: HorizonOpportunity[], f: RankFilters): HorizonOpportunity[] {
  const needle = f.query.trim().toLowerCase();
  return items
    .filter((o) => (f.setup === 'all' ? true : o.setup === f.setup))
    .filter((o) => (f.tier === 'all' ? true : o.tier === f.tier))
    .filter((o) => (f.regimeFit === 'all' ? true : o.regimeFit === f.regimeFit))
    .filter((o) => (f.minRR > 0 ? (o.rr1 ?? -Infinity) >= f.minRR : true))
    .filter((o) => o.score >= f.minScore)
    .filter((o) => (f.liquidity === 'all' ? true : o.liquidity === f.liquidity))
    .filter((o) => (!needle ? true : o.symbol.toLowerCase().includes(needle) || o.name.toLowerCase().includes(needle)))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || (b.rr1 ?? -1) - (a.rr1 ?? -1));
}

/** Melhor por critério (ignora nulos; null sem candidato). */
export function bestBy(items: HorizonOpportunity[], pick: (o: HorizonOpportunity) => number | null): HorizonOpportunity | null {
  let best: HorizonOpportunity | null = null;
  let bestV = -Infinity;
  for (const o of items) {
    const v = pick(o);
    if (v != null && v > bestV) {
      bestV = v;
      best = o;
    }
  }
  return best;
}

export { SETUP_LABELS };
