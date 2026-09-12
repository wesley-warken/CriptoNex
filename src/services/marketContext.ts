import { yahooChart } from '@/services/lookup';
import { classifyTrend, type TrendState } from '@/engine/trend';
import { idbGet, idbSet } from '@/lib/idb';

export interface IndexContext {
  symbol: string;
  label: string;
  ret7d: number | null;
  ret30d: number | null;
  trend: TrendState | null;
  last: number | null;
  updatedAt: number | null;
  reason: string | null;
}

export interface MarketContextData {
  computedAt: number;
  br: IndexContext;
  us: IndexContext;
}

const KEY = 'cc.mctx:v1';
/** Cadência semanal (cobre as leituras mensais): sem backend, recalcula ao abrir quando vencido. */
export const MCTX_TTL_MS = 7 * 86400_000;

export function needsRefresh(ts: number | null | undefined, now = Date.now(), ttl = MCTX_TTL_MS): boolean {
  return ts == null || !Number.isFinite(ts) || ts <= 0 || now - ts > ttl;
}

async function indexContext(symbol: string, label: string): Promise<IndexContext> {
  const fail = (reason: string): IndexContext => ({ symbol, label, ret7d: null, ret30d: null, trend: null, last: null, updatedAt: null, reason });
  try {
    const q = await yahooChart(symbol, '6mo', '1d');
    const closes = q.candles.map((c) => c.close).filter((v) => v > 0);
    if (closes.length < 35) return fail(`poucos candles (${closes.length})`);
    const last = closes[closes.length - 1];
    const c7 = closes[Math.max(0, closes.length - 8)];
    const c30 = closes[Math.max(0, closes.length - 31)];
    const ret7d = (last / c7 - 1) * 100;
    const ret30d = (last / c30 - 1) * 100;
    return { symbol, label, ret7d, ret30d, trend: classifyTrend(ret30d, 30), last, updatedAt: Date.now(), reason: null };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'falha de rede');
  }
}

/** Cache primeiro (mesmo vencido, com flag): nunca tela vazia por rede lenta. */
export async function loadMarketContext(): Promise<{ data: MarketContextData | null; stale: boolean }> {
  try {
    const r = await idbGet<MarketContextData>(KEY);
    if (r) return { data: r.data, stale: r.stale };
  } catch {
    /* sem cache */
  }
  return { data: null, stale: true };
}

export async function refreshMarketContext(): Promise<MarketContextData> {
  const [br, us] = await Promise.all([indexContext('^BVSP', 'Ibovespa'), indexContext('^GSPC', 'S&P 500')]);
  const data: MarketContextData = { computedAt: Date.now(), br, us };
  try {
    await idbSet(KEY, data, MCTX_TTL_MS);
  } catch {
    /* IDB indisponível: segue em memória */
  }
  return data;
}
