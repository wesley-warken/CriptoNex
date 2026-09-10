import { describe, it, expect } from 'vitest';
import { summarize, totals, type Operation } from '@/lib/portfolio';
import { convert, type FxRates } from '@/services/fx';

const R: FxRates = { USDBRL: 5, EURUSD: 1.1, GBPUSD: 1.25, ts: 0 };

function op(o: Partial<Operation> & { symbol: string }): Operation {
  return { id: Math.random().toString(), walletId: 'w1', kind: 'crypto', side: 'buy', quantity: 1, price: 100, date: '2025-01-01', ...o };
}

describe('portfolio engine', () => {
  it('compra + valorização = lucro não realizado', () => {
    const rows = summarize([op({ symbol: 'BTC', quantity: 1, price: 100 })], { BTC: 150 });
    expect(rows[0].quantity).toBe(1);
    expect(rows[0].avgCost).toBe(100);
    expect(rows[0].unrealized).toBe(50);
    expect(rows[0].realized).toBe(0);
  });
  it('venda parcial realiza lucro e reduz custo médio proporcional', () => {
    const rows = summarize(
      [op({ symbol: 'BTC', quantity: 2, price: 100 }), op({ symbol: 'BTC', side: 'sell', quantity: 1, price: 150, date: '2025-02-01' })],
      { BTC: 150 },
    );
    expect(rows[0].quantity).toBe(1);
    expect(rows[0].realized).toBe(50);
    expect(rows[0].unrealized).toBe(50);
  });
  it('venda maior que posição limita na posição (sem quantidade negativa)', () => {
    const rows = summarize(
      [op({ symbol: 'BTC', quantity: 1, price: 100 }), op({ symbol: 'BTC', side: 'sell', quantity: 5, price: 200, date: '2025-02-01' })],
      { BTC: 200 },
    );
    expect(rows[0].quantity).toBe(0);
    expect(rows[0].realized).toBe(100);
  });
  it('filtro por carteira', () => {
    const rows = summarize([op({ symbol: 'A' }), op({ symbol: 'B', walletId: 'w2' })], { A: 1, B: 1 }, 'w1');
    expect(rows.map((r) => r.symbol)).toEqual(['A']);
  });
  it('método padrão soma realizado; investidor destaca não realizado', () => {
    const rows = summarize(
      [op({ symbol: 'BTC', quantity: 1, price: 100 }), op({ symbol: 'BTC', side: 'sell', quantity: 1, price: 200, date: '2025-02-01' })],
      { BTC: 200 },
    );
    expect(totals(rows, 'standard').headline).toBe(100);
    expect(totals(rows, 'investor').headline).toBe(0);
    expect(totals(rows, 'investor').realized).toBe(100);
  });
});

describe('fx', () => {
  it('converte USD/BRL/EUR com consistência', () => {
    expect(convert(100, 'USD', 'BRL', R)).toBe(500);
    expect(convert(500, 'BRL', 'USD', R)).toBe(100);
    expect(convert(110, 'USD', 'EUR', R)).toBeCloseTo(100);
    expect(convert(50, 'EUR', 'BRL', R)).toBeCloseTo(275);
    expect(convert(125, 'GBP', 'USD', R)).toBeCloseTo(156.25);
  });
});
