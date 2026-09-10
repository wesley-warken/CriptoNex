import { fetchWithTimeout } from '@/services/cache';

const FAPI = 'https://fapi.binance.com';

export interface FundingRow {
  symbol: string;
  rate: number;
  time: number;
  markPrice?: number | null;
}

export interface OiPoint {
  time: number;
  openInterest: number;
  openInterestValue: number;
}

export interface RatioPoint {
  time: number;
  longShortRatio: number;
  longAccount?: number;
  shortAccount?: number;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetchWithTimeout(`${FAPI}${path}`, 15000);
  if (!r.ok) throw new Error(`Derivativos ${r.status}`);
  return (await r.json()) as T;
}

/** Funding atual dos principais pares USDT-M (base para heatmap de posicionamento). */
export async function topFunding(limit = 30): Promise<FundingRow[]> {
  const [prem, funding] = await Promise.all([
    get<{ symbol: string; markPrice: string }[]>('/fapi/v1/premiumIndex'),
    get<{ symbol: string; fundingRate: string; fundingTime: number }[]>('/fapi/v1/fundingRate'),
  ]);
  const mark = new Map(prem.map((p) => [p.symbol, parseFloat(p.markPrice)]));
  return funding
    .filter((f) => f.symbol.endsWith('USDT'))
    .map((f) => ({ symbol: f.symbol.replace(/USDT$/, ''), rate: parseFloat(f.fundingRate), time: f.fundingTime, markPrice: mark.get(f.symbol) ?? null }))
    .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
    .slice(0, limit);
}

export async function fundingHistory(symbol: string, limit = 60): Promise<{ time: number; rate: number }[]> {
  const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const rows = await get<{ fundingRate: string; fundingTime: number }[]>(`/fapi/v1/fundingRate?symbol=${pair}&limit=${Math.min(100, limit)}`);
  return rows.map((r) => ({ time: r.fundingTime, rate: parseFloat(r.fundingRate) }));
}

export async function openInterestHist(symbol: string, period = '1h', limit = 60): Promise<OiPoint[]> {
  const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const rows = await get<{ timestamp: number; sumOpenInterest: string; sumOpenInterestValue: string }[]>(
    `/futures/data/openInterestHist?symbol=${pair}&period=${period}&limit=${Math.min(200, limit)}`,
  );
  return rows.map((r) => ({ time: r.timestamp, openInterest: parseFloat(r.sumOpenInterest), openInterestValue: parseFloat(r.sumOpenInterestValue) }));
}

export async function longShortRatio(symbol: string, period = '1h', limit = 60): Promise<RatioPoint[]> {
  const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const rows = await get<{ timestamp: number; longShortRatio: string; longAccount: string; shortAccount: string }[]>(
    `/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=${period}&limit=${Math.min(200, limit)}`,
  );
  return rows.map((r) => ({ time: r.timestamp, longShortRatio: parseFloat(r.longShortRatio), longAccount: parseFloat(r.longAccount), shortAccount: parseFloat(r.shortAccount) }));
}

export async function takerRatio(symbol: string, period = '1h', limit = 60): Promise<RatioPoint[]> {
  const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const rows = await get<{ timestamp: number; buySellRatio: string; buyVol: string; sellVol: string }[]>(
    `/futures/data/takerlongshortRatio?symbol=${pair}&period=${period}&limit=${Math.min(200, limit)}`,
  );
  return rows.map((r) => ({ time: r.timestamp, longShortRatio: parseFloat(r.buySellRatio), longAccount: parseFloat(r.buyVol), shortAccount: parseFloat(r.sellVol) }));
}
