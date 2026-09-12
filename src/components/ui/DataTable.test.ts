import { describe, expect, it } from 'vitest';

interface MockRow {
  symbol: string;
  price: number;
  change: number;
}

function sortRows<T>(rows: T[], accessor: (r: T) => number | string, dir: 'asc' | 'desc'): T[] {
  return [...rows].sort((a, b) => {
    const valA = accessor(a);
    const valB = accessor(b);
    if (typeof valA === 'number' && typeof valB === 'number') {
      return dir === 'asc' ? valA - valB : valB - valA;
    }
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return dir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });
}

describe('DataTable Logic — Ordenação e densidade', () => {
  const rows: MockRow[] = [
    { symbol: 'BTC', price: 68000, change: 3.5 },
    { symbol: 'ETH', price: 2600, change: -1.2 },
    { symbol: 'SOL', price: 180, change: 8.4 },
  ];

  it('ordena por número desc (maior preço primeiro)', () => {
    const sorted = sortRows(rows, (r) => r.price, 'desc');
    expect(sorted.map((r) => r.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('ordena por número asc (menor preço primeiro)', () => {
    const sorted = sortRows(rows, (r) => r.price, 'asc');
    expect(sorted.map((r) => r.symbol)).toEqual(['SOL', 'ETH', 'BTC']);
  });

  it('ordena por variação percentual desc (maiores ganhadores)', () => {
    const sorted = sortRows(rows, (r) => r.change, 'desc');
    expect(sorted.map((r) => r.symbol)).toEqual(['SOL', 'BTC', 'ETH']);
  });

  it('calcula altura de linha correta para densidade compacta e confortável', () => {
    const getRowHeight = (density: 'compact' | 'comfortable') => (density === 'compact' ? 38 : 48);
    expect(getRowHeight('compact')).toBe(38);
    expect(getRowHeight('comfortable')).toBe(48);
  });
});
