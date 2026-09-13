import { analyzeHorizons } from '@/services/horizon';
import { loadMarketContext, refreshMarketContext } from '@/services/marketContext';
import { loadWalkforward } from '@/services/walkforward';
import {
  AI_DAILY_CAP, AI_LITE_DAILY_CAP, aiRemaining, aiRemainingLite,
  askGemini, generateExplain,
} from '@/services/aiAnalysis';
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

function honestError(e: 'NO_KEY' | 'QUOTA' | 'FAILED'): string {
  return e === 'NO_KEY'
    ? 'Sem chave: crie .env com VITE_GEMINI_API_KEY (veja .env.example) e reinicie.'
    : e === 'QUOTA'
      ? 'Cota diária da IA esgotada. Respostas em cache continuam valendo.'
      : 'IA falhou agora. Tente de novo.';
}

async function runAi(prompt: string) {
  const r = await askGemini(prompt);
  if (!r.ok) return { ok: false as const, text: honestError(r.error), badge: null as string | null };
  return { ok: true as const, text: r.text, badge: null as string | null };
}

/** Pulso: template primeiro na UI; IA aqui é SÓ enriquecimento Lite. */
async function runAiLite(prompt: string) {
  const r = await askGemini(prompt, 'lite');
  if (!r.ok) return { ok: false as const, text: honestError(r.error), badge: null as string | null };
  return { ok: true as const, text: r.text, badge: null as string | null };
}

/** Explain: Flash com reserva do brief → Lite degradado (badge) → instrução. */
async function runExplain(prompt: string) {
  const r = await generateExplain(prompt);
  if (r.text) return { ok: true as const, text: r.text, badge: r.badge };
  return { ok: false as const, text: honestError(r.error ?? 'FAILED'), badge: null as string | null };
}

export const aiAdapter: AiPort = {
  quota: async () => ({ left: await aiRemaining().catch(() => null), cap: AI_DAILY_CAP }),
  quotaLite: async () => ({ left: await aiRemainingLite().catch(() => null), cap: AI_LITE_DAILY_CAP }),
  summarizeContext: (prompt) => runAiLite(prompt),
  analyzeSetup: (prompt) => runExplain(prompt),
};
