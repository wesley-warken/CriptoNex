import { useCallback, useEffect, useMemo, useState } from 'react';
import { classifyTrend } from '@/engine/trend';
import { buildContextPrompt } from '@/services/aiAnalysis';
import type { MarketContextData } from '@/services/marketContext';
import type { MarketPulse } from '../domain/pulse';
import { aiAdapter, marketContextAdapter } from '../infrastructure/adapters';
import { buildMarketPulseView } from './usecases';
import type { AnalysisApi, MarketApi } from './useSetups';

/**
 * application/useMarketPulse — pulso semanal/mensal + resumo IA opcional.
 * Recebe market/analysis do useSetups (uma assinatura só, sem polling duplo).
 * Contexto externo recarrega sozinho quando vence (7 dias); IA só sob clique.
 */
export interface AiState {
  busy: boolean;
  text: string | null;
  error: string | null;
  badge?: string | null;
}

export interface MarketPulseApi {
  pulse: MarketPulse | null;
  updatedAt: number | null;
  stale: boolean;
  refreshing: boolean;
  refresh: () => void;
  ai: AiState;
  aiQuota: string;
  runAiSummary: () => void;
}

function btcReturns(candles: MarketApi['candles']): { ret7d: number | null; ret30d: number | null; trend: string | null } {
  const kl = candles['BTC'] ?? [];
  const closes = kl.map((k) => k.close).filter((v) => v > 0);
  if (closes.length < 35) return { ret7d: null, ret30d: null, trend: null };
  const last = closes[closes.length - 1];
  const ret7d = (last / closes[Math.max(0, closes.length - 8)] - 1) * 100;
  const ret30d = (last / closes[Math.max(0, closes.length - 31)] - 1) * 100;
  return { ret7d, ret30d, trend: classifyTrend(ret30d, 30) };
}

export function useMarketPulse(market: MarketApi, analysis: AnalysisApi): MarketPulseApi {
  const [mctx, setMctx] = useState<MarketContextData | null>(null);
  const [stale, setStale] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runId, setRunId] = useState(0);
  const [ai, setAi] = useState<AiState>({ busy: false, text: null, error: null });
  const [quota, setQuota] = useState<string>('—');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, stale: isStale } = await marketContextAdapter.load();
      if (!alive) return;
      if (data) {
        setMctx(data);
        setStale(isStale);
      }
      if (!data || isStale) {
        setRefreshing(true);
        try {
          const fresh = await marketContextAdapter.refresh();
          if (alive) {
            setMctx(fresh);
            setStale(false);
          }
        } catch {
          /* mantém cache ou exibe indisponível */
        } finally {
          if (alive) setRefreshing(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [runId]);

  useEffect(() => {
    void (async () => {
      try {
        const [q, ql] = await Promise.all([aiAdapter.quota(), aiAdapter.quotaLite()]);
        const f = (v: { left: number | null; cap: number }) => (v.left == null ? `—/${v.cap}` : `${v.left}/${v.cap}`);
        setQuota(`${f(q)} · lite ${f(ql)}`);
      } catch {
        /* sem cota */
      }
    })();
  }, []);

  const btc = useMemo(() => btcReturns(market.candles), [market.candles]);

  const pulse = useMemo(
    () =>
      buildMarketPulseView({
        btc: { ret7d: btc.ret7d, ret30d: btc.ret30d, trend30: btc.trend },
        br: { ret7d: mctx?.br.ret7d ?? null, ret30d: mctx?.br.ret30d ?? null, trend30: mctx?.br.trend ?? null },
        us: { ret7d: mctx?.us.ret7d ?? null, ret30d: mctx?.us.ret30d ?? null, trend30: mctx?.us.trend ?? null },
        breadth: analysis.regime.breadth,
        regimeLabel: analysis.regime.label,
      }),
    [btc, mctx, analysis.regime.breadth, analysis.regime.label],
  );

  const refresh = useCallback(() => setRunId((x) => x + 1), []);

  const runAiSummary = useCallback(() => {
    setAi((s) => ({ ...s, busy: true, error: null }));
    void (async () => {
      const r = await aiAdapter.summarizeContext(
        buildContextPrompt({
          btc7d: btc.ret7d, btc30d: btc.ret30d, breadth: analysis.regime.breadth,
          regime: analysis.regime.label, br30d: mctx?.br.ret30d ?? null, us30d: mctx?.us.ret30d ?? null,
        }),
      );
      const q = await aiAdapter.quota().catch(() => null);
      if (q) {
        const ql = await aiAdapter.quotaLite().catch(() => null);
        const f = (v: { left: number | null; cap: number }) => (v.left == null ? `—/${v.cap}` : `${v.left}/${v.cap}`);
        setQuota(ql ? `${f(q)} · lite ${f(ql)}` : f(q));
      }
      if (!r.ok) setAi({ busy: false, text: null, error: r.text, badge: null });
      else setAi({ busy: false, text: r.text, error: null, badge: r.badge ?? null });
    })();
  }, [btc, analysis.regime.breadth, analysis.regime.label, mctx]);

  return {
    pulse,
    updatedAt: mctx?.computedAt ?? null,
    stale, refreshing, refresh,
    ai, aiQuota: quota, runAiSummary,
  };
}
