export type OpSide = 'buy' | 'sell';
export type AssetKind = 'crypto' | 'stock';
import type { Conviction } from '@/engine/ranking';

export interface Wallet {
  id: string;
  name: string;
  createdAt: string;
}

export interface Operation {
  id: string;
  walletId: string;
  kind: AssetKind;
  symbol: string;
  side: OpSide;
  quantity: number;
  price: number;
  date: string;
  note?: string;
  /** Contexto da aba Oportunidades no momento da criação (Fase 4). */
  entryTier?: Conviction;
  entryScore?: number;
  entryRR?: number | null;
  entryStretch?: number | null;
  entryConfFull?: boolean;
}

export interface PositionSummary {
  symbol: string;
  kind: AssetKind;
  quantity: number;
  avgCost: number;
  openCost: number;
  realized: number;
  marketValue: number;
  unrealized: number;
  totalPnl: number;
  returnPct: number;
}

/** Custo médio: compras somam; vendas baixam na média e realizam lucro/prejuízo. */
export function summarize(
  ops: Operation[],
  prices: Record<string, number>,
  walletId?: string,
): PositionSummary[] {
  const filtered = walletId && walletId !== 'ALL' ? ops.filter((o) => o.walletId === walletId) : ops;
  const by = new Map<string, { kind: AssetKind; qty: number; cost: number; realized: number }>();
  for (const o of [...filtered].sort((a, b) => a.date.localeCompare(b.date))) {
    if (o.quantity <= 0 || o.price < 0) continue;
    let p = by.get(o.symbol);
    if (!p) {
      p = { kind: o.kind, qty: 0, cost: 0, realized: 0 };
      by.set(o.symbol, p);
    }
    if (o.side === 'buy') {
      p.qty += o.quantity;
      p.cost += o.quantity * o.price;
    } else {
      const closable = Math.min(o.quantity, p.qty);
      const avg = p.qty > 0 ? p.cost / p.qty : o.price;
      p.realized += closable * (o.price - avg);
      p.qty -= closable;
      p.cost -= closable * avg;
      if (p.qty <= 1e-9) {
        p.qty = 0;
        p.cost = 0;
      }
    }
  }
  const out: PositionSummary[] = [];
  for (const [symbol, p] of by) {
    const px = prices[symbol] ?? (p.qty > 0 ? p.cost / p.qty : 0);
    const mv = p.qty * px;
    const unreal = mv - p.cost;
    const total = unreal + p.realized;
    const base = p.cost + Math.max(0, -p.realized);
    out.push({
      symbol,
      kind: p.kind,
      quantity: p.qty,
      avgCost: p.qty > 0 ? p.cost / p.qty : 0,
      openCost: p.cost,
      realized: p.realized,
      marketValue: mv,
      unrealized: unreal,
      totalPnl: total,
      returnPct: base > 0 ? (total / base) * 100 : 0,
    });
  }
  return out.sort((a, b) => b.marketValue - a.marketValue);
}

export interface PortfolioTotals {
  invested: number;
  current: number;
  realized: number;
  unrealized: number;
  headline: number;
  headlinePct: number;
}

export interface TierTradeStats {
  trades: number;
  wins: number;
  pnl: number;
}

/**
 * Win rate e PnL por tier de entrada (Fase 4): vendas casadas por FIFO aos
 * lotes de compra; cada venda conta 1 trade no tier de pluralidade dos
 * lotes consumidos; PnL é atribuído por fração exata. Sem tag → 'SEM_TAG'.
 */
export function statsByEntryTier(ops: Operation[]): { byTier: Record<string, TierTradeStats>; closedTrades: number } {
  const byTier: Record<string, TierTradeStats> = {};
  const lots = new Map<string, { qty: number; price: number; tier: string }[]>();
  const bucket = (t: string): TierTradeStats => (byTier[t] ??= { trades: 0, wins: 0, pnl: 0 });
  let closedTrades = 0;
  for (const o of [...ops].sort((a, b) => a.date.localeCompare(b.date))) {
    if (o.quantity <= 0 || o.price < 0) continue;
    if (o.side === 'buy') {
      const q = lots.get(o.symbol) ?? [];
      q.push({ qty: o.quantity, price: o.price, tier: o.entryTier ?? 'SEM_TAG' });
      lots.set(o.symbol, q);
    } else {
      const q = lots.get(o.symbol) ?? [];
      const held = q.reduce((s, l) => s + l.qty, 0);
      let left = Math.min(o.quantity, held);
      if (!(left > 0)) continue;
      const used = new Map<string, number>();
      let pnl = 0;
      while (left > 1e-9 && q.length) {
        const lot = q[0];
        const take = Math.min(left, lot.qty);
        pnl += take * (o.price - lot.price);
        used.set(lot.tier, (used.get(lot.tier) ?? 0) + take);
        lot.qty -= take;
        left -= take;
        if (lot.qty <= 1e-9) q.shift();
      }
      const tier = [...used.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const b = bucket(tier);
      b.trades += 1;
      b.pnl += pnl;
      if (pnl > 0) b.wins += 1;
      closedTrades += 1;
    }
  }
  return { byTier, closedTrades };
}

/**
 * Método Padrão: lucro é lucro (realizado + não realizado).
 * Método Investidor: destaque no não realizado; realizado sai do acompanhamento.
 */
export function totals(rows: PositionSummary[], method: 'standard' | 'investor'): PortfolioTotals {
  const openCost = rows.reduce((s, r) => s + r.openCost, 0);
  const current = rows.reduce((s, r) => s + r.marketValue, 0);
  const realized = rows.reduce((s, r) => s + r.realized, 0);
  const unrealized = current - openCost;
  const invested = openCost + rows.reduce((s, r) => s + Math.max(0, -r.realized), 0);
  const headline = method === 'standard' ? realized + unrealized : unrealized;
  const base = method === 'standard' ? Math.max(invested, 1e-9) : Math.max(openCost, 1e-9);
  return { invested, current, realized, unrealized, headline, headlinePct: (headline / base) * 100 };
}
