import { idbGet, idbSet } from '@/lib/idb';

/**
 * IA opcional via Google AI Studio (plano gratuito) — com disciplina de cota:
 * teto diário duro, cache IDB 24h por prompt, SOMENTE sob clique do usuário
 * (nunca por render, lista ou polling). Sem chave → UI instrui, sem erro.
 * Modelo barato (flash); nada aqui justifica LLM caro.
 */
export const AI_DAILY_CAP = 20;
const CACHE_TTL_MS = 24 * 3600_000;
const USAGE_KEY = 'cc.ai:usage';
const CACHE_KEY = (h: string) => `cc.ai:v1:${h}`;
const DEFAULT_MODEL = 'gemini-3.5-flash';

export const AI_SYSTEM = [
  'Você é um analista técnico que explica setups, não um consultor.',
  'Use SOMENTE os dados fornecidos. Nunca invente níveis, preços ou estatísticas.',
  'Nunca recomende comprar, vender ou manter. Nunca apresente probabilidade de lucro.',
  'Responda em português do Brasil, direto, no máximo 120 palavras.',
].join(' ');

export function quotaDay(ts = Date.now()): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface AIUsage {
  day: string;
  count: number;
}

export function canSpend(u: AIUsage | null, day: string, cap = AI_DAILY_CAP): boolean {
  if (!u || u.day !== day) return true;
  return u.count < cap;
}

/** FNV-1a 32-bit (chave de cache; não é segurança). */
export function hashPrompt(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface SetupPromptInput {
  symbol: string;
  setupLabel: string;
  horizonLabel: string;
  score: number;
  confidence: number;
  tier: string;
  entryLow: number | null;
  entryHigh: number | null;
  entryIdeal: number | null;
  stop: number | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  basePct: number | null;
  why: string[];
  risks: string[];
  regime: string;
  evN: number | null;
  evHit: number | null;
}

const n = (v: number | null, d = 1): string => (v == null || !Number.isFinite(v) ? 'N/A' : String(Number(v.toFixed(d))));

export function buildSetupPrompt(o: SetupPromptInput): string {
  return [
    `SETUP: ${o.symbol} · ${o.setupLabel} · horizonte ${o.horizonLabel} · tier ${o.tier} · score ${o.score} · confiança técnica ${o.confidence}.`,
    `PLANO: entrada ${n(o.entryLow)}–${n(o.entryHigh)} (ideal ${n(o.entryIdeal)}) · stop ${n(o.stop)} · alvos ${n(o.t1)}/${n(o.t2)}/${n(o.t3)} · R:R ${n(o.rr1)}/${n(o.rr2)}/${n(o.rr3)} · base ${o.basePct != null ? `${n(o.basePct)}%` : 'N/A'}.`,
    `SUPORTE: ${o.why.slice(0, 3).join(' | ') || '—'}. RISCOS: ${o.risks.slice(0, 3).join(' | ') || '—'}. Regime: ${o.regime}.`,
    o.evN != null && o.evN >= 30
      ? `EVIDÊNCIA: N=${o.evN}, hit ${(o.evHit != null ? (o.evHit * 100).toFixed(0) : '—')}% (walk-forward por tier).`
      : 'EVIDÊNCIA: insuficiente (N<30).',
    'Explique em até 120 palavras o que precisa acontecer para o plano funcionar e qual é o principal risco. Sem recomendação.',
  ].join('\n');
}

export interface ContextPromptInput {
  btc7d: number | null;
  btc30d: number | null;
  breadth: number;
  regime: string;
  br30d: number | null;
  us30d: number | null;
}

export function buildContextPrompt(c: ContextPromptInput): string {
  return [
    `CONTEXTO: BTC 7d ${n(c.btc7d)}% · BTC 30d ${n(c.btc30d)}% · amplitude ${c.breadth} · regime ${c.regime} · Ibovespa 30d ${n(c.br30d)}% · S&P 30d ${n(c.us30d)}%.`,
    'Resuma em até 100 palavras o quadro de forma neutra e diga o que o mudaria. Sem previsões categóricas.',
  ].join('\n');
}

export type AIResult =
  | { ok: true; text: string; cached: boolean; remaining: number }
  | { ok: false; error: 'NO_KEY' | 'QUOTA' | 'FAILED' };

function apiKey(): string | null {
  try {
    const k = (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined)?.trim();
    return k ? k : null;
  } catch {
    return null;
  }
}

function model(): string {
  try {
    const m = (import.meta.env?.VITE_GEMINI_MODEL as string | undefined)?.trim();
    return m || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

async function loadUsage(): Promise<AIUsage | null> {
  try {
    const r = await idbGet<AIUsage>(USAGE_KEY);
    return r ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * Gera texto via Gemini (barato). Retorna cache sem gastar cota.
 * Erros de rede/cota viram {ok:false} com motivo — nunca throw na UI.
 */
export async function askGemini(userPrompt: string): Promise<AIResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'NO_KEY' };
  const day = quotaDay();
  const usage = await loadUsage();
  if (!canSpend(usage, day)) return { ok: false, error: 'QUOTA' };
  const h = hashPrompt(`${model()}|${userPrompt}`);
  try {
    const cached = await idbGet<string>(CACHE_KEY(h));
    if (cached && !cached.stale) {
      const used = usage && usage.day === day ? usage.count : 0;
      return { ok: true, text: cached.data, cached: true, remaining: AI_DAILY_CAP - used };
    }
  } catch {
    /* sem cache: segue */
  }
  let text: string;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: AI_SYSTEM }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    if (r.status === 429) return { ok: false, error: 'QUOTA' };
    if (!r.ok) return { ok: false, error: 'FAILED' };
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
    if (!text) return { ok: false, error: 'FAILED' };
  } catch {
    return { ok: false, error: 'FAILED' };
  }
  const next: AIUsage = { day, count: (usage && usage.day === day ? usage.count : 0) + 1 };
  try {
    await idbSet(USAGE_KEY, next, 2 * 86400_000);
    await idbSet(CACHE_KEY(h), text, CACHE_TTL_MS);
  } catch {
    /* quota conta mesmo sem persistir cache */
  }
  return { ok: true, text, cached: false, remaining: AI_DAILY_CAP - next.count };
}

export async function aiRemaining(): Promise<number> {
  const day = quotaDay();
  const u = await loadUsage();
  return AI_DAILY_CAP - (u && u.day === day ? u.count : 0);
}
