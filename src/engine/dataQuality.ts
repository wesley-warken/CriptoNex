import type { Candle } from '@/types';

export type CandleTF = '1h' | '4h' | '1d' | '1w';
export type AgeStatus = 'fresh' | 'stale' | 'invalid';

export interface DataQualityInput {
  provider?: string | null;
  fetchedAt?: number | null;
  timeframe?: CandleTF;
  market?: 'crypto' | 'stock';
  minCandles?: number;
}

export interface DataQualityReport {
  score: number;
  freshness: number;
  completeness: number;
  integrity: number;
  sourceReliability: number;
  gaps: number;
  duplicates: number;
  warnings: string[];
  errors: string[];
  /** Índices com erro de integridade (para pular entradas no backtest). */
  invalid: number[];
  provider: string | null;
  fetchedAt: number | null;
}

/** Confiabilidade a priori da fonte (informativa; não entra no score). */
export const PROVIDER_RELIABILITY: Record<string, number> = {
  binance: 90,
  kraken: 88,
  coinbase: 88,
  yahoo: 85,
  brapi: 85,
  coingecko: 80,
  snapshot: 60,
};

const H = 3600_000;
export const TF_INTERVAL_MS: Record<CandleTF, number> = { '1h': H, '4h': 4 * H, '1d': 24 * H, '1w': 7 * 24 * H };
/** Idade máxima antes de considerar stale (intraday tolera pouco, diário mais). */
export const TF_STALE_MS: Record<CandleTF, number> = { '1h': 20 * 60_000, '4h': 2 * H, '1d': 30 * H, '1w': 8 * 24 * H };

/** fresh/stale/invalid para um timestamp de dado num timeframe. */
export function tfAgeStatus(tf: CandleTF, ts: number | null | undefined, now = Date.now()): AgeStatus {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return 'invalid';
  if (ts > now + 5 * 60_000) return 'invalid'; // futuro além de tolerância
  return now - ts > TF_STALE_MS[tf] ? 'stale' : 'fresh';
}

/** "há 12min" / "há 3h" / "há 2d" (para UI e logs). */
export function formatAge(ts: number | null | undefined, now = Date.now()): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return 'idade desconhecida';
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function isFriToMon(prev: number, cur: number): boolean {
  const pd = new Date(prev).getUTCDay();
  const cd = new Date(cur).getUTCDay();
  return pd === 5 && cd === 1;
}

/**
 * Valida série OHLCV sem mascarar nada: todo problema vira errors[] ou
 * warnings[] com contagem, e índices ruins vão para invalid[].
 * Pesos do score (documentados, heurísticos): 40% completude, 40%
 * integridade, 20% frescor.
 */
export function validateCandles(
  candles: Candle[],
  input: DataQualityInput = {},
  now = Date.now(),
): DataQualityReport {
  const { provider = null, fetchedAt = null, timeframe = '1d', market = 'crypto', minCandles = 60 } = input;
  const warnings: string[] = [];
  const errors: string[] = [];
  const invalid: number[] = [];
  let gaps = 0;
  let duplicates = 0;
  const errKind = new Map<string, number>();
  const mark = (i: number, kind: string) => {
    invalid.push(i);
    errKind.set(kind, (errKind.get(kind) ?? 0) + 1);
  };

  if (!candles.length) {
    return {
      score: 0, freshness: 0, completeness: 0, integrity: 0,
      sourceReliability: provider && PROVIDER_RELIABILITY[provider] ? PROVIDER_RELIABILITY[provider] : 50,
      gaps: 0, duplicates: 0,
      warnings: [], errors: ['série vazia: sem candles'],
      invalid, provider, fetchedAt,
    };
  }

  const expected = TF_INTERVAL_MS[timeframe];
  let volZero = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    let bad = false;
    const badKind = (k: string) => { bad = true; mark(i, k); };
    const nums = [c.time, c.open, c.high, c.low, c.close, c.volume];
    if (nums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) badKind('valor não-finito (NaN/Infinity)');
    if (i > 0) {
      const p = candles[i - 1].time;
      if (c.time === p) { duplicates += 1; badKind('timestamp duplicado'); }
      else if (c.time < p) badKind('fora de ordem cronológica');
      else {
        const dt = c.time - p;
        if (dt > expected * 1.5 && !(market === 'stock' && isFriToMon(p, c.time))) gaps += 1;
      }
    }
    if (c.time <= 0) badKind('timestamp inválido');
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) badKind('preço <= 0');
    if (c.high < c.low) badKind('high<low');
    if (c.close > c.high || c.close < c.low) badKind('close fora de [low, high]');
    if (c.volume < 0) badKind('volume negativo');
    else if (c.volume === 0) volZero += 1;
    void bad;
  }
  if (volZero > 0) warnings.push(`${volZero} candle(s) com volume zerado`);
  if (gaps > 0) warnings.push(`${gaps} gap(s) acima de 1.5× o intervalo ${timeframe}`);
  if (duplicates > 0) warnings.push(`${duplicates} timestamp(s) duplicado(s)`);
  for (const [k, n] of errKind) errors.push(`${n} candle(s) com ${k}`);
  if (candles.length < minCandles) {
    warnings.push(`amostra insuficiente: ${candles.length}/${minCandles} candles`);
  }

  const errSet = new Set(invalid);
  const integrity = Math.round(100 * (1 - errSet.size / candles.length));
  const completeness = Math.round(
    100 * Math.min(1, candles.length / Math.max(1, minCandles)) * Math.max(0, 1 - gaps * 0.05),
  );
  const refTs = fetchedAt ?? candles[candles.length - 1].time;
  const status = tfAgeStatus(timeframe, refTs, now);
  const freshness =
    status === 'invalid' ? 0 : status === 'fresh' ? 100 : Math.max(0, Math.round(100 * (1 - (now - (refTs as number)) / (TF_STALE_MS[timeframe] * 3))));
  if (status === 'stale') warnings.push(`dados atrasados (${formatAge(refTs, now)}, TF ${timeframe})`);
  if (status === 'invalid' && candles.length) warnings.push('timestamp de referência inválido para frescor');
  const score = Math.round(0.4 * completeness + 0.4 * integrity + 0.2 * freshness);

  return {
    score, freshness, completeness, integrity,
    sourceReliability: provider && PROVIDER_RELIABILITY[provider] ? PROVIDER_RELIABILITY[provider] : 50,
    gaps, duplicates, warnings, errors, invalid, provider, fetchedAt,
  };
}
