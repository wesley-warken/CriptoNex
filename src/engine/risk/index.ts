import type { PortfolioPosition } from '@/types';
export function positionSize(entry: number, stop: number, riskAmount: number): number {
  const dist = Math.abs(entry - stop);
  if (dist <= 0 || riskAmount <= 0) return 0;
  return riskAmount / dist;
}
export function riskReward(entry: number, stop: number, target: number): number | null {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return null;
  return reward / risk;
}
export function allocation(positions: PortfolioPosition[], prices: Record<string, number>) {
  const vals = positions.map((p) => ({ ...p, value: (prices[p.symbol] ?? p.avgPrice) * p.quantity }));
  const total = vals.reduce((a, b) => a + b.value, 0);
  return { items: vals, total };
}
