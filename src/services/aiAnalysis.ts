import { idbGet, idbSet } from '@/lib/idb';

/**
 * IA opcional via Google AI Studio (plano gratuito) — com disciplina de cota:
 * teto diário duro POR TIER, cache IDB 24h por prompt, SOMENTE sob clique
 * do usuário (nunca por render, lista ou polling). Sem chave → UI instrui, sem erro.
 * Dois tiers: Flash (principal: brief + explains, 20/dia) e Flash-Lite
 * (auxiliar: translates + pulso, 50/dia). O auxiliar NUNCA escala para o
 * Flash em cascata de tarefa; o Flash tem 1 slot reservado para o brief
 * diário até ele rodar (ver canExplainFlash).
 */
export const AI_DAILY_CAP = 20;
export const AI_LITE_DAILY_CAP = 50;
const CACHE_TTL_MS = 24 * 3600_000;
const USAGE_KEY = 'cc.ai:usage';
const USAGE_FLASH_KEY = 'cc.ai:usage:flash';
const USAGE_LITE_KEY = 'cc.ai:usage:lite';
const BRIEF_KEY = (day: string) => `cc.ai:brief:${day}`;
const CACHE_KEY = (h: string) => `cc.ai:v1:${h}`;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MODEL_LITE = 'gemini-3.5-flash-lite';

/** Tier de modelo: 'flash' (principal) ou 'lite' (auxiliar). */
export type AiTier = 'flash' | 'lite';

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
  return modelFor('flash');
}

function modelFor(tier: AiTier): string {
  try {
    if (tier === 'lite') {
      const m = (import.meta.env?.VITE_GEMINI_MODEL_LITE as string | undefined)?.trim();
      return m || DEFAULT_MODEL_LITE;
    }
    const m = (import.meta.env?.VITE_GEMINI_MODEL as string | undefined)?.trim();
    return m || DEFAULT_MODEL;
  } catch {
    return tier === 'lite' ? DEFAULT_MODEL_LITE : DEFAULT_MODEL;
  }
}

function usageKey(tier: AiTier): string {
  return tier === 'lite' ? USAGE_LITE_KEY : USAGE_FLASH_KEY;
}

function capFor(tier: AiTier): number {
  return tier === 'lite' ? AI_LITE_DAILY_CAP : AI_DAILY_CAP;
}

async function loadUsage(): Promise<AIUsage | null> {
  return loadUsageFor(USAGE_KEY);
}

async function loadUsageFor(key: string): Promise<AIUsage | null> {
  try {
    const r = await idbGet<AIUsage>(key);
    // Migração: quem tem cota no formato antigo carrega no Flash.
    if (!r && key === USAGE_FLASH_KEY) {
      const legacy = await idbGet<AIUsage>(USAGE_KEY);
      return legacy ? legacy.data : null;
    }
    return r ? r.data : null;
  } catch {
    return null;
  }
}

/** O brief de hoje já rodou (em qualquer tier)? Libera a reserva do Flash. */
export async function isBriefDone(day = quotaDay()): Promise<boolean> {
  try {
    const r = await idbGet<string>(BRIEF_KEY(day));
    return !!r && !r.stale && r.data === day;
  } catch {
    return false;
  }
}

export async function markBriefDone(day = quotaDay()): Promise<void> {
  try {
    await idbSet(BRIEF_KEY(day), day, 2 * 86400_000);
  } catch {
    /* flag best-effort */
  }
}

/**
 * Reserva do principal: explains só consomem Flash se couber a chamada
 * MAIS 1 slot reservado ao brief (enquanto ele não rodou hoje).
 * Ex.: 19 explains antes das 10:30 → o 20º slot fica guardado p/ o brief.
 */
export function canExplainFlash(flashUsed: number, briefDone: boolean, cap = AI_DAILY_CAP): boolean {
  const reserve = briefDone ? 0 : 1;
  return flashUsed + 1 + reserve <= cap;
}

async function flashUsedToday(day: string): Promise<number> {
  const u = await loadUsageFor(USAGE_FLASH_KEY);
  return u && u.day === day ? u.count : 0;
}

type FetchStatus = { status: 'ok'; text: string } | { status: 'quota' | 'failed' | 'notfound' };

async function callModel(
  key: string, modelId: string, userPrompt: string,
  systemText: string = AI_SYSTEM, maxTokens = 8192,
): Promise<FetchStatus> {
  let r: Response;
  // Teto 8192 para 800 palavras (~1200 tokens) com folga. Thinking já era o
  // causador do MAX_TOKENS com 1024→980 thinking + 40 texto. Mantém
  // thinkingBudget 0. Modelos lite rejeitam o campo com 400 — por isso só
  // vai nos modelos sem "lite" no nome. Temperature 0.2 segue extrativo.
  const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens, temperature: 0.2 };
  if (!modelId.includes('lite')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig,
      }),
    });
  } catch {
    return { status: 'failed' };
  }
  if (r.status === 429) return { status: 'quota' };
  if (r.status === 404) return { status: 'notfound' };
  if (!r.ok) return { status: 'failed' };
  try {
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
    return text ? { status: 'ok', text } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

export interface AskOpts {
  /** System instruction (padrão: AI_SYSTEM). */
  system?: string;
  /** Teto de tokens de saída (padrão: 8192 para 800 palavras). */
  maxTokens?: number;
}

/**
 * Núcleo por tier: cota própria, cache próprio (tier+modelo no hash).
 * Fallback de CONFIGURAÇÃO (não de tarefa): se o modelo Lite responder 404
 * (nome inválido), tenta 1x o modelo principal MAS cobra da cota Lite —
 * a cota nobre nunca é tocada por tarefa auxiliar.
 */
async function askTier(userPrompt: string, tier: AiTier, opts?: AskOpts): Promise<AIResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'NO_KEY' };
  const day = quotaDay();
  const cap = capFor(tier);
  const ukey = usageKey(tier);
  const usage = await loadUsageFor(ukey);
  if (!canSpend(usage, day, cap)) return { ok: false, error: 'QUOTA' };
  const modelId = modelFor(tier);
  const h = hashPrompt(`${tier}|${modelId}|${userPrompt}`);
  try {
    const cached = await idbGet<string>(CACHE_KEY(h));
    if (cached && !cached.stale) {
      const used = usage && usage.day === day ? usage.count : 0;
      return { ok: true, text: cached.data, cached: true, remaining: cap - used };
    }
  } catch {
    /* sem cache: segue */
  }
  let res = await callModel(key, modelId, userPrompt, opts?.system, opts?.maxTokens);
  if (res.status === 'notfound' && tier === 'lite') {
    res = await callModel(key, modelFor('flash'), userPrompt, opts?.system, opts?.maxTokens);
    if (res.status === 'notfound') return { ok: false, error: 'FAILED' };
  }
  if (res.status === 'quota') return { ok: false, error: 'QUOTA' };
  if (res.status !== 'ok') return { ok: false, error: 'FAILED' };
  const text = res.text;
  const next: AIUsage = { day, count: (usage && usage.day === day ? usage.count : 0) + 1 };
  try {
    await idbSet(ukey, next, 2 * 86400_000);
    await idbSet(CACHE_KEY(h), text, CACHE_TTL_MS);
  } catch {
    /* quota conta mesmo sem persistir cache */
  }
  return { ok: true, text, cached: false, remaining: cap - next.count };
}

/**
 * Gera texto via Gemini (barato). Retorna cache sem gastar cota.
 * Erros de rede/cota viram {ok:false} com motivo — nunca throw na UI.
 * Tier padrão 'flash' (compatível com chamadas existentes).
 */
export async function askGemini(userPrompt: string, tier: AiTier = 'flash', opts?: AskOpts): Promise<AIResult> {
  return askTier(userPrompt, tier, opts);
}

export async function aiRemaining(): Promise<number> {
  const day = quotaDay();
  const u = await loadUsageFor(USAGE_FLASH_KEY);
  return AI_DAILY_CAP - (u && u.day === day ? u.count : 0);
}

export async function aiRemainingLite(): Promise<number> {
  const day = quotaDay();
  const u = await loadUsageFor(USAGE_LITE_KEY);
  return AI_LITE_DAILY_CAP - (u && u.day === day ? u.count : 0);
}

/** Badge exibido quando a resposta veio degradada (Lite ou template). */
export const BADGE_LITE = 'versão simplificada (Lite)';
export const BADGE_TEMPLATE = 'resumo automático (sem IA)';

export interface CascadeOut {
  text: string | null;
  /** Tier que produziu o texto; 'unavailable' = sem texto (UI mostra original/instrução). */
  tier: AiTier | 'template' | 'unavailable';
  badge: string | null;
  error: 'NO_KEY' | 'QUOTA' | 'FAILED' | null;
  /** Motivo legível do fallback (ex.: validação: "43 palavras; âncora ausente"). */
  detail: string | null;
}

/**
 * Cadeia do EXPLAIN: Flash (com reserva do brief) → Lite degradado (badge)
 * → indisponível (UI mostra instrução honesta).
 */
export async function generateExplain(userPrompt: string): Promise<CascadeOut> {
  const day = quotaDay();
  const [used, done] = await Promise.all([flashUsedToday(day), isBriefDone(day)]);
  if (canExplainFlash(used, done)) {
    const r = await askTier(userPrompt, 'flash');
    if (r.ok) return { text: r.text, tier: 'flash', badge: null, error: null, detail: null };
    if (r.error === 'NO_KEY') return { text: null, tier: 'unavailable', badge: null, error: 'NO_KEY', detail: 'NO_KEY' };
  }
  const lite = await askTier(userPrompt, 'lite');
  if (lite.ok) return { text: lite.text, tier: 'lite', badge: BADGE_LITE, error: null, detail: null };
  if (lite.error === 'NO_KEY') return { text: null, tier: 'unavailable', badge: null, error: 'NO_KEY', detail: 'NO_KEY' };
  return { text: null, tier: 'unavailable', badge: null, error: lite.error, detail: lite.error };
}

/**
 * Cadeia do TRANSLATE: Lite → indisponível (chamador mostra o original
 * com badge; nunca toca o Flash, nunca trava).
 */
export async function generateTranslate(text: string): Promise<{ text: string; tier: 'lite' | 'unavailable' }> {
  const r = await askTier(`Traduza para o português do Brasil, só a tradução, sem explicações:\n${text.slice(0, 400)}`, 'lite');
  if (r.ok) return { text: r.text, tier: 'lite' };
  return { text, tier: 'unavailable' };
}

/* ---------------- Morning Market Brief (US Open) ---------------- */

/** Adjetivos vazios banidos do brief (hype, não dado). */
export const BANNED_HYPE = [
  'incrível', 'espetacular', 'extraordinário', 'imperdível', 'disparada',
  'garantido', 'aposte', 'milionário', 'bombando', 'voando',
];

export interface BriefIndex {
  label: string;
  price: number | null;
  chg: number | null;
  gap: number | null;
}

export interface MorningBriefInput {
  dateBrt: string;
  spx: BriefIndex;
  ndx: BriefIndex;
  dji: BriefIndex;
  vix: { level: number | null; chg: number | null };
  dxy: { dir: 'alta' | 'queda' | 'lateral' | null; chg: number | null };
  btc: { price: number | null; chg24: number | null };
  eth: { price: number | null; chg24: number | null };
  btcCorr48: { spx48: number | null; btc48: number | null; mode: 'segue' | 'desacoplado' | null };
  regime: string;
  breadth: number | null;
  sectorsTop: { label: string; chg: number }[];
  sectorsBottom: { label: string; chg: number }[];
  news: { title: string; source: string }[];
  elites: { symbol: string; score: number; rr: number | null }[];
  flags: string[];
}

export const bNum = (v: number | null, d = 1): string =>
  v == null || !Number.isFinite(v) ? 'N/A' : (Number.isInteger(v) ? String(v) : v.toFixed(d));
export const bSigned = (v: number | null, d = 1): string =>
  v == null || !Number.isFinite(v) ? 'N/A' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
const bGap = (g: number | null): string => (g == null ? '' : `, gap ${bSigned(g)}%`);

/**
 * Prompt do brief — análise longa: carrega SOMENTE os números fornecidos
 * e impõe interpretação honesta (DADO vs SINAL vs CONTEXTO, N/A nunca vira
 * zero nem conclusão), no mínimo 800 palavras, teto 8192, 5 seções ancoradas.
 * Pedido do usuário 2026-09-14: resposta longa (piso 800) para análise completa.
 */
export function buildMorningBriefPrompt(i: MorningBriefInput): string {
  const sectors = [
    ...i.sectorsTop.map((s) => `${s.label} ${bSigned(s.chg)}%`),
    ...i.sectorsBottom.map((s) => `${s.label} ${bSigned(s.chg)}%`),
  ].join(' · ') || 'N/A';
  const news = i.news.map((x) => `“${x.title}” (${x.source})`).join(' | ') || 'N/A';
  const elites = i.elites.map((e) => `${e.symbol} score ${e.score} R:R ${e.rr ?? 'N/A'}`).join(' · ') || 'nenhum Elite 80+';
  return [
    `ABERTURA US — ${i.dateBrt} · S&P 500 ${bNum(i.spx.price)} (${bSigned(i.spx.chg)}%) · Nasdaq 100 ${bNum(i.ndx.price)} (${bSigned(i.ndx.chg)}%) · Dow Jones ${bNum(i.dji.price)} (${bSigned(i.dji.chg)}%).`,
    `VOLATILIDADE: VIX ${bNum(i.vix.level)} (${bSigned(i.vix.chg)}%) · DXY ${i.dxy.dir ?? 'N/A'} (${bSigned(i.dxy.chg)}%).`,
    `CRIPTOMOEDAS: BTC ${bNum(i.btc.price)} (${bSigned(i.btc.chg24)}% 24h) · ETH ${bNum(i.eth.price)} (${bSigned(i.eth.chg24)}% 24h).`,
    `CORRELAÇÃO 48H: S&P 500 ${bSigned(i.btcCorr48.spx48)}% vs BTC ${bSigned(i.btcCorr48.btc48)}% → ${i.btcCorr48.mode ?? 'inconclusivo'}.`,
    `REGIME: ${i.regime} · amplitude ${i.breadth ?? 'N/A'}.`,
    `SETORES: ${sectors}.`,
    `NOTÍCIAS ÚLTIMAS 12H: ${news}.`,
    `ELITES 1–3M: ${elites}.`,
    `DIVERGÊNCIAS: ${i.flags.join(' | ') || 'nenhuma'}.`,
    'OBJETIVO: Gerar um Morning Brief objetivo, técnico e orientado a contexto de mercado. O texto deve interpretar os dados fornecidos, mas NUNCA criar dados que não estejam presentes.',
    'REGRAS DE INTERPRETAÇÃO:',
    '1. NUNCA invente, estime ou complete valores ausentes.',
    '2. Quando um dado estiver como N/A, trate-o explicitamente como indisponível.',
    '3. N/A NÃO significa zero, neutro, positivo ou negativo.',
    '4. Não transforme ausência de dados em conclusão de mercado.',
    '5. Diferencie claramente: DADO = informação observada; SINAL = relação entre dados; CONTEXTO = interpretação técnica dos sinais.',
    '6. Uma conclusão deve ser baseada apenas em dados disponíveis.',
    '7. Quando os dados forem insuficientes para concluir algo, diga isso explicitamente.',
    '8. Não use linguagem promocional ou emocional.',
    '9. Nunca recomendar comprar, vender ou manter ativos.',
    '10. Não prever preço ou retorno futuro como fato.',
    '11. Não afirmar causalidade quando existir apenas correlação.',
    '12. Não chamar um movimento de "desacoplamento" sem evidência suficiente.',
    '13. Não chamar um setor de "líder" quando não houver dados suficientes para comparar setores.',
    '14. Divergência só deve ser mencionada como alerta quando houver divergência explicitamente identificada nos dados.',
    '15. "Sem divergências" não significa "sem risco"; significa apenas ausência de divergências detectadas.',
    'CLASSIFICAÇÃO DA CORRELAÇÃO CRYPTO: movimentos semelhantes no período → "segue"; movimentos claramente opostos → "desacoplado"; dados insuficientes para classificar → "inconclusivo". Não inferir correlação estatística formal apenas a partir de uma observação pontual.',
    'ESTRUTURA OBRIGATÓRIA:',
    '🎯 ABERTURA — 1 frase com regime + comportamento do S&P 500 + setor líder, SOMENTE se o setor líder estiver disponível.',
    '📊 MACRO — exatamente 3 bullets: causa ou principal fator do sentimento; eventos relevantes nas próximas 24h; comportamento fora do padrão. Sem dado disponível, escrever "dados insuficientes para avaliar" em vez de inventar.',
    '🎨 CORRELAÇÃO CRYPTO — seguindo, desacoplado ou inconclusivo + implicação operacional para monitoramento de risco; sem recomendação de compra ou venda.',
    '🎯 AÇÃO CONCRETA — no máximo 2 bullets: Priorizar (maior atenção/monitoramento); Evitar (risco, ruído ou falta de confirmação).',
    '⚠️ ALERTAS DE RISCO — com divergência real: descrever objetivamente a divergência e o risco; sem divergência, escrever exatamente "Sem alertas além do monitoramento padrão".',
    'FORMATO FINAL OBRIGATÓRIO: português do Brasil, Markdown, no mínimo 800 palavras e no máximo 8192 palavras. Texto longo, analítico e completo — cada seção deve ser desenvolvida em múltiplos parágrafos/bullets com profundidade, não apenas 1 frase. Responder EXCLUSIVAMENTE com estas 5 seções e nesta ordem (🎯 📊 🎨 🎯 ⚠️), o primeiro caractere de cada seção exatamente a âncora.',
    'NUNCA: omitir uma seção; condensar tudo em uma única linha; entregar menos de 800 palavras; ultrapassar 8192 palavras; inventar valores; substituir N/A por zero; criar notícias, eventos, setores líderes ou divergências; emitir recomendação de compra, venda ou manutenção.',
    'TRATAMENTO DE DADOS INCOMPLETOS: mesmo com múltiplos N/A, gerar as 5 seções com o contexto disponível, desenvolvendo a análise com a profundidade exigida e reduzindo a força da conclusão (ex.: "Dado insuficiente para confirmar a direção do índice."). PRIORIDADE DAS REGRAS: 1. Não inventar dados. 2. Não emitir recomendação financeira. 3. Preservar as 5 seções e o piso de 800 palavras. 4. Diferenciar dado observado de interpretação. 5. Objetividade e precisão. 6. Respeitar o teto de 8192 palavras.',
  ].join('\n');
}

/** Frase de abertura (1 linha) para o card compacto — determinística. */
export function buildBriefHeadline(i: MorningBriefInput): string {
  const lead = i.sectorsTop[0] ? ` liderado por ${i.sectorsTop[0].label}` : '';
  return `🎯 ${i.regime}: S&P ${bSigned(i.spx.chg)}%${lead}, Nasdaq ${bSigned(i.ndx.chg)}%. VIX ${bNum(i.vix.level)} (${bSigned(i.vix.chg)}%).`;
}

/**
 * Template determinístico do brief (fallback sem IA): mesmas 5 seções com
 * os números reais, sem hype. Garante leitura <60s sempre.
 */
export function buildBriefTemplate(i: MorningBriefInput): string {
  const lead = i.sectorsTop[0] ? ` liderado por ${i.sectorsTop[0].label} (${bSigned(i.sectorsTop[0].chg)}%)` : '';
  const elites = i.elites.length
    ? i.elites.slice(0, 3).map((e) => `${e.symbol} (score ${e.score}, R:R ${e.rr ?? 'N/A'})`).join(' e ')
    : null;
  const action = elites
    ? `Priorizar pullbacks em ${elites} no horizonte 1–3 meses (${i.elites.length} setup${i.elites.length > 1 ? 's' : ''} Elite).`
    : 'Sem setups Elite 80+ no 1–3m agora: opere o plano existente, sem forçar entrada.';
  const avoid = i.regime.includes('RISK-ON')
    ? 'Evitar reversões de topo: o regime sustenta tendência, não contra-tendência.'
    : 'Evitar compras agressivas: o regime pede seletividade e confirmação extra.';
  const risk = i.flags.length ? i.flags.join(' ') : 'Sem alertas além do monitoramento padrão.';
  return [
    `🎯 Abertura ${i.regime.toLowerCase()} em ${i.dateBrt}: S&P 500 ${bSigned(i.spx.chg)}% (${bNum(i.spx.price)}${bGap(i.spx.gap)})${lead}. Nasdaq 100 ${bSigned(i.ndx.chg)}% com gap ${bSigned(i.ndx.gap)}%; Dow ${bSigned(i.dji.chg)}%. VIX em ${bNum(i.vix.level)} (${bSigned(i.vix.chg)}%): ${i.vix.chg != null && i.vix.chg < 0 ? 'complacência moderada, sem estresse' : 'atenção a estresse'}.`,
    `📊 O que dirige o sentimento: dólar em ${i.dxy.dir ?? 'direção indefinida'} (${bSigned(i.dxy.chg)}%) ${i.dxy.dir === 'queda' ? 'alivia ativos de risco e sustenta a abertura positiva' : 'pesa sobre ativos de risco'}. ${i.news.slice(0, 2).map((x) => x.title).join('. ') || 'Sem manchete macro nova nas últimas 12h'}. Nada fora da curva nos índices: gaps ${i.spx.gap != null && i.spx.gap >= 0 ? 'positivos' : 'mistos'} e VIX ${i.vix.chg != null && i.vix.chg <= 0 ? 'em queda confirmam' : 'exige cautela com'} o tom da abertura.`,
    `🎨 BTC ${i.btcCorr48.mode === 'desacoplado' ? 'desacoplou' : 'segue equities'}: ${bSigned(i.btcCorr48.btc48)}% em 48h enquanto o S&P avançou ${bSigned(i.btcCorr48.spx48)}% no período — ${i.btcCorr48.mode === 'desacoplado' ? 'fluxo próprio, não correlacionado a equities' : 'beta de risco, acompanha o apetite geral'}. BTC a ${bNum(i.btc.price)} (${bSigned(i.btc.chg24)}% em 24h); ETH a ${bNum(i.eth.price)} (${bSigned(i.eth.chg24)}%). Para hoje, posições em cripto ${i.btcCorr48.mode === 'desacoplado' ? 'não dependem de confirmação de equities' : 'pedem confirmação da abertura US'}; stops técnicos continuam valendo.`,
    `🎯 ${action} ${avoid} Amplitude em ${i.breadth ?? 'N/A'}: ${i.breadth != null && i.breadth >= 50 ? 'fundo amplo sustenta tentativa de tendência' : 'fundo estreito pede tamanho menor'}.`,
    `⚠️ ${risk}`,
  ].join('\n');
}

/**
 * Validador estrutural do brief — análise longa (pedido 2026-09-14: mín 800).
 * Exige: texto não-vazio, ENTRE 800 e 8192 palavras, e as 5 seções
 * ancoradas (2×🎯 ABERTURA+AÇÃO, 📊, 🎨, ⚠️) cada uma abrindo parágrafo
 * próprio em ordem. Barra colapso em 1 linha e resposta curta demais.
 */
export interface BriefValidity {
  ok: boolean;
  reason: string | null;
  words: number;
}

export const BRIEF_MIN_WORDS = 800;
export const BRIEF_MAX_WORDS = 8192;

export function briefOutputValid(text: string | null): BriefValidity {
  if (!text || !text.trim()) return { ok: false, reason: 'texto vazio', words: 0 };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < BRIEF_MIN_WORDS) return { ok: false, reason: `texto curto demais (${words} palavras, mínimo ${BRIEF_MIN_WORDS})`, words };
  if (words > BRIEF_MAX_WORDS) return { ok: false, reason: `texto longo demais (${words} palavras, máximo ${BRIEF_MAX_WORDS})`, words };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // 5 seções: 2×🎯 + 📊 + 🎨 + ⚠️  em ordem — usa startsWith para lidar com surrogates e variação ⚠️
  const anchors = lines
    .filter((l) => l.startsWith('🎯') || l.startsWith('📊') || l.startsWith('🎨') || l.startsWith('⚠️'))
    .map((l) => {
      if (l.startsWith('🎯')) return '🎯' as const;
      if (l.startsWith('📊')) return '📊' as const;
      if (l.startsWith('🎨')) return '🎨' as const;
      return '⚠️' as const;
    });
  const countTarget = anchors.filter((a) => a === '🎯').length;
  if (countTarget < 2) return { ok: false, reason: 'seção 🎯 duplicada ausente (ABERTURA e AÇÃO são obrigatórias)', words };
  const missing = (['📊', '🎨', '⚠️'] as const).filter((a) => !anchors.includes(a));
  if (missing.length) return { ok: false, reason: 'seção(ões) fora de parágrafo próprio ou ausente(s)', words };
  if (anchors.length < 5) return { ok: false, reason: 'menos de 5 seções ancoradas', words };
  // checa ordem 🎯→📊→🎨→🎯→⚠️ (primeiro 🎯, depois 📊, 🎨, segundo 🎯, ⚠️)
  const firstTarget = anchors.indexOf('🎯');
  const chartIdx = anchors.indexOf('📊');
  const artIdx = anchors.indexOf('🎨');
  const lastTarget = anchors.lastIndexOf('🎯');
  const warnIdx = anchors.indexOf('⚠️');
  if (!(firstTarget < chartIdx && chartIdx < artIdx && artIdx < lastTarget && lastTarget < warnIdx)) {
    return { ok: false, reason: 'seções fora de ordem (esperado 🎯→📊→🎨→🎯→⚠️)', words };
  }
  // barra colapso 1-linha: precisa de pelo menos 5 linhas ancoradas distintas
  if (lines.length < 5) return { ok: false, reason: 'colapso em poucas linhas (mínimo 5 parágrafos ancorados)', words };
  return { ok: true, reason: null, words };
}

/**
 * Geração do brief com retry de reparo: se a resposta violar regras
 * (1-linha colapsada, âncora faltando, número sumiu), reenvia corrigindo —
 * 1x. Se falhar de novo, cai pro template (nunca gruda resposta ruim como IA).
 * Reserva do brief: canExplainFlash libera 1 slot garantido pro Flash.
 */
export async function generateBrief(userPrompt: string, template: string): Promise<CascadeOut> {
  const first = await askGemini(userPrompt, 'flash');
  if (first.ok) {
    const v = briefOutputValid(first.text);
    if (v.ok) { await markBriefDone(); return { text: first.text, tier: 'flash', badge: null, error: null, detail: null }; }
    if (!first.cached) {
      const repair = await askGemini(
        `${userPrompt}\n\nREPARO: sua resposta anterior tinha ${v.words} palavras e falhou por: ${v.reason}. Reescreva com AS e SÓ AS 5 seções (🎯📊🎨🎯⚠️) em ordem, cada uma abrindo seu parágrafo, com no mínimo ${BRIEF_MIN_WORDS} palavras (teto ${BRIEF_MAX_WORDS}), usando os números do prompt.`,
        'flash',
      );
      const v2 = repair.ok ? briefOutputValid(repair.text) : { ok: false, reason: 'reparo falhou', words: 0 };
      if (repair.ok && v2.ok) { await markBriefDone(); return { text: repair.text, tier: 'flash', badge: null, error: null, detail: null }; }
      await markBriefDone();
      return { text: template, tier: 'template', badge: BADGE_TEMPLATE, error: null, detail: `1ª: ${v.words} palavras, ${v.reason}; reparo: ${v2.words} palavras, ${v2.reason}` };
    }
    await markBriefDone();
    return { text: template, tier: 'template', badge: BADGE_TEMPLATE, error: null, detail: `cache: ${v.words} palavras, ${v.reason}` };
  }
  await markBriefDone();
  return { text: template, tier: 'template', badge: BADGE_TEMPLATE, error: first.error, detail: first.error };
}

/** Teto da análise completa (saída longa 800 palavras). */
export const ANALYSIS_MAX_TOKENS = 8192;
/** Piso da análise longa: abaixo disso, curta demais — descarta. */
export const ANALYSIS_MIN_WORDS = 800;

export interface AnalysisValidity {
  ok: boolean;
  reason: string | null;
  words: number;
}

/**
 * Validador da Análise Completa: exige cabeçalhos fixos do spec
 * (MARKET REGIME + CONCLUSÃO DO AI ANALYST) e piso de 800 palavras.
 */
export function analysisOutputValid(text: string | null): AnalysisValidity {
  if (!text || !text.trim()) return { ok: false, reason: `texto vazio`, words: 0 };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < ANALYSIS_MIN_WORDS) return { ok: false, reason: `texto curto demais (${words} palavras, mínimo ${ANALYSIS_MIN_WORDS})`, words };
  const missing = [`MARKET REGIME`, `CONCLUSÃO DO AI ANALYST`].filter((a) => !text.includes(a));
  if (missing.length) return { ok: false, reason: `seção(ões) ausente(s): ${missing.join(`, `)}`, words };
  return { ok: true, reason: null, words };
}

export async function generateAnalysis(userPrompt: string, systemText: string): Promise<CascadeOut> {
  const first = await askGemini(userPrompt, `flash`, { system: systemText, maxTokens: ANALYSIS_MAX_TOKENS });
  if (first.ok) {
    const v = analysisOutputValid(first.text);
    if (v.ok) {
      return { text: first.text, tier: `flash`, badge: null, error: null, detail: null };
    }
    return { text: null, tier: `unavailable`, badge: null, error: null, detail: `${v.words} palavras, ${v.reason}` };
  }
  return { text: null, tier: `unavailable`, badge: null, error: first.error, detail: first.error };
}
