/**
 * Klines para o Monitor (Radar + vigia background): mesma fonte, mesma regra.
 *
 * - Base de closes (`kl`): sparkline do universo (grátis) + 1d/1s por plano —
 *   vale para MACD/médias/atenção/SR. Onde o plano exige RSI (`rsiTf`), a base
 *   passa a ser OHLC real (paridade TV) ou null = indisponível.
 * - Range real (`rangeKl`): OHLC de exchange SOMENTE nos TFs onde algum
 *   filtro ativo avalia Estocástico/Supertrend (plano rangeTf). Sem dado
 *   real, esses indicadores ficam indisponíveis (null) — nunca sintético.
 */
import { closesToCandles } from '@/services/indicatorTable';
import { ensureMaKlines } from '@/services/maTable';
import { getIntervalKlines, getRealKlines, sampleEvery } from '@/services/rsiTable';
import { RSI_MIN_BARS } from '@/engine/indicators';
import type { MonDataPlan, MonTf } from '@/engine/monitor';
import type { UniverseCoin } from '@/services/universeTypes';
import type { Candle } from '@/types';

export interface MonCoinKlines {
  kl: Record<MonTf, Candle[] | null>;
  rangeKl: Partial<Record<MonTf, Candle[] | null>>;
}

const RANGE_LIMIT: Record<MonTf, number> = { '1h': 120, '4h': 120, '1d': 120, '1w': 60 };
/** Janela real para o RSI (warmup de Wilder + AVG). */
const RSI_LIMIT: Record<MonTf, number> = { '1h': 220, '4h': 220, '1d': 300, '1w': 150 };

export async function fetchMonCoinKlines(
  c: UniverseCoin,
  plan: MonDataPlan,
): Promise<MonCoinKlines> {
  const hourly = (c.spark7d ?? []).filter((v) => v > 0);
  const h1syn = closesToCandles(hourly.slice(-120)) ?? null;
  const h4syn = closesToCandles(sampleEvery(hourly, 4)) ?? null;
  const needReal = (tf: MonTf): boolean => plan.rangeTf.includes(tf);
  const needRsi = (tf: MonTf): boolean => plan.rsiTf.includes(tf);
  const [h1r, h4r, d1m, w1m, d1r, w1r, h1rsi, h4rsi, d1rsi, w1rsi] = await Promise.all([
    needReal('1h') ? getRealKlines(c.symbol, '1h', 15, RANGE_LIMIT['1h']) : null,
    needReal('4h') ? getRealKlines(c.symbol, '4h', 15, RANGE_LIMIT['4h']) : null,
    plan.daily === 'none'
      ? null
      : plan.daily === 'ma'
        ? ensureMaKlines([{ symbol: c.symbol, id: c.id }], '1d').then((m) => m.get(c.symbol) ?? null)
        : getIntervalKlines(c.symbol, c.id, '1d', 60, 120),
    plan.weekly ? getIntervalKlines(c.symbol, c.id, '1w', 30, 60) : null,
    needReal('1d') ? getRealKlines(c.symbol, '1d', 15, RANGE_LIMIT['1d']) : null,
    needReal('1w') ? getRealKlines(c.symbol, '1w', 15, RANGE_LIMIT['1w']) : null,
    needRsi('1h') ? getRealKlines(c.symbol, '1h', RSI_MIN_BARS, RSI_LIMIT['1h']) : null,
    needRsi('4h') ? getRealKlines(c.symbol, '4h', RSI_MIN_BARS, RSI_LIMIT['4h']) : null,
    needRsi('1d') ? getRealKlines(c.symbol, '1d', RSI_MIN_BARS, RSI_LIMIT['1d']) : null,
    needRsi('1w') ? getRealKlines(c.symbol, '1w', RSI_MIN_BARS, RSI_LIMIT['1w']) : null,
  ]);
  const rangeKl: Partial<Record<MonTf, Candle[] | null>> = {};
  if (needReal('1h')) rangeKl['1h'] = h1r;
  if (needReal('4h')) rangeKl['4h'] = h4r;
  if (needReal('1d')) rangeKl['1d'] = d1r;
  if (needReal('1w')) rangeKl['1w'] = w1r;
  return {
    kl: {
      '1h': needRsi('1h') ? h1rsi : h1syn,
      '4h': needRsi('4h') ? h4rsi : h4syn,
      '1d': needRsi('1d') ? d1rsi : d1m,
      '1w': needRsi('1w') ? w1rsi : w1m,
    },
    rangeKl,
  };
}
