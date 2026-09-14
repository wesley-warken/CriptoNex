import { detectPatterns } from '@/engine/patterns';
import type { Candle } from '@/types';
import type { DetectedPattern } from '@/engine/patterns';

export interface PatternsRequest {
  /** Map de candles por símbolo (série completa, incluindo vela em formação — worker descarta internamente) */
  candles: Record<string, Candle[]>;
  /** limite de padrões por ativo (default 4) */
  limit?: number;
}

export interface PatternsProgress {
  type: 'progress';
  done: number;
  total: number;
}

export interface PatternsDone {
  type: 'done';
  results: Record<string, DetectedPattern[]>;
}

export interface PatternsError {
  type: 'error';
  message: string;
}

export type PatternsOut = PatternsProgress | PatternsDone | PatternsError;

// Worker: detecção síncrona mas off-main-thread. Cada ativo isola try/catch para não travar lote.
self.onmessage = (ev: MessageEvent<PatternsRequest>) => {
  const post = (m: PatternsOut) =>
    (self as unknown as { postMessage: (x: unknown) => void }).postMessage(m);
  try {
    const { candles, limit = 4 } = ev.data ?? {};
    if (!candles || typeof candles !== 'object') {
      post({ type: 'error', message: 'payload candles ausente' });
      return;
    }
    const syms = Object.keys(candles);
    const total = syms.length;
    const results: Record<string, DetectedPattern[]> = {};
    // Processa em batches de 10 para permitir progress e não bloquear postMessage
    for (let i = 0; i < syms.length; i++) {
      const sym = syms[i];
      const kl = candles[sym];
      if (!Array.isArray(kl) || kl.length < 60) {
        results[sym] = [];
      } else {
        try {
          const patterns = detectPatterns(kl);
          results[sym] = patterns.slice(0, limit);
        } catch {
          results[sym] = [];
        }
      }
      if ((i + 1) % 10 === 0 || i === syms.length - 1) {
        post({ type: 'progress', done: i + 1, total });
      }
    }
    post({ type: 'done', results });
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : 'patterns worker falhou' });
  }
};

export {};
