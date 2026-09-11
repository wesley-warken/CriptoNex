import { useEffect, useState } from 'react';
import type { Candle, MarketData } from '@/types';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines } from '@/services/providers/binance';
import { geckoMarkets, geckoHistory30d } from '@/services/providers/coingecko';
import { withCache } from '@/services/cache';

export interface MarketState {
  data: MarketData[];
  btcDominance: number | null;
  stale: boolean;
  updatedAt: number | null;
  loading: boolean;
  error: string | null;
  candles: Record<string, Candle[]>;
}
export function useCryptoMarket(refreshSec: number): MarketState & { reload: () => void } {
  const [state, setState] = useState<MarketState>({ data: [], btcDominance: null, stale: false, updatedAt: null, loading: true, error: null, candles: {} });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setState((s) => ({ ...s, loading: s.data.length === 0, error: null }));
        const ids = CRYPTO_ASSETS.map((a) => a.coingeckoId!).filter(Boolean);
        const [mk, btc] = await Promise.all([
          withCache(`mk-${ids.join('|')}`, () => geckoMarkets(ids), 60_000, 'cc.snapshots.daily').catch((e) => { throw e; }),
          binanceKlines('BTCUSDT', '1d', 220).catch(() => [] as Candle[]),
        ]);
        void btc;
        const byId = new Map(mk.data.map((m) => [m.id, m]));
        // candles 1d para cada ativo (lote limitado para não estourar rate-limit)
        const candles: Record<string, Candle[]> = {};
        await Promise.all(CRYPTO_ASSETS.slice(0, 25).map(async (a) => {
          if (!a.binanceSymbol) return;
          try {
            candles[a.symbol] = await withCache(`kl-${a.symbol}-1d`, () => binanceKlines(a.binanceSymbol!, '1d', 220), 60_000).then((r) => r.data);
          } catch { candles[a.symbol] = []; }
        }));
        const data: MarketData[] = CRYPTO_ASSETS.map((a) => {
          const m = a.coingeckoId ? byId.get(a.coingeckoId) : undefined;
          const kl = candles[a.symbol] ?? [];
          const closes = kl.map((k) => k.close);
          const price = m?.current_price ?? (closes.length ? closes[closes.length - 1] : 0);
          // Variação diária (candles 1d) — usada como proxy de 24h, nunca de 1h.
          const c1 = closes.length > 26 ? ((closes[closes.length - 1] / closes[closes.length - 2] - 1) * 100) : null;
          return {
            id: a.id, symbol: a.symbol, name: a.name,
            price, change1h: m?.price_change_percentage_1h_in_currency ?? null,
            change24h: m?.price_change_percentage_24h_in_currency ?? c1,
            change7d: m?.price_change_percentage_7d_in_currency ?? null,
            volume24h: m?.total_volume ?? (kl.length ? kl[kl.length - 1].volume * price : null),
            marketCap: m?.market_cap ?? null,
            timestamp: Date.now(),
            sparkline30d: closes.slice(-30),
          };
        });
        // sparklines 30d do CoinGecko quando Binance falhar (amostra)
        if (alive) setState({ data, btcDominance: null, stale: mk.stale, updatedAt: mk.ts, loading: false, error: null, candles });
      } catch (e) {
        // withCache já tenta o snapshot 'cc.snapshots.daily' antes de lançar;
        // aqui só reportamos o erro (sem fallback manual que mascarava dados).
        if (alive) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Falha ao carregar dados' }));
      }
    }
    load();
    const t = setInterval(load, Math.max(30, refreshSec) * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [refreshSec, tick]);
  void geckoHistory30d;
  return { ...state, reload: () => setTick((t) => t + 1) };
}
