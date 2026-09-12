import type { Candle } from '@/types';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import type { BinanceInterval } from '@/services/providers/binance';
import { multiKlines, resampleCandles, H4_MS, type KlineInterval } from '@/services/providers/multiKlines';
import { yahooChart } from '@/services/lookup';

// Re-exportados para compatibilidade (testes e chamadores antigos).
export { resampleCandles, H4_MS };

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

export type StockTf = '1h' | '4h' | '1d' | '1w';

function yahooRange(tf: StockTf): { range: string; interval: string } {
  if (tf === '1h' || tf === '4h') return { range: '3mo', interval: '60m' };
  if (tf === '1w') return { range: '2y', interval: '1wk' };
  return { range: '5y', interval: '1d' };
}

/**
 * Busca candles de qualquer ativo. Crypto via multi-fonte (com validação de
 * frescor: pares deslistados como XMR na Binance são pulados); se nada ao
 * vivo existir, cai para Yahoo automaticamente.
 */
export async function fetchAssetCandles(
  raw: string,
  tf: BinanceInterval,
): Promise<{ asset: ResolvedAsset; candles: Candle[]; daily: Candle[]; source: string }> {
  const r = resolveAsset(raw);
  if (r.kind === 'crypto' && r.binanceSymbol) {
    try {
      const base = r.binanceSymbol.replace(/USDT$/, '');
      const [main, d1] = await Promise.all([
        multiKlines(base, tf as KlineInterval, 1000, 10),
        tf === '1d' ? Promise.resolve(null) : multiKlines(base, '1d', 250, 10),
      ]);
      if (main && main.klines.length >= 10) {
        return { asset: r, candles: main.klines, daily: tf === '1d' ? main.klines : (d1?.klines ?? []), source: main.source };
      }
    } catch {
      /* sem fonte crypto ao vivo: tenta Yahoo */
    }
    for (const y of yahooCandidates(r)) {
      try {
        const stock = await fetchStockCandles(y, tf as StockTf);
        if (stock.candles.length >= 10) {
          // XXX-USD vencendo = é crypto de verdade (mantém 4h e formatação crypto)
          const isCryptoPair = y === `${r.symbol}-USD`;
          return { asset: { ...r, kind: isCryptoPair ? 'crypto' : 'stock' }, candles: stock.candles, daily: stock.daily, source: 'yahoo' };
        }
      } catch {
        /* próximo candidato */
      }
    }
    throw new Error(`Ativo ${r.symbol} sem dados de ${tf} em nenhuma fonte agora (tente outro timeframe)`);
  }
  const ysym = r.yahooSymbol ?? r.symbol;
  const stock = await fetchStockCandles(ysym, tf === '4h' ? '1d' : (tf as StockTf));
  return { asset: { ...r, kind: 'stock' }, candles: stock.candles, daily: stock.daily, source: 'yahoo' };
}

/** Símbolos Yahoo candidatos p/ crypto (ex.: XMR-USD) e ações. */
function yahooCandidates(r: ResolvedAsset): string[] {
  const out = [`${r.symbol}-USD`];
  if (r.yahooSymbol && !out.includes(r.yahooSymbol)) out.push(r.yahooSymbol);
  if (!out.includes(r.symbol)) out.push(r.symbol);
  return out;
}

async function fetchStockCandles(ysym: string, tf: StockTf): Promise<{ candles: Candle[]; daily: Candle[] }> {
  const { range, interval } = yahooRange(tf);
  const [main, d] = await Promise.all([
    yahooChart(ysym, range, interval),
    tf === '1d' ? Promise.resolve(null) : yahooChart(ysym, '1y', '1d'),
  ]);
  const raw = tf === '4h' ? resampleCandles(main.candles, H4_MS) : main.candles;
  if (!raw.length) throw new Error(`Sem dados para ${ysym}`);
  return { candles: raw, daily: tf === '1d' ? raw : (d?.candles ?? []) };
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
    const kl = await multiKlines(asset.binanceSymbol.replace(/USDT$/, ''), tf as KlineInterval, 120, 10);
    if (kl && kl.klines.length) return kl.klines;
  }
  const errors: unknown[] = [];
  for (const y of asset.kind === 'crypto' ? yahooCandidates(asset) : [asset.yahooSymbol ?? asset.symbol]) {
    try {
      if (tf === '1h') return (await yahooChart(y, '3mo', '60m')).candles;
      if (tf === '1w') return (await yahooChart(y, '2y', '1wk')).candles;
      return (await yahooChart(y, '1y', '1d')).candles;
    } catch (e) {
      errors.push(e);
    }
  }
  throw errors[0] instanceof Error ? errors[0] : new Error('MTF indisponível');
}
