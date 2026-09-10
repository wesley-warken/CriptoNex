import type { Candle, MarketRegime } from '@/types';
import { snapshot } from '@/engine/indicators';

export interface RegimeInput {
  btc: Candle[];
  assets: { symbol: string; candles: Candle[]; change7d?: number | null }[];
  btcDominanceFalling?: boolean;
}

export function computeRegime(input: RegimeInput): MarketRegime {
  const btcSnap = input.btc.length ? snapshot(input.btc) : null;
  const btcPrice = input.btc.length ? input.btc[input.btc.length - 1].close : 0;
  const btcTrend = !btcSnap || (btcSnap.sma50 == null && btcSnap.sma20 == null)
    ? 'NEUTRAL'
    : btcSnap.sma50 != null && btcSnap.sma200 != null
      ? btcSnap.sma50 > btcSnap.sma200 ? 'BULLISH' : 'BEARISH'
      : btcSnap.sma20 != null ? (btcPrice > btcSnap.sma20 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';

  let above50 = 0, above200 = 0, rsiUp = 0, stBull = 0, macdBull = 0, n = 0;
  let up7d = 0;
  for (const a of input.assets) {
    if (!a.candles.length) continue;
    n++;
    const s = snapshot(a.candles);
    const px = a.candles[a.candles.length - 1].close;
    if (s.sma50 != null && px > s.sma50) above50++;
    if (s.sma200 != null && px > s.sma200) above200++;
    if (s.rsi != null && s.rsi > 50) rsiUp++;
    if (s.supertrend === 'BULLISH') stBull++;
    if (s.macdSignal === 'BUY') macdBull++;
    if ((a.change7d ?? 0) > 0) up7d++;
  }
  const breadth = n === 0 ? 50 : Math.round((above50 / n) * 30 + (above200 / n) * 25 + (rsiUp / n) * 20 + (stBull / n) * 15 + (macdBull / n) * 10);
  const momentum = breadth >= 65 ? 'STRONG' : breadth >= 50 ? 'MODERATE' : ('WEAK' as const);
  const volumeExpanding = up7d >= Math.ceil(n * 0.55) && n > 0;
  const atrPct = btcSnap?.atr && btcPrice ? (btcSnap.atr / btcPrice) * 100 : 2;
  const volatility = atrPct > 4 ? 'HIGH' : atrPct > 2 ? 'MODERATE' : ('LOW' as const);

  let pts = 0;
  if (btcTrend === 'BULLISH') pts += 2;
  else if (btcTrend === 'BEARISH') pts -= 2;
  if (breadth >= 60) pts += 2;
  else if (breadth <= 40) pts -= 2;
  if (input.btcDominanceFalling) pts += 1;
  if (volumeExpanding) pts += 1;
  if (momentum === 'STRONG') pts += 1;
  else if (momentum === 'WEAK') pts -= 1;
  if (volatility === 'HIGH') pts -= 0.5;

  const label: MarketRegime['label'] = pts >= 4 ? 'STRONG RISK-ON' : pts >= 1.5 ? 'RISK-ON' : pts <= -4 ? 'STRONG RISK-OFF' : pts <= -1.5 ? 'RISK-OFF' : 'NEUTRAL';
  const confidence = Math.round(Math.min(95, Math.max(40, 60 + Math.abs(pts) * 7)));
  return { label, confidence, btcTrend: btcTrend as MarketRegime['btcTrend'], breadth, dominanceFalling: !!input.btcDominanceFalling, momentum, volumeExpanding, volatility };
}
