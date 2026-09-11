import { describe, expect, it } from 'vitest';
import { statsByEntryTier, type Operation } from './portfolio';

function op(o: Partial<Operation> & { symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; date: string }): Operation {
  return { id: `${o.symbol}-${o.side}-${o.date}`, walletId: 'main', kind: 'crypto', ...o };
}

describe('statsByEntryTier — FIFO por tier de entrada', () => {
  it('casa vendas aos lotes e agrega win rate/PnL por tier', () => {
    const ops = [
      op({ symbol: 'BTC', side: 'buy', quantity: 1, price: 100, date: '2026-01-01', entryTier: 'ELITE' }),
      op({ symbol: 'BTC', side: 'buy', quantity: 1, price: 110, date: '2026-01-02', entryTier: 'FORTE' }),
      op({ symbol: 'BTC', side: 'sell', quantity: 1, price: 130, date: '2026-01-03' }), // consome lote ELITE: +30
      op({ symbol: 'ETH', side: 'buy', quantity: 2, price: 50, date: '2026-01-01' }), // sem tag
      op({ symbol: 'ETH', side: 'sell', quantity: 2, price: 40, date: '2026-01-04' }), // −20
    ];
    const { byTier, closedTrades } = statsByEntryTier(ops);
    expect(closedTrades).toBe(2);
    expect(byTier.ELITE).toMatchObject({ trades: 1, wins: 1, pnl: 30 });
    expect(byTier.SEM_TAG).toMatchObject({ trades: 1, wins: 0, pnl: -20 });
    expect(byTier.FORTE).toBeUndefined();
  });
  it('venda parcial consome FIFO e venda sem lote é ignorada', () => {
    const ops = [
      op({ symbol: 'X', side: 'buy', quantity: 1, price: 10, date: '2026-01-01', entryTier: 'FORTE' }),
      op({ symbol: 'X', side: 'sell', quantity: 0.4, price: 20, date: '2026-01-02' }), // +4
      op({ symbol: 'X', side: 'sell', quantity: 0.6, price: 5, date: '2026-01-03' }), // −3
      op({ symbol: 'Y', side: 'sell', quantity: 1, price: 99, date: '2026-01-04' }), // sem lote: ignora
    ];
    const { byTier, closedTrades } = statsByEntryTier(ops);
    expect(closedTrades).toBe(2);
    expect(byTier.FORTE.trades).toBe(2);
    expect(byTier.FORTE.wins).toBe(1);
    expect(byTier.FORTE.pnl).toBeCloseTo(1, 9);
  });
});
