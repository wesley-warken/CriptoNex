/**
 * Klines multi-fonte (sem key): Binance → Kraken → Coinbase.
 * Distribui a carga entre APIs em vez de forçar tudo numa só — se uma cai
 * no rate-limit/bloqueio, a próxima assume. O CoinGecko continua como
 * último fallback nos chamadores (com cache IDB).
 */
import { fetchWithTimeout } from '@/services/cache';
import { binanceBase } from '@/services/providers/binance';
import type { Candle } from '@/types';

export type KlineInterval = '1h' | '4h' | '1d' | '1w';

/** Duração da sessão de 4h em ms (blocos 00/04/08/12/16/20 UTC = 21/01/05/09/13/17 BRT). */
export const H4_MS = 4 * 3600_000;

/**
 * Reamostra candles em sessões reais de parede (ex.: 1h → 4h alinhado em
 * 00/04/08... UTC, que fecham 21:00, 17:00... em Brasília). Sessão parcial
 * (início/fim dos dados) entra como candle em formação, igual nas exchanges.
 */
export function resampleCandles(kl: Candle[], sessionMs: number): Candle[] {
  const build = (chunk: Candle[]): Candle => ({
    time: chunk[0].time,
    open: chunk[0].open,
    high: Math.max(...chunk.map((k) => k.high)),
    low: Math.min(...chunk.map((k) => k.low)),
    close: chunk[chunk.length - 1].close,
    volume: chunk.reduce((s, k) => s + k.volume, 0),
  });
  const out: Candle[] = [];
  let key = -1;
  let chunk: Candle[] = [];
  const flush = () => {
    if (chunk.length) out.push(build(chunk));
    chunk = [];
  };
  for (const k of kl) {
    const kKey = Math.floor(k.time / sessionMs);
    if (kKey !== key) {
      flush();
      key = kKey;
    }
    chunk.push(k);
  }
  flush();
  return out;
}

const BINANCE_TIMEOUT_MS = 6000;
const ALT_TIMEOUT_MS = 6000;
const COOLDOWN_MS = 5 * 60 * 1000;

// Cooldown compartilhado: 1 probe decide pela sessão, sem timeout em massa.
let binanceDownUntil = 0;

/** true enquanto a Binance está em cooldown (probe falhou recentemente). */
export function binanceCoolingDown(): boolean {
  return Date.now() < binanceDownUntil;
}

/** Marca a Binance como fora por 5min (chamado só pelo probe, não por falha isolada). */
export function noteBinanceDown(): void {
  binanceDownUntil = Date.now() + COOLDOWN_MS;
}

/** Binance direto, 1 tentativa, falha rápido. `symbol` sem sufixo (ex.: BTC). */
export async function binanceKlinesFast(symbol: string, interval: string, limit: number, minCandles = 30): Promise<Candle[] | null> {
  try {
    const r = await fetchWithTimeout(
      `${binanceBase()}/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`,
      BINANCE_TIMEOUT_MS,
    );
    if (!r.ok) return null;
    const raw = (await r.json()) as unknown[][];
    const kl: Candle[] = raw.map((k) => ({
      time: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
    return kl.length >= minCandles ? kl : null;
  } catch {
    return null;
  }
}

/** Probe único e barato: testa a Binance uma vez e marca cooldown se falhar. */
export async function probeBinance(): Promise<boolean> {
  if (binanceCoolingDown()) return false;
  const kl = await binanceKlinesFast('BTC', '1d', 5, 1);
  if (kl && kl.length) return true;
  noteBinanceDown();
  return false;
}

// ---- Saúde das alternativas: 1 probe leve decide por 5min ----
// Sem isso, cada moeda pagaria 6s de timeout por provedora morta.
interface ProviderHealth {
  ok: boolean;
  until: number;
  probing: Promise<boolean> | null;
}

const health: Record<'kraken' | 'coinbase', ProviderHealth> = {
  kraken: { ok: true, until: 0, probing: null },
  coinbase: { ok: true, until: 0, probing: null },
};

const HEALTH_URL: Record<'kraken' | 'coinbase', string> = {
  kraken: 'https://api.kraken.com/0/public/Time',
  coinbase: 'https://api.exchange.coinbase.com/products/BTC-USD/ticker',
};

async function providerHealthy(name: 'kraken' | 'coinbase'): Promise<boolean> {
  const h = health[name];
  if (Date.now() < h.until) return h.ok;
  if (h.probing) return h.probing;
  const run = (async () => {
    try {
      const r = await fetchWithTimeout(HEALTH_URL[name], ALT_TIMEOUT_MS);
      h.ok = r.ok;
    } catch {
      h.ok = false;
    }
    h.until = Date.now() + COOLDOWN_MS;
    h.probing = null;
    return h.ok;
  })();
  h.probing = run;
  return run;
}

const KRAKEN_INTERVAL: Record<KlineInterval, number | null> = { '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };

/** Pares Kraken candidatos (aliases especiais + tentativa direta). */
export function krakenPair(base: string): string[] {
  const b = base.toUpperCase();
  const special: Record<string, string> = { BTC: 'XBTUSD', USDT: 'USDTZUSD', USDC: 'USDCUSD', DAI: 'DAIUSD' };
  const first = special[b] ?? `${b}USD`;
  return first === `${b}USD` ? [first] : [first, `${b}USD`];
}

/** Linhas Kraken [time(s), o, h, l, c, vwap, vol, count] → candles. */
export function parseKraken(json: unknown): Candle[] {
  try {
    const j = json as { error?: string[]; result?: Record<string, unknown[][]> };
    if (!j || !j.result || (j.error && j.error.length)) return [];
    const key = Object.keys(j.result).find((k) => k !== 'last');
    const rows = (key ? j.result[key] : []) ?? [];
    return rows
      .map((r) => ({
        time: Number(r[0]) * 1000,
        open: parseFloat(String(r[1])),
        high: parseFloat(String(r[2])),
        low: parseFloat(String(r[3])),
        close: parseFloat(String(r[4])),
        volume: parseFloat(String(r[6])),
      }))
      .filter((c) => c.close > 0);
  } catch {
    return [];
  }
}

async function krakenKlines(base: string, interval: KlineInterval, limit: number): Promise<Candle[] | null> {
  const iv = KRAKEN_INTERVAL[interval];
  if (iv == null) return null;
  for (const pair of krakenPair(base)) {
    try {
      const r = await fetchWithTimeout(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${iv}`, ALT_TIMEOUT_MS);
      if (!r.ok) continue;
      const kl = parseKraken(await r.json()).slice(-limit);
      if (kl.length >= 30) return kl;
    } catch {
      /* próximo par/provedor */
    }
  }
  return null;
}

/**
 * Granularidades válidas da Coinbase: 60/300/900/3600/21600/86400.
 * 4h (14400) NÃO existe na API — busca 1h e reamostra em sessões reais de
 * parede; 1w não tem equivalente (usa-se o diário em outro lugar).
 */
export function coinbasePlan(interval: KlineInterval): { granularity: number; resampleMs: number | null } | null {
  if (interval === '1h') return { granularity: 3600, resampleMs: null };
  if (interval === '4h') return { granularity: 3600, resampleMs: H4_MS };
  if (interval === '1d') return { granularity: 86400, resampleMs: null };
  return null;
}

/** Linhas Coinbase [time, low, high, open, close, volume] (ordem da API varia) → candles. */
export function parseCoinbase(json: unknown): Candle[] {
  try {
    const rows = (Array.isArray(json) ? json : []) as unknown[][];
    return rows
      .map((r) => ({
        time: Number(r[0]) * 1000,
        open: Number(r[3]),
        high: Number(r[2]),
        low: Number(r[1]),
        close: Number(r[4]),
        volume: Number(r[5]),
      }))
      .filter((c) => c.close > 0)
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

async function coinbaseKlines(base: string, interval: KlineInterval, limit: number): Promise<Candle[] | null> {
  const plan = coinbasePlan(interval);
  if (!plan) return null;
  try {
    // Coinbase devolve no máx. 300 candles: no 1h→4h pede 4× para render o mesmo alcance
    const need = plan.resampleMs ? Math.min(300, limit * 4 + 4) : limit;
    const r = await fetchWithTimeout(
      `https://api.exchange.coinbase.com/products/${base.toUpperCase()}-USD/candles?granularity=${plan.granularity}`,
      ALT_TIMEOUT_MS,
    );
    if (!r.ok) return null;
    const raw = parseCoinbase(await r.json()).slice(-need);
    const kl = plan.resampleMs ? resampleCandles(raw, plan.resampleMs).slice(-limit) : raw.slice(-limit);
    return kl.length >= 30 ? kl : null;
  } catch {
    return null;
  }
}

/**
 * Tenta Binance (se não estiver em cooldown) → Kraken → Coinbase.
 * Provedoras mortas são puladas por 5min após 1 probe (sem timeout por moeda).
 * Retorna null para o chamador aplicar o fallback CoinGecko com cache.
 */
const MAX_AGE_MS: Record<KlineInterval, number> = {
  '1h': 24 * 3600_000,
  '4h': 4 * 24 * 3600_000,
  '1d': 10 * 24 * 3600_000,
  '1w': 60 * 24 * 3600_000,
};

/**
 * Rejeita pares mortos/deslistados (ex.: XMR na Binance, congelado desde
 * fev/2024): velas existem mas o último candle é velho. Sem isso, dado
 * congelado passa nas checagens de tamanho e o gráfico mostra o passado.
 */
export function isFresh(kl: Candle[] | null, interval: KlineInterval): boolean {
  if (!kl || !kl.length) return false;
  const last = kl[kl.length - 1].time;
  if (!last || Number.isNaN(last)) return false;
  return Date.now() - last < (MAX_AGE_MS[interval] ?? 0);
}

export type KlinesSource = 'binance' | 'kraken' | 'coinbase';
export interface KlinesResult {
  klines: Candle[];
  source: KlinesSource;
}

export async function multiKlines(baseSymbol: string, interval: KlineInterval, limit: number, minCandles: number): Promise<KlinesResult | null> {
  const base = baseSymbol.toUpperCase();
  if (!binanceCoolingDown()) {
    const bn = await binanceKlinesFast(base, interval, limit, minCandles);
    if (bn && isFresh(bn, interval)) return { klines: bn, source: 'binance' };
  }
  if (await providerHealthy('kraken')) {
    const kr = await krakenKlines(base, interval, limit);
    if (kr && kr.length >= minCandles && isFresh(kr, interval)) return { klines: kr, source: 'kraken' };
  }
  if (await providerHealthy('coinbase')) {
    const cb = await coinbaseKlines(base, interval, limit);
    if (cb && cb.length >= minCandles && isFresh(cb, interval)) return { klines: cb, source: 'coinbase' };
  }
  return null;
}
