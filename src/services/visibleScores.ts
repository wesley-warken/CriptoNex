import { useEffect, useState } from 'react';
import type { OpportunityScore } from '@/types';
import { binanceKlines } from '@/services/providers/binance';
import { scoreAsset } from '@/engine/scoring';
import { scorePartial } from '@/engine/scoring/partial';
import { coinHistory } from '@/services/history';
import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet } from '@/lib/idb';

const SCORE_TTL_MS = 60_000;
const CONCURRENCY = 6;
const PAIRS_TTL_MS = 24 * 60 * 60 * 1000;

export interface ScorableRow {
  symbol: string;
  /** id CoinGecko para fallback de histórico (moedas sem par Binance) */
  id?: string;
  change7d?: number | null;
}

let pairSet: Set<string> | null = null;
const scoreCache = new Map<string, { score: OpportunityScore; ts: number }>();

async function usdtPairs(): Promise<Set<string>> {
  if (pairSet) return pairSet;
  const cached = await idbGet<string[]>('cc.quotes.cache:pairs');
  if (cached && !cached.stale && cached.data.length) {
    pairSet = new Set(cached.data);
    return pairSet;
  }
  try {
    const r = await fetchWithTimeout('https://api.binance.com/api/v3/exchangeInfo', 20000);
    if (!r.ok) throw new Error('exchangeInfo');
    const j = (await r.json()) as { symbols: { symbol: string; quoteAsset: string; status: string }[] };
    const list = j.symbols.filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING').map((s) => s.symbol);
    pairSet = new Set(list);
    await idbSet('cc.quotes.cache:pairs', list, PAIRS_TTL_MS);
  } catch {
    pairSet = pairSet ?? new Set();
  }
  return pairSet;
}

export function binancePairFor(symbol: string, pairs: Set<string>): string | null {
  const direct = `${symbol.toUpperCase()}USDT`;
  if (pairs.has(direct)) return direct;
  return null;
}

async function scoreOne(row: ScorableRow, pairs: Set<string>, btcChange7d: number | null): Promise<OpportunityScore | null> {
  const hit = scoreCache.get(row.symbol);
  if (hit && Date.now() - hit.ts < SCORE_TTL_MS) return hit.score;
  const pair = binancePairFor(row.symbol, pairs);
  try {
    if (pair) {
      const kl = await binanceKlines(pair, '1d', 220);
      if (kl.length < 60) return null;
      const score = scoreAsset({ symbol: row.symbol, candles: kl, btcChange7d, change7d: row.change7d });
      scoreCache.set(row.symbol, { score, ts: Date.now() });
      return score;
    }
    if (row.id) {
      const closes = await coinHistory(row.id);
      const score = scorePartial({ symbol: row.symbol, closes, btcChange7d, change7d: row.change7d });
      if (score) scoreCache.set(row.symbol, { score, ts: Date.now() });
      return score;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Calcula score/sinal APENAS dos símbolos visíveis (janela virtualizada),
 * com concorrência limitada e cache. Moedas sem par Binance usam histórico
 * de fechamentos (score parcial, honestamente limitado).
 */
export function useVisibleScores(rows: ScorableRow[], btcChange7d: number | null = null): Map<string, OpportunityScore> {
  const [map, setMap] = useState<Map<string, OpportunityScore>>(new Map());
  const key = rows.map((r) => r.symbol).join(',');
  const idKey = rows.map((r) => r.id ?? '').join(',');
  useEffect(() => {
    let alive = true;
    const list = key ? rows : [];
    if (!list.length) {
      setMap(new Map());
      return () => {
        alive = false;
      };
    }
    const t = setTimeout(async () => {
      try {
        const pairs = await usdtPairs();
        const targets = list.filter((s) => {
          const hit = scoreCache.get(s.symbol);
          return !(hit && Date.now() - hit.ts < SCORE_TTL_MS);
        });
        const out = new Map<string, OpportunityScore>();
        for (const s of list) {
          const hit = scoreCache.get(s.symbol);
          if (hit) out.set(s.symbol, hit.score);
        }
        if (alive && out.size) setMap(new Map(out));
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
          if (!alive) return;
          const batch = await Promise.all(targets.slice(i, i + CONCURRENCY).map((s) => scoreOne(s, pairs, btcChange7d)));
          batch.forEach((sc, j) => {
            if (sc) out.set(targets[i + j].symbol, sc);
          });
          if (alive) setMap(new Map(out));
        }
        if (alive) setMap(new Map(out));
      } catch {
        /* mantém o que houver */
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, idKey]);
  return map;
}
