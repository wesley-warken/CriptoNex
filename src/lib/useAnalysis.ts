import { useMemo } from 'react';
import type { MarketData, Candle } from '@/types';
import { scoreAsset, interpret } from '@/engine/scoring';
import { computeRegime } from '@/engine/regime';

export function useAnalysis(data: MarketData[], candles: Record<string, Candle[]>) {
  return useMemo(() => {
    const btc = candles['BTC'] ?? [];
    const btcChange = data.find((d) => d.symbol === 'BTC')?.change7d ?? null;
    const regime = computeRegime({ btc, assets: data.map((d) => ({ symbol: d.symbol, candles: candles[d.symbol] ?? [], change7d: d.change7d })) });
    const scores = data.map((d) => scoreAsset({ symbol: d.symbol, candles: candles[d.symbol] ?? [], btcChange7d: btcChange, change7d: d.change7d, regime }));
    const bySym = new Map(scores.map((s) => [s.symbol, s]));
    const texts = new Map(data.map((d) => [d.symbol, interpret(d.symbol, 'diário', bySym.get(d.symbol)!, regime)]));
    return { regime, scores, bySym, texts, btcChange };
  }, [data, candles]);
}
