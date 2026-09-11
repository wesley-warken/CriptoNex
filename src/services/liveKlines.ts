/**
 * Tempo real de verdade: kline stream da Binance (tick a tick).
 * Só vale para pares listados na Binance; resto (Kraken/Coinbase/Yahoo,
 * deslistados) continua no polling do Monitor como rede de segurança.
 */
import type { Candle } from '@/types';

export interface LiveKline extends Candle {
  /** true quando o candle fechou */
  closed: boolean;
}

/** Encaixa o tick no array: atualiza o candle aberto ou anexa o novo. */
export function mergeCandle(prev: Candle[], next: Candle): Candle[] {
  if (!prev.length) return prev;
  const last = prev[prev.length - 1];
  if (next.time === last.time) return [...prev.slice(0, -1), next];
  if (next.time > last.time) return [...prev, next];
  return prev;
}

const WS_TIMEOUT_MS = 10_000;

/**
 * Assina `<PAIR>@kline_<tf>` (ex.: BTCUSDT@kline_4h). `onStatus(true)` no
 * primeiro tick válido; `onStatus(false)` se falhar/fechar (usar polling).
 */
export function subscribeKline(
  pair: string,
  interval: string,
  onTick: (k: LiveKline) => void,
  onStatus: (ok: boolean) => void,
): () => void {
  let closed = false;
  let gotData = false;
  let ws: WebSocket;
  try {
    ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${interval}`);
  } catch {
    onStatus(false);
    return () => {};
  }
  const failTimer = setTimeout(() => {
    if (!gotData && !closed) {
      try { ws.close(); } catch { /* já fechado */ }
    }
  }, WS_TIMEOUT_MS);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse((ev as MessageEvent).data as string) as {
        k?: { t: number; s: string; o: string; h: string; l: string; c: string; v: string; x: boolean };
      };
      const k = msg.k;
      if (!k || k.s !== pair.toUpperCase()) return;
      gotData = true;
      onStatus(true);
      onTick({
        time: k.t, open: parseFloat(k.o), high: parseFloat(k.h),
        low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v), closed: !!k.x,
      });
    } catch {
      /* tick inválido: ignora */
    }
  };
  const down = () => { if (!closed) onStatus(false); };
  ws.onerror = down;
  ws.onclose = down;
  return () => {
    closed = true;
    clearTimeout(failTimer);
    try { ws.close(); } catch { /* já fechado */ }
  };
}
