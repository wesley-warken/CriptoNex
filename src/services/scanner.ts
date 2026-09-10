import type { OpportunityScore } from '@/types';
import type { UniverseCoin } from '@/services/universeTypes';
import { binanceKlines } from '@/services/providers/binance';
import { scoreAsset } from '@/engine/scoring';
import { scorePartial } from '@/engine/scoring/partial';
import { coinHistory } from '@/services/history';
import { yahooChart } from '@/services/lookup';
import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';

export const SCAN_TTL_MS = 6 * 60 * 60 * 1000;
const PAIR_CONCURRENCY = 6;
const HIST_CONCURRENCY = 2;
const HIST_GAP_MS = 1500;
const STOCK_CONCURRENCY = 8;
const STOCK_GAP_MS = 100;
const YAHOO_BACKOFF_MS = 15000;

export interface ScanState {
  running: boolean;
  phase: 'pairs' | 'history' | 'done' | 'idle';
  scanned: number;
  total: number;
  withScore: number;
  error: string | null;
}

export interface StockScanState {
  running: boolean;
  scanned: number;
  total: number;
  withScore: number;
  error: string | null;
}

export interface ScanSnapshot extends ScanState {
  results: OpportunityScore[];
  stockResults: OpportunityScore[];
  stock: StockScanState;
}

export interface StockScanItem {
  symbol: string;
  /** Símbolo Yahoo (ex: PETR4.SA, AAPL) */
  yahoo: string;
  exchange: string;
  name: string;
}

export const US_MEGACAPS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'TSM', 'WMT', 'JPM', 'V', 'MA', 'XOM', 'UNH', 'ORCL', 'NFLX', 'COST', 'HD', 'PG', 'BAC', 'CRM', 'AMD', 'ADBE', 'DIS', 'QCOM', 'AMAT', 'HON', 'INTC'];

/** B3: seed (líquidas, ticker curto) primeiro, depois alfabética. */
export function orderB3Queue(b3: { symbol: string; name: string }[]): StockScanItem[] {
  const liquid = (s: string) => (s.length <= 6 ? 0 : 1);
  return [...b3]
    .sort((x, y) => liquid(x.symbol) - liquid(y.symbol) || x.symbol.localeCompare(y.symbol))
    .map((b) => ({ symbol: b.symbol, yahoo: b.symbol.includes('.') ? b.symbol : `${b.symbol}.SA`, exchange: 'B3', name: b.name }));
}

/** EUA: megacaps primeiro (relevância), depois alfabética — cobre as ~13k. */
export function orderUsQueue(us: { symbol: string; name: string; exchange: string }[]): StockScanItem[] {
  const rank = (s: string) => {
    const i = US_MEGACAPS.indexOf(s);
    return i === -1 ? 1000 : i;
  };
  return [...us]
    .sort((x, y) => rank(x.symbol) - rank(y.symbol) || x.symbol.localeCompare(y.symbol))
    .map((r) => ({ symbol: r.symbol, yahoo: r.symbol, exchange: r.exchange, name: r.name }));
}

let pairSet: Set<string> | null = null;
async function usdtPairs(): Promise<Set<string>> {
  if (pairSet) return pairSet;
  const cached = await idbGet<string[]>('cc.quotes.cache:pairs');
  if (cached && cached.data.length) {
    pairSet = new Set(cached.data);
    return pairSet;
  }
  try {
    const r = await fetchWithTimeout('https://api.binance.com/api/v3/exchangeInfo', 20000);
    const j = (await r.json()) as { symbols: { symbol: string; quoteAsset: string; status: string }[] };
    pairSet = new Set(j.symbols.filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING').map((s) => s.symbol));
  } catch {
    pairSet = pairSet ?? new Set();
  }
  return pairSet;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Varredura de ações: Yahoo 6mo por símbolo (rápido). O detalhe de 1y fica para a análise individual. */
const STOCK_RANGE = '6mo';
const stockFailAt = new Map<string, number>();
const STOCK_FAIL_COOLDOWN = 60 * 60 * 1000;

class Scanner {
  state: ScanState = { running: false, phase: 'idle', scanned: 0, total: 0, withScore: 0, error: null };
  stockState: StockScanState = { running: false, scanned: 0, total: 0, withScore: 0, error: null };
  results = new Map<string, OpportunityScore>();
  stockResults = new Map<string, OpportunityScore>();
  listeners = new Set<(s: ScanSnapshot) => void>();
  private abort: AbortController | null = null;
  private stockAbort: AbortController | null = null;
  private started = false;

  snap(): ScanSnapshot {
    return { ...this.state, results: [...this.results.values()], stockResults: [...this.stockResults.values()], stock: { ...this.stockState } };
  }
  private emit() {
    const s = this.snap();
    for (const l of this.listeners) l(s);
  }

  async boot() {
    if (this.started) return;
    this.started = true;
    const [cached, cachedStocks] = await Promise.all([
      idbGet<OpportunityScore[]>(`${IDB_KEYS.quotes}:uniscan`),
      idbGet<OpportunityScore[]>(`${IDB_KEYS.quotes}:uniscan-stocks`),
    ]);
    if (cached && !cached.stale) {
      for (const o of cached.data) this.results.set(o.symbol, o);
      this.state.withScore = this.results.size;
    }
    if (cachedStocks && !cachedStocks.stale) {
      for (const o of cachedStocks.data) this.stockResults.set(o.symbol, o);
      this.stockState.withScore = this.stockResults.size;
    }
    this.emit();
  }

  private persist() {
    void idbSet(`${IDB_KEYS.quotes}:uniscan`, [...this.results.values()], SCAN_TTL_MS);
  }

  private persistStocks() {
    void idbSet(`${IDB_KEYS.quotes}:uniscan-stocks`, [...this.stockResults.values()], SCAN_TTL_MS);
  }

  async start(coins: UniverseCoin[]) {
    await this.boot();
    if (this.state.running) return;
    const btc = coins.find((c) => c.symbol === 'BTC')?.change7d ?? null;
    const queue = coins.filter((c) => !this.results.has(c.symbol));
    if (!queue.length) {
      this.state.phase = 'done';
      this.emit();
      return;
    }
    this.abort = new AbortController();
    this.state.running = true;
    this.state.error = null;
    this.state.total = this.results.size + queue.length;
    this.state.scanned = this.results.size;
    this.emit();
    try {
      const pairs = await usdtPairs();
      const withPair = queue.filter((c) => pairs.has(`${c.symbol}USDT`));
      const withoutPair = queue.filter((c) => !pairs.has(`${c.symbol}USDT`));
      // Fase 1: pares Binance (rápido)
      this.state.phase = 'pairs';
      this.emit();
      for (let i = 0; i < withPair.length; i += PAIR_CONCURRENCY) {
        if (this.abort.signal.aborted) return;
        const batch = await Promise.all(
          withPair.slice(i, i + PAIR_CONCURRENCY).map(async (c) => {
            try {
              const kl = await binanceKlines(`${c.symbol}USDT`, '1d', 220);
              if (kl.length < 60) return null;
              return scoreAsset({ symbol: c.symbol, candles: kl, btcChange7d: btc, change7d: c.change7d });
            } catch {
              return null;
            }
          }),
        );
        for (const sc of batch) {
          if (sc) {
            this.results.set(sc.symbol, sc);
            this.state.withScore = this.results.size;
          }
          this.state.scanned += 1;
        }
        this.emit();
      }
      // Fase 2: restante via histórico CoinGecko (paralelo leve + retry dos 429)
      this.state.phase = 'history';
      this.emit();
      const deferred: typeof withoutPair = [];
      for (let i = 0; i < withoutPair.length; i += HIST_CONCURRENCY) {
        if (this.abort.signal.aborted) return;
        const batch = await Promise.all(
          withoutPair.slice(i, i + HIST_CONCURRENCY).map(async (c) => {
            try {
              const closes = await coinHistory(c.id);
              return scorePartial({ symbol: c.symbol, closes, btcChange7d: btc, change7d: c.change7d });
            } catch (e) {
              if ((e as { rateLimited?: boolean }).rateLimited) deferred.push(c);
              return null;
            }
          }),
        );
        for (const sc of batch) {
          if (sc) {
            this.results.set(sc.symbol, sc);
            this.state.withScore = this.results.size;
          }
          this.state.scanned += 1;
        }
        this.emit();
        this.persist();
        await sleep(HIST_GAP_MS);
      }
      // Segunda chance para os recusados pelo rate limit
      for (const c of deferred) {
        if (this.abort.signal.aborted) return;
        try {
          const closes = await coinHistory(c.id);
          const sc = scorePartial({ symbol: c.symbol, closes, btcChange7d: btc, change7d: c.change7d });
          if (sc) {
            this.results.set(sc.symbol, sc);
            this.state.withScore = this.results.size;
          }
        } catch {
          /* sem histórico: fica sem score, sem travar os demais */
        }
        this.emit();
        this.persist();
        await sleep(HIST_GAP_MS);
      }
      this.state.phase = 'done';
      this.persist();
      this.emit();
    } catch (e) {
      this.state.error = e instanceof Error ? e.message : 'Scanner falhou';
      this.emit();
    } finally {
      this.state.running = false;
      this.emit();
    }
  }

  pause() {
    this.abort?.abort();
    this.state.running = false;
    this.persist();
    this.emit();
  }

  async startStocks(items: StockScanItem[]) {
    await this.boot();
    if (this.stockState.running) return;
    const now = Date.now();
    const queue = items.filter((it) => {
      if (this.stockResults.has(it.symbol)) return false;
      const f = stockFailAt.get(it.symbol);
      return !(f && now - f < STOCK_FAIL_COOLDOWN);
    });
    if (!queue.length) return;
    this.stockAbort = new AbortController();
    this.stockState.running = true;
    this.stockState.error = null;
    this.stockState.total = this.stockResults.size + queue.length;
    this.stockState.scanned = this.stockResults.size;
    this.emit();
    let sincePersist = 0;
    let badStreak = 0;
    try {
      for (let i = 0; i < queue.length; i += STOCK_CONCURRENCY) {
        if (this.stockAbort.signal.aborted) return;
        const batch = await Promise.all(
          queue.slice(i, i + STOCK_CONCURRENCY).map(async (it) => {
            try {
              const q = await yahooChart(it.yahoo, STOCK_RANGE, '1d');
              if (q.candles.length < 60) {
                stockFailAt.set(it.symbol, Date.now());
                return null;
              }
              stockFailAt.delete(it.symbol);
              return scoreAsset({ symbol: it.symbol, candles: q.candles });
            } catch {
              stockFailAt.set(it.symbol, Date.now());
              return null;
            }
          }),
        );
        const hits = batch.filter((sc): sc is NonNullable<typeof sc> => sc !== null);
        if (hits.length === 0 && queue.slice(i, i + STOCK_CONCURRENCY).length > 0) {
          badStreak += 1;
          if (badStreak >= 3) {
            await sleep(YAHOO_BACKOFF_MS);
            badStreak = 0;
          }
        } else {
          badStreak = 0;
        }
        for (const sc of hits) {
          this.stockResults.set(sc.symbol, sc);
          this.stockState.withScore = this.stockResults.size;
        }
        this.stockState.scanned += queue.slice(i, i + STOCK_CONCURRENCY).length;
        sincePersist += batch.length;
        if (sincePersist >= 25) {
          sincePersist = 0;
          this.persistStocks();
        }
        this.emit();
        await sleep(STOCK_GAP_MS);
      }
      this.persistStocks();
      this.emit();
    } catch (e) {
      this.stockState.error = e instanceof Error ? e.message : 'Scan de ações falhou';
      this.emit();
    } finally {
      this.stockState.running = false;
      this.emit();
    }
  }

  pauseStocks() {
    this.stockAbort?.abort();
    this.stockState.running = false;
    this.persistStocks();
    this.emit();
  }
}

/** Pontua um punhado de símbolos (Meus ativos) sob demanda. */
export async function scoreStockSymbols(items: StockScanItem[]): Promise<OpportunityScore[]> {
  const out: OpportunityScore[] = [];
  for (let i = 0; i < items.length; i += STOCK_CONCURRENCY) {
    const batch = await Promise.all(
      items.slice(i, i + STOCK_CONCURRENCY).map(async (it) => {
        const hit = scanner.stockResults.get(it.symbol);
        if (hit) return hit;
        try {
          const q = await yahooChart(it.yahoo, '1y', '1d');
          if (q.candles.length < 60) return null;
          return scoreAsset({ symbol: it.symbol, candles: q.candles });
        } catch {
          return null;
        }
      }),
    );
    for (const sc of batch) if (sc) out.push(sc);
  }
  return out;
}

export const scanner = new Scanner();
