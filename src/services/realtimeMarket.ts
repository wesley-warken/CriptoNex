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

// Cache de par resolvido por símbolo (evita reprobe por mount)
const pairCache = new Map<string, { pair: string; quote: string } | null>();

async function probeBinancePair(base: string): Promise<{ pair: string; quote: string } | null> {
  const b = base.toUpperCase();
  if (pairCache.has(b)) return pairCache.get(b) ?? null;
  for (const q of QUOTES) {
    const sym = `${b}${q}`;
    try {
      const r = await fetchWithTimeout(`${binanceBase()}/ticker/price?symbol=${sym}`, 3000);
      if (r.ok) {
        const j = (await r.json()) as { symbol?: string; price?: string };
        if (j?.price && !isNaN(parseFloat(j.price))) {
          const res = { pair: sym, quote: q };
          pairCache.set(b, res);
          return res;
        }
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
  // batch 12 para não estourar rate limit
  for (let i = 0; i < symbols.length; i += 12) {
    const batch = symbols.slice(i, i + 12);
    const res = await Promise.all(batch.map(async (s) => {
      const r = await probeBinancePair(s);
      return [s, r] as const;
    }));
    for (const [s, r] of res) if (r) out.set(s, r);
  }
  return out;
}

// ---- WS multiplex Binance miniTicker ----

let globalWs: WebSocket | null = null;
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
  if (globalWs) {
    try { globalWs.close(); } catch {}
    globalWs = null;
  }
  if (!pairs.length) return;
  const streams = pairs.map((p) => `${p.toLowerCase()}@miniTicker`).join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  try {
    const ws = new WebSocket(url);
    globalWs = ws;
    wsConnected = false;
    ws.onopen = () => {
      wsConnected = false;
      lastWsMessage = Date.now();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse((ev as MessageEvent).data as string) as { stream?: string; data?: { s: string; c: string; E: number } };
        const d = msg.data;
        if (!d?.s || !d?.c) return;
        const rawPair = d.s.toUpperCase();
        // reverse lookup symbol: pair -> base
        let base: string | null = null;
        for (const [sym, info] of globalPairMap) {
          if (info.pair.toUpperCase() === rawPair) { base = sym; break; }
        }
        if (!base) return;
        const price = parseFloat(d.c);
        if (!price || Number.isNaN(price)) return;
        wsConnected = true;
        lastWsMessage = Date.now();
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
      wsConnected = false;
    };
    ws.onclose = () => {
      wsConnected = false;
      // marcar LIVE -> OFFLINE se sem heartbeat
      for (const [sym] of globalPairMap) {
        const m = meta.get(sym);
        if (m && m.state === 'LIVE') setState(sym, 'OFFLINE');
      }
      scheduleReconnect();
    };
  } catch {
    wsConnected = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (globalSymbols.length) openCombinedWs([...globalPairMap.values()].map((v) => v.pair));
  }, 2000);
}

function startPollFallback() {
  if (pollFallback) return;
  // Só como fallback quando WS OFFLINE — polling leve de price
  pollFallback = setInterval(async () => {
    if (wsConnected) return; // WS ok, não poll
    const toPoll: string[] = [];
    for (const [sym, m] of meta) if (m.state !== 'NO_REALTIME') toPoll.push(sym);
    if (!toPoll.length) return;
    // batch por 50 (limite da API ticker/price symbols[])
    for (let i = 0; i < toPoll.length; i += 50) {
      const batch = toPoll.slice(i, i + 50);
      const pairs: string[] = [];
      const mapPairToSym = new Map<string, string>();
      for (const s of batch) {
        const info = globalPairMap.get(s);
        if (info) { pairs.push(info.pair); mapPairToSym.set(info.pair, s); }
      }
      if (!pairs.length) continue;
      try {
        const r = await fetchWithTimeout(`${binanceBase()}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`, 5000);
        if (!r.ok) continue;
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
      } catch {}
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
  if (globalWs) { try { globalWs.close(); } catch {} globalWs = null; }
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
