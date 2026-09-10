export type OpSide = 'buy' | 'sell';
export type AssetKind = 'crypto' | 'stock';

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
