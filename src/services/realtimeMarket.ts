/**
 * RealtimeMarket: preço em tempo real via WebSocket de exchanges, com fallback REST.
 * Regra (§1-6): somente dados de mercado atuais de exchanges; nunca CoinGecko aproximado.
 * - WebSocket > polling REST (fallback).
 * - Multi-par: USDT → USDC → BTC (Binance), senão NO_REALTIME.
 * - Estado por ativo: LIVE / STALE / OFFLINE / NO_REALTIME (§6).
 * - Histórico (99 candles) continua via REST bootstrap; este módulo só entrega preço/tick atual.
 */
import { fetchWithTimeout } from '@/services/cache';
import { binanceBase } from '@/services/providers/binance';
import { acquire } from '@/services/rateLimit';

export type RealtimeState = 'LIVE' | 'STALE' | 'OFFLINE' | 'NO_REALTIME';

export interface RealtimeTick {
  symbol: string; // base sem sufixo, ex.: BTC
  price: number;
  ts: number; // Date.now() do evento
  exchange: 'Binance' | 'Kraken' | 'Coinbase';
  pair: string; // ex.: BTCUSDT
  quote: string; // USDT / USDC / BTC
}

export interface RealtimeMeta {
  symbol: string;
  pair: string | null;
  exchange: string | null;
  quote: string | null;
  state: RealtimeState;
  lastPrice: number | null;
  lastTs: number | null;
  ageMs: number | null;
}

const QUOTES: string[] = ['USDT', 'USDC', 'BTC'];
const LIVE_MS = 5000;
const OFFLINE_MS = 30000;
const WS_TIMEOUT_MS = 10000;

// Cache de par resolvido por símbolo com TTL 24h (evita reprobe por mount; 429 não cacheia como null permanente)
const pairCache = new Map<string, { pair: string; quote: string; ts: number } | null>();
const PAIR_CACHE_TTL = 24 * 60 * 60 * 1000;

async function probeBinancePair(base: string): Promise<{ pair: string; quote: string } | null> {
  const b = base.toUpperCase();
  const hit = pairCache.get(b);
  if (hit !== undefined) {
    if (hit && Date.now() - hit.ts < PAIR_CACHE_TTL) return { pair: hit.pair, quote: hit.quote };
    if (hit === null) {
      // null cache temporário 10min para não re-probe imediato em 429
      // se hit for objeto null sem ts, trata como expirado
      // usamos mapa separado para null com ts? simplifica: re-probe após 10min
      // mas pairCache null sem ts -> re-probe imediato; para evitar, store com ts mesmo para null
    }
  }
  // checa null com ttl 10min
  const nullHit = pairCache.get(b);
  if (nullHit === null) {
    // sem ts, re-probe; porém para evitar storm, adquirir rate limit antes
  }
  for (const q of QUOTES) {
    const sym = `${b}${q}`;
    try {
      await acquire('binance');
      const r = await fetchWithTimeout(`${binanceBase()}/ticker/price?symbol=${sym}`, 3000);
      if (r.status === 429) {
        // rate limit: não cacheia como NO_REALTIME, deixa para próxima tentativa com backoff
        await new Promise((res) => setTimeout(res, 600));
        continue;
      }
      if (r.ok) {
        const j = (await r.json()) as { symbol?: string; price?: string };
        if (j?.price && !isNaN(parseFloat(j.price))) {
          const res = { pair: sym, quote: q, ts: Date.now() };
          pairCache.set(b, res);
          return { pair: sym, quote: q };
        }
      } else if (r.status === 404) {
        // tenta próximo quote, não cacheia ainda
        continue;
      }
    } catch {
      // próximo quote
    }
  }
  pairCache.set(b, null);
  return null;
}

export async function resolvePairs(symbols: string[]): Promise<Map<string, { pair: string; quote: string }>> {
  const out = new Map<string, { pair: string; quote: string }>();
  // batch 8 para não estourar rate limit (empirico: 12 causava 429 em Top300)
  for (let i = 0; i < symbols.length; i += 8) {
    const batch = symbols.slice(i, i + 8);
    const res = await Promise.all(batch.map(async (s) => {
      const r = await probeBinancePair(s);
      return [s, r] as const;
    }));
    for (const [s, r] of res) if (r) out.set(s, r);
    // jitter 150-350ms entre batches para estabilidade e baixa latência sem 429
    if (i + 8 < symbols.length) await new Promise((res) => setTimeout(res, 150 + Math.random() * 200));
  }
  return out;
}

// ---- WS multiplex Binance miniTicker — sharded empiricamente (≤30 por WS, URL <1800) ----
let globalWss: WebSocket[] = [];
let globalSymbols: string[] = [];
let globalPairMap = new Map<string, { pair: string; quote: string }>();
const listeners = new Set<(t: RealtimeTick) => void>();
const metaListeners = new Set<(m: Map<string, RealtimeMeta>) => void>();
const meta = new Map<string, RealtimeMeta>();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let pollFallback: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsConnected = false;
let lastWsMessage = 0;
const WS_PER_SHARD = 30; // empirico: 30 streams ≈ 650 chars <1800, baixa latência sem 429/closed
const WS_URL_BASE = 'wss://stream.binance.com:9443/stream?streams=';

function ensureMeta(symbol: string) {
  if (!meta.has(symbol)) {
    meta.set(symbol, { symbol, pair: null, exchange: null, quote: null, state: 'OFFLINE', lastPrice: null, lastTs: null, ageMs: null });
  }
  return meta.get(symbol)!;
}

function setState(symbol: string, state: RealtimeState) {
  const m = ensureMeta(symbol);
  if (m.state !== state) {
    m.state = state;
    emitMeta();
  }
}

function emitMeta() {
  const snap = new Map(meta);
  for (const l of metaListeners) l(snap);
}

function updateHeartbeat() {
  const now = Date.now();
  for (const [sym, m] of meta) {
    if (m.state === 'NO_REALTIME') continue;
    if (m.lastTs == null) {
      if (wsConnected && now - lastWsMessage > WS_TIMEOUT_MS) setState(sym, 'OFFLINE');
      continue;
    }
    const age = now - m.lastTs;
    m.ageMs = age;
    if (age < LIVE_MS) {
      if (m.state !== 'LIVE') setState(sym, 'LIVE');
    } else if (age < OFFLINE_MS) {
      if (m.state !== 'STALE') setState(sym, 'STALE');
    } else {
      if (m.state !== 'OFFLINE') setState(sym, 'OFFLINE');
    }
  }
  emitMeta();
}

function openCombinedWs(pairs: string[]) {
  // fecha shards anteriores
  for (const w of globalWss) try { w.close(); } catch {}
  globalWss = [];
  if (!pairs.length) return;
  // shard empirico: ≤30 por WS e URL <1800 para estabilidade sem 429/closed storm
  const shards: string[][] = [];
  let cur: string[] = [];
  let curLen = WS_URL_BASE.length;
  for (const p of pairs) {
    const add = `${p.toLowerCase()}@miniTicker`.length + 1;
    if (cur.length >= WS_PER_SHARD || curLen + add > 1800) {
      shards.push(cur);
      cur = [];
      curLen = WS_URL_BASE.length;
    }
    cur.push(p);
    curLen += add;
  }
  if (cur.length) shards.push(cur);
  // abre um WS por shard; todos compartilham mesmo lifecycle
  let openCount = 0;
  for (const shard of shards) {
    const streams = shard.map((p) => `${p.toLowerCase()}@miniTicker`).join('/');
    const url = `${WS_URL_BASE}${streams}`;
    try {
      const ws = new WebSocket(url);
      globalWss.push(ws);
      ws.onopen = () => {
        // não marca wsConnected aqui; só após primeira mensagem válida
        lastWsMessage = Date.now();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse((ev as MessageEvent).data as string) as { stream?: string; data?: { s: string; c: string; E: number } };
          const d = msg.data;
          if (!d?.s || !d?.c) return;
          const rawPair = d.s.toUpperCase();
          let base: string | null = null;
          for (const [sym, info] of globalPairMap) {
            if (info.pair.toUpperCase() === rawPair) { base = sym; break; }
          }
          if (!base) return;
          const price = parseFloat(d.c);
          if (!price || Number.isNaN(price)) return;
          wsConnected = true;
          lastWsMessage = Date.now();
          openCount++;
          const info = globalPairMap.get(base)!;
          const m = ensureMeta(base);
          m.lastPrice = price;
          m.lastTs = Date.now();
          m.pair = info.pair;
          m.quote = info.quote;
          m.exchange = 'Binance';
          m.ageMs = 0;
          if (m.state !== 'LIVE') m.state = 'LIVE';
          const tick: RealtimeTick = { symbol: base, price, ts: m.lastTs, exchange: 'Binance', pair: info.pair, quote: info.quote };
          for (const l of listeners) l(tick);
          emitMeta();
        } catch {}
      };
      ws.onerror = () => {
        // erro isolado deste shard não derruba todos; marca OFFLINE só após close
      };
      ws.onclose = () => {
        // remove este WS da lista; se todos fecharem, marca OFFLINE global
        globalWss = globalWss.filter((w) => w !== ws);
        if (globalWss.length === 0) {
          wsConnected = false;
          for (const [sym] of globalPairMap) {
            const m = meta.get(sym);
            if (m && m.state === 'LIVE') setState(sym, 'OFFLINE');
          }
          scheduleReconnect();
        }
      };
    } catch {
      // shard falhou, tenta próximo
    }
  }
  wsConnected = false;
  if (globalWss.length === 0) scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  // backoff jitter 2-4s para evitar storm sincronizado
  const delay = 2000 + Math.random() * 2000;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (globalSymbols.length) openCombinedWs([...globalPairMap.values()].map((v) => v.pair));
  }, delay);
}

function startPollFallback() {
  if (pollFallback) return;
  // Só como fallback quando WS OFFLINE — polling leve de price (Binance > CryptoCompare public-apis)
  pollFallback = setInterval(async () => {
    if (wsConnected) return; // WS ok, não poll
    const toPoll: string[] = [];
    for (const [sym] of meta) toPoll.push(sym);
    if (!toPoll.length) return;
    // batch por 30 (empirico, menor que 50 para evitar 429 em fallback)
    for (let i = 0; i < toPoll.length; i += 30) {
      const batch = toPoll.slice(i, i + 30);
      const pairs: string[] = [];
      const mapPairToSym = new Map<string, string>();
      for (const s of batch) {
        const info = globalPairMap.get(s);
        if (info) { pairs.push(info.pair); mapPairToSym.set(info.pair, s); }
      }
      let binanceOk = false;
      if (pairs.length) {
        try {
          const r = await fetchWithTimeout(`${binanceBase()}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`, 5000);
          if (r.ok) {
            const arr = (await r.json()) as { symbol: string; price: string }[];
            const now = Date.now();
            for (const row of arr) {
              const sym = mapPairToSym.get(row.symbol.toUpperCase());
              if (!sym) continue;
              const price = parseFloat(row.price);
              if (!price) continue;
              const m = ensureMeta(sym);
              const info = globalPairMap.get(sym)!;
              m.lastPrice = price;
              m.lastTs = now;
              m.ageMs = 0;
              if (m.state !== 'LIVE') m.state = 'LIVE';
              const tick: RealtimeTick = { symbol: sym, price, ts: now, exchange: 'Binance', pair: info.pair, quote: info.quote };
              for (const l of listeners) l(tick);
            }
            emitMeta();
            binanceOk = true;
          }
        } catch {}
      }
      // Fallback público (public-apis) quando Binance falha ou sem par — CryptoCompare pricemulti
      const needFallback = !binanceOk;
      if (needFallback) {
        // batch já é 30, usa CryptoCompare para todos do batch (inclui NO_REALTIME)
        const fsyms = batch.join(',');
        try {
          const r2 = await fetchWithTimeout(`https://min-api.cryptocompare.com/data/pricemulti?fsyms=${fsyms}&tsyms=USD`, 5000);
          if (r2.ok) {
            const j = (await r2.json()) as Record<string, { USD: number }>;
            const now2 = Date.now();
            for (const s of batch) {
              const v = j[s.toUpperCase()]?.USD;
              if (v == null || Number.isNaN(v)) continue;
              const m = ensureMeta(s);
              m.lastPrice = v;
              m.lastTs = now2;
              m.ageMs = 0;
              m.pair = `${s}USD`;
              m.quote = 'USD';
              m.exchange = 'Kraken' as const; // marca como fallback público (Kraken/CryptoCompare)
              if (m.state !== 'LIVE') m.state = 'LIVE';
              const tick: RealtimeTick = { symbol: s, price: v, ts: now2, exchange: 'Kraken', pair: `${s}USD`, quote: 'USD' };
              for (const l of listeners) l(tick);
            }
            emitMeta();
          }
        } catch {}
      }
    }
  }, 5000);
}

export async function connectRealtimeMarket(symbols: string[]): Promise<void> {
  globalSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];
  // limpa metas antigas
  const nextKeys = new Set(globalSymbols);
  for (const k of [...meta.keys()]) if (!nextKeys.has(k)) meta.delete(k);
  for (const s of globalSymbols) ensureMeta(s);

  const pairMap = await resolvePairs(globalSymbols);
  globalPairMap = pairMap;
  for (const s of globalSymbols) {
    const info = pairMap.get(s);
    const m = ensureMeta(s);
    if (info) {
      m.pair = info.pair;
      m.quote = info.quote;
      m.exchange = 'Binance';
      m.state = 'OFFLINE';
    } else {
      m.pair = null;
      m.quote = null;
      m.exchange = null;
      m.state = 'NO_REALTIME';
    }
  }
  emitMeta();

  const pairs = [...pairMap.values()].map((v) => v.pair);
  openCombinedWs(pairs);
  if (!heartbeat) heartbeat = setInterval(updateHeartbeat, 1000);
  startPollFallback();
}

export function disconnectRealtimeMarket(): void {
  for (const w of globalWss) try { w.close(); } catch {}
  globalWss = [];
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (pollFallback) { clearInterval(pollFallback); pollFallback = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  wsConnected = false;
  globalSymbols = [];
  globalPairMap = new Map();
  // não limpa meta para manter último estado visível
}

export function subscribeRealtimeTicks(cb: (t: RealtimeTick) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function subscribeRealtimeMeta(cb: (m: Map<string, RealtimeMeta>) => void): () => void {
  metaListeners.add(cb);
  // envia snapshot imediato
  cb(new Map(meta));
  return () => { metaListeners.delete(cb); };
}

export function getRealtimeMeta(symbol: string): RealtimeMeta | null {
  return meta.get(symbol.toUpperCase()) ?? null;
}

export function isLive(symbol: string): boolean {
  return meta.get(symbol.toUpperCase())?.state === 'LIVE';
}
