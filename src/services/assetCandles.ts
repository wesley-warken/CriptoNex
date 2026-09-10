import type { Candle } from '@/types';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines, type BinanceInterval } from '@/services/providers/binance';
import { yahooChart } from '@/services/lookup';

export type UniversalKind = 'crypto' | 'stock';

export interface ResolvedAsset {
  /** Símbolo canônico exibido (ex: BTC, PETR4, AAPL, TSM) */
  symbol: string;
  kind: UniversalKind;
  /** Par Binance quando crypto (ex: BTCUSDT) */
  binanceSymbol: string | null;
  /** Símbolo Yahoo quando ação (ex: PETR4.SA, AAPL) */
  yahooSymbol: string | null;
}

/** Classifica sem rede: lista crypto conhecida ou padrão B3/sufixos Yahoo. */
export function resolveAsset(raw: string): ResolvedAsset {
  const symbol = raw.trim().toUpperCase();
  const known = CRYPTO_ASSETS.find((a) => a.symbol === symbol);
  if (known) {
    return { symbol, kind: 'crypto', binanceSymbol: known.binanceSymbol ?? `${symbol}USDT`, yahooSymbol: null };
  }
  if (symbol.includes('.') || symbol.includes('=') || symbol.startsWith('^') || symbol.includes('-')) {
    return { symbol, kind: 'stock', binanceSymbol: null, yahooSymbol: symbol };
  }
  if (/^[A-Z]{4}[346]$/.test(symbol)) {
    return { symbol, kind: 'stock', binanceSymbol: null, yahooSymbol: `${symbol}.SA` };
  }
  // Padrão: tenta crypto primeiro (com fallback p/ ação no fetch)
  return { symbol, kind: 'crypto', binanceSymbol: `${symbol}USDT`, yahooSymbol: symbol };
}

export type StockTf = '1h' | '1d' | '1w';

function yahooRange(tf: StockTf): { range: string; interval: string } {
  if (tf === '1h') return { range: '3mo', interval: '60m' };
  if (tf === '1w') return { range: '2y', interval: '1wk' };
  return { range: '1y', interval: '1d' };
}

/**
 * Busca candles de qualquer ativo. Crypto via Binance; se o par não existir,
 * cai para Yahoo automaticamente (e o kind reflete a fonte que funcionou).
 */
export async function fetchAssetCandles(
  raw: string,
  tf: BinanceInterval,
): Promise<{ asset: ResolvedAsset; candles: Candle[]; daily: Candle[] }> {
  const r = resolveAsset(raw);
  if (r.kind === 'crypto' && r.binanceSymbol) {
    try {
      const [candles, daily] = await Promise.all([
        binanceKlines(r.binanceSymbol, tf, 300),
        tf === '1d' ? Promise.resolve([] as Candle[]) : binanceKlines(r.binanceSymbol, '1d', 35),
      ]);
      if (candles.length >= 10) return { asset: r, candles, daily: tf === '1d' ? candles : daily };
    } catch {
      /* par inexistente na Binance: tenta Yahoo como ação */
    }
    if (r.yahooSymbol) {
      const stock = await fetchStockCandles(r.yahooSymbol, tf === '4h' ? '1d' : (tf as StockTf));
      return { asset: { ...r, kind: 'stock' }, candles: stock.candles, daily: stock.daily };
    }
    throw new Error(`Ativo ${r.symbol} não encontrado na Binance nem no Yahoo`);
  }
  const ysym = r.yahooSymbol ?? r.symbol;
  const stock = await fetchStockCandles(ysym, tf === '4h' ? '1d' : (tf as StockTf));
  return { asset: { ...r, kind: 'stock' }, candles: stock.candles, daily: stock.daily };
}

async function fetchStockCandles(ysym: string, tf: StockTf): Promise<{ candles: Candle[]; daily: Candle[] }> {
  const { range, interval } = yahooRange(tf);
  const [main, d] = await Promise.all([
    yahooChart(ysym, range, interval),
    tf === '1d' ? Promise.resolve(null) : yahooChart(ysym, '1y', '1d'),
  ]);
  if (!main.candles.length) throw new Error(`Sem dados para ${ysym}`);
  return { candles: main.candles, daily: tf === '1d' ? main.candles : (d?.candles ?? []) };
}

/** Timeframes exibidos por tipo de ativo. */
export function timeframesFor(kind: UniversalKind): BinanceInterval[] {
  return kind === 'crypto' ? ['1h', '4h', '1d', '1w'] : ['1h', '1d', '1w'];
}

/** Labels do MTF por tipo (ações não têm 4h no Yahoo). */
export function mtfLabels(kind: UniversalKind): { tf: BinanceInterval; label: string }[] {
  if (kind === 'crypto') {
    return [
      { tf: '1h', label: '1H' },
      { tf: '4h', label: '4H' },
      { tf: '1d', label: '1D' },
      { tf: '1w', label: '1W' },
    ];
  }
  return [
    { tf: '1h', label: '1H' },
    { tf: '1d', label: '1D' },
    { tf: '1w', label: '1W' },
  ];
}

/** Candles só para leitura de tendência MTF (curto/médio/longo). */
export async function fetchMtfCandles(asset: ResolvedAsset, tf: BinanceInterval): Promise<Candle[]> {
  if (asset.kind === 'crypto' && asset.binanceSymbol) {
    return binanceKlines(asset.binanceSymbol, tf, 120);
  }
  const ysym = asset.yahooSymbol ?? asset.symbol;
  if (tf === '1h') return (await yahooChart(ysym, '3mo', '60m')).candles;
  if (tf === '1w') return (await yahooChart(ysym, '2y', '1wk')).candles;
  return (await yahooChart(ysym, '1y', '1d')).candles;
}

// Cache simples em memória para MTF (evita refazer requests idênticos em curto período)
const mtfCache = new Map<string, { data: Candle[]; ts: number }>();
const MTF_TTL = 30_000; // 30 segundos

/** Candles só para leitura de tendência MTF com cache (curto/médio/longo). */
export async function fetchMtfCandlesCached(asset: ResolvedAsset, tf: BinanceInterval): Promise<Candle[]> {
  const key = `${asset.binanceSymbol || asset.yahooSymbol || asset.symbol}-${tf}`;
  const cached = mtfCache.get(key);
  if (cached && Date.now() - cached.ts < MTF_TTL) {
    return cached.data;
  }
  const data = await fetchMtfCandles(asset, tf);
  mtfCache.set(key, { data, ts: Date.now() });
  return data;
}
