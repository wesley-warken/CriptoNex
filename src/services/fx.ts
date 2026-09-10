import { yahooChart } from '@/services/lookup';
import { idbGet, idbSet } from '@/lib/idb';

export type Fiat = 'USD' | 'BRL' | 'EUR' | 'GBP';

export interface FxRates {
  USDBRL: number;
  EURUSD: number;
  GBPUSD: number;
  ts: number;
}

const TTL = 60 * 60 * 1000;
let mem: FxRates | null = null;

export async function getFxRates(): Promise<FxRates> {
  if (mem && Date.now() - mem.ts < TTL) return mem;
  const cached = await idbGet<FxRates>('cc.quotes.cache:fx');
  if (cached && !cached.stale) {
    mem = cached.data;
    return mem;
  }
  const [brl, eur, gbp] = await Promise.all([
    yahooChart('BRL=X', '5d', '1d').catch(() => null),
    yahooChart('EURUSD=X', '5d', '1d').catch(() => null),
    yahooChart('GBPUSD=X', '5d', '1d').catch(() => null),
  ]);
  const out: FxRates = {
    USDBRL: brl?.price ?? cached?.data.USDBRL ?? 5,
    EURUSD: eur?.price ?? cached?.data.EURUSD ?? 1.08,
    GBPUSD: gbp?.price ?? cached?.data.GBPUSD ?? 1.27,
    ts: Date.now(),
  };
  mem = out;
  await idbSet('cc.quotes.cache:fx', out, TTL);
  return out;
}

/** Converte valor entre USD, BRL, EUR e GBP. GBp (pence) entra já dividido por 100. */
export function convert(amount: number, from: Fiat, to: Fiat, rates: FxRates): number {
  if (from === to) return amount;
  const toUSD = from === 'USD' ? amount : from === 'BRL' ? amount / rates.USDBRL : from === 'EUR' ? amount * rates.EURUSD : amount * rates.GBPUSD;
  if (to === 'USD') return toUSD;
  if (to === 'BRL') return toUSD * rates.USDBRL;
  if (to === 'EUR') return toUSD / rates.EURUSD;
  return toUSD / rates.GBPUSD;
}

/** Normaliza preço do Yahoo (moeda nativa, GBp em pence) para USD. */
export function yahooToUsd(price: number, currency: string, rates: FxRates): number {
  const cur = currency.toUpperCase();
  if (cur === 'GBp' || cur === 'GBX') return convert(price / 100, 'GBP', 'USD', rates);
  if (cur === 'GBP') return convert(price, 'GBP', 'USD', rates);
  if (cur === 'BRL') return convert(price, 'BRL', 'USD', rates);
  if (cur === 'EUR') return convert(price, 'EUR', 'USD', rates);
  return price;
}

export function fmtMoney(n: number, currency: Fiat): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 4 : 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
