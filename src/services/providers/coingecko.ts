import { fetchWithTimeout, retry } from '@/services/cache';
// Usa proxy local /api/coingecko em dev para evitar rate-limit/CORS; cai para API direta.
function base(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') return '/api/coingecko';
  return 'https://api.coingecko.com/api/v3';
}
export interface GeckoMarket {
  id: string; symbol: string; name: string; current_price: number;
  market_cap: number; total_volume: number;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}
export async function geckoMarkets(ids: string[]): Promise<GeckoMarket[]> {
  return retry(async () => {
    const url = `${base()}/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=1h,24h,7d`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    return (await r.json()) as GeckoMarket[];
  }, 1);
}
export async function geckoGlobal(): Promise<{ btcDominance: number; totalMcap: number }> {
  const r = await fetchWithTimeout(`${base()}/global`);
  if (!r.ok) throw new Error(`CoinGecko global ${r.status}`);
  const j = (await r.json()) as { data: { market_cap_percentage: { btc: number }; total_market_cap: { usd: number } } };
  return { btcDominance: j.data.market_cap_percentage.btc, totalMcap: j.data.total_market_cap.usd };
}
export interface GeckoCategory {
  id: string;
  name: string;
  market_cap: number;
  market_cap_change_24h: number | null;
  top_3_coins: string[];
}
export async function geckoCategories(): Promise<GeckoCategory[]> {
  const r = await fetchWithTimeout(`${base()}/coins/categories?order=market_cap_desc`);
  if (!r.ok) throw new Error(`Categories ${r.status}`);
  return ((await r.json()) as GeckoCategory[]).filter((c) => c.market_cap > 0).slice(0, 30);
}
export async function geckoTrending(): Promise<{ symbol: string; name: string }[]> {
  const r = await fetchWithTimeout(`${base()}/search/trending`);
  if (!r.ok) throw new Error(`Trending ${r.status}`);
  const j = (await r.json()) as { coins: { item: { symbol: string; name: string } }[] };
  return j.coins.slice(0, 7).map((c) => ({ symbol: c.item.symbol.toUpperCase(), name: c.item.name }));
}
export async function geckoHistory30d(id: string): Promise<number[]> {
  const r = await fetchWithTimeout(`${base()}/coins/${id}/market_chart?vs_currency=usd&days=30`);
  if (!r.ok) throw new Error(`History ${r.status}`);
  const j = (await r.json()) as { prices: [number, number][] };
  return j.prices.map((p) => p[1]);
}
