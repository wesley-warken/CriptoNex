export interface UniverseCoin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  marketCap: number | null;
  volume24h: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  change1y: number | null;
  /** Rank oficial por market cap (CoinGecko `market_cap_rank`). Ausente em cache antigo. */
  rank?: number | null;
  spark7d?: number[];
  image?: string;
}

export interface StockEntry {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
  kind: 'stock' | 'etf' | 'index' | 'commodity' | 'fx' | 'crypto';
  price?: number | null;
  change?: number | null;
}

export interface LookupResult extends StockEntry {
  quoteType: string;
}

export const STABLE_SYMS = new Set([
  'USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'TUSD', 'PYUSD', 'USDD',
  'FRAX', 'LUSD', 'GUSD', 'BUSD', 'USTC', 'USDP', 'SUSD', 'EURS',
  'USDBC', 'USDY', 'CRVUSD', 'GHO', 'USDK', 'XAUT', 'PAXG',
]);

export function isStablecoin(c: Pick<UniverseCoin, 'symbol'>): boolean {
  return STABLE_SYMS.has(c.symbol.toUpperCase());
}

export function isActiveCoin(c: Pick<UniverseCoin, 'volume24h'>): boolean {
  return (c.volume24h ?? 0) > 0;
}

export function mergeUniverse(existing: UniverseCoin[], page: UniverseCoin[]): UniverseCoin[] {
  if (!existing.length) return page;
  const seen = new Set(existing.map((c) => c.id));
  const out = [...existing];
  for (const c of page) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---- Nasdaq TSV (Symbol|Security Name|...) com rodapé "File Creation Time" ----
export interface NasdaqRow {
  symbol: string;
  name: string;
  exchange: string;
}

export function parseNasdaqTsv(text: string, fallbackExchange: string): NasdaqRow[] {
  const out: NasdaqRow[] = [];
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return out;
  const header = lines[0].split('|').map((h) => h.trim().toLowerCase());
  const symIdx = header.findIndex((h) => h === 'symbol' || h === 'nasdaq symbol');
  const nameIdx = header.findIndex((h) => h.includes('security name') || h === 'name' || h === 'description');
  const exchIdx = header.findIndex((h) => h === 'exchange' || h === 'listing exchange');
  const testIdx = header.findIndex((h) => h === 'test issue');
  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith('File Creation Time')) continue;
    const cols = t.split('|');
    if (testIdx >= 0 && (cols[testIdx] ?? '').trim().toUpperCase() === 'Y') continue;
    const symbol = (cols[symIdx] ?? '').trim();
    if (!symbol || symbol.includes(' ') || symIdx < 0) continue;
    out.push({
      symbol,
      name: (cols[nameIdx] ?? symbol).trim(),
      exchange: exchIdx >= 0 && cols[exchIdx] ? cols[exchIdx].trim() : fallbackExchange,
    });
  }
  return out;
}

// ---- Yahoo lookup ----
interface YahooLookupDoc {
  symbol: string;
  shortname?: string;
  shortName?: string;
  longname?: string;
  longName?: string;
  quoteType?: string;
  quotetype?: string;
  exchange?: string;
  exchDisp?: string;
  exchdisp?: string;
}

export function normalizeLookup(docs: YahooLookupDoc[] | { documents?: YahooLookupDoc[] }): LookupResult[] {
  const arr: YahooLookupDoc[] = Array.isArray(docs) ? docs : (docs.documents ?? []);
  // Yahoo às vezes retorna grupos {documents:[...]} dentro do array result
  const flat: YahooLookupDoc[] = [];
  for (const d of arr) {
    const docs2 = (d as { documents?: YahooLookupDoc[] }).documents;
    if (Array.isArray(docs2)) flat.push(...docs2);
    else flat.push(d);
  }
  const kindOf = (q: string): LookupResult['kind'] => {
    const t = q.toUpperCase();
    if (t === 'EQUITY') return 'stock';
    if (t === 'ETF') return 'etf';
    if (t === 'INDEX') return 'index';
    if (t === 'FUTURE' || t === 'COMMODITY') return 'commodity';
    if (t === 'CURRENCY') return 'fx';
    if (t === 'CRYPTOCURRENCY') return 'crypto';
    return 'stock';
  };
  return flat
    .filter((d) => d.symbol)
    .map((d) => {
      const qt = d.quoteType ?? d.quotetype ?? 'EQUITY';
      return {
        symbol: d.symbol,
        name: d.longname ?? d.longName ?? d.shortname ?? d.shortName ?? d.symbol,
        exchange: d.exchDisp ?? d.exchdisp ?? d.exchange ?? '',
        quoteType: qt,
        kind: kindOf(qt),
      };
    });
}
