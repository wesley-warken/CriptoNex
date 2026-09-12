import { useCallback, useState } from 'react';
import { HORIZONS } from '@/engine/horizon/horizons';
import { SETUP_LABELS } from '@/engine/horizon/setups';
import { buildSetupPrompt } from '@/services/aiAnalysis';
import type { Setup } from '../domain/entities';
import { aiAdapter } from '../infrastructure/adapters';
import type { AiState } from './useMarketPulse';

/**
 * application/useSetupAi — análise IA por setup, sempre sob clique.
 * Cache por símbolo na sessão; cota respeitada pelo adapter.
 */
export interface SetupAiApi {
  bySymbol: Record<string, AiState>;
  analyze: (o: Setup) => void;
}

const idle = (): AiState => ({ busy: false, text: null, error: null });

export function useSetupAi(): SetupAiApi {
  const [bySymbol, setBySymbol] = useState<Record<string, AiState>>({});

  const analyze = useCallback((o: Setup) => {
    setBySymbol((m) => ({ ...m, [o.symbol]: { ...idle(), busy: true } }));
    void (async () => {
      const r = await aiAdapter.analyzeSetup(
        buildSetupPrompt({
          symbol: o.symbol, setupLabel: SETUP_LABELS[o.setup], horizonLabel: HORIZONS[o.horizon].label,
          score: o.score, confidence: o.confidence, tier: o.tier,
          entryLow: o.entryLow, entryHigh: o.entryHigh, entryIdeal: o.entryIdeal, stop: o.stop,
          t1: o.t1, t2: o.t2, t3: o.t3, rr1: o.rr1, rr2: o.rr2, rr3: o.rr3, basePct: o.basePct,
          why: o.why, risks: o.risks, regime: o.regime,
          evN: o.evidence?.n ?? null, evHit: o.evidence?.hit ?? null,
        }),
      );
      setBySymbol((m) => ({
        ...m,
        [o.symbol]: r.ok
          ? { busy: false, text: r.text, error: null, badge: r.badge ?? null }
          : { busy: false, text: null, error: r.text, badge: null },
      }));
    })();
  }, []);

  return { bySymbol, analyze };
}
