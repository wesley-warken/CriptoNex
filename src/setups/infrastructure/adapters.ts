import { analyzeHorizons } from '@/services/horizon';
import { loadMarketContext, refreshMarketContext } from '@/services/marketContext';
import { loadWalkforward } from '@/services/walkforward';
import { AI_DAILY_CAP, aiRemaining, askGemini } from '@/services/aiAnalysis';
import { withRetry } from './retry';
import type { AiPort, AnalysisPort, EvidencePort, MarketContextPort } from './ports';

/**
 * infrastructure/adapters — implementações concretas dos ports.
 * Cache vive nos serviços (IDB); aqui só retry com backoff na borda de rede.
 * Nenhum adapter é chamado por render: só por use-cases/hooks sob demanda.
 */

export const analysisAdapter: AnalysisPort = {
  analyze: (candidates, onProgress, signal) => analyzeHorizons(candidates, onProgress, signal),
};

export const marketContextAdapter: MarketContextPort = {
  load: () => loadMarketContext(),
  refresh: () => withRetry(() => refreshMarketContext(), { tries: 2, baseMs: 2000 }),
};

export const evidenceAdapter: EvidencePort = {
  load: () => loadWalkforward().catch(() => null),
};

async function runAi(prompt: string) {
  const r = await askGemini(prompt);
  if (!r.ok) {
    const msg =
      r.error === 'NO_KEY'
        ? 'Sem chave: crie .env com VITE_GEMINI_API_KEY (veja .env.example) e reinicie.'
        : r.error === 'QUOTA'
          ? 'Cota diária da IA esgotada. Respostas em cache continuam valendo.'
          : 'IA falhou agora. Tente de novo.';
    return { ok: false as const, text: msg };
  }
  return { ok: true as const, text: r.text };
}

export const aiAdapter: AiPort = {
  quota: async () => ({ left: await aiRemaining().catch(() => null), cap: AI_DAILY_CAP }),
  summarizeContext: (prompt) => runAi(prompt),
  analyzeSetup: (prompt) => runAi(prompt),
};
