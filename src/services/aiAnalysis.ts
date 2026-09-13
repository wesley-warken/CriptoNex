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

async function callModel(key: string, modelId: string, userPrompt: string): Promise<FetchStatus> {
  let r: Response;
  // Thinking consome o teto de maxOutputTokens junto com a resposta: com o
  // teto de 1024, o modelo pensava ~980 tokens e entregava ~40 de texto
  // (finish=MAX_TOKENS cortado no meio). Tarefas aqui são extrativas (todos
  // os dados vão no prompt), então thinking desligado. Modelos lite rejeitam
  // o campo com 400 — por isso ele só vai nos modelos sem "lite" no nome.
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 1024 };
  if (!modelId.includes('lite')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: AI_SYSTEM }] },
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

/**
 * Núcleo por tier: cota própria, cache próprio (tier+modelo no hash).
 * Fallback de CONFIGURAÇÃO (não de tarefa): se o modelo Lite responder 404
 * (nome inválido), tenta 1x o modelo principal MAS cobra da cota Lite —
 * a cota nobre nunca é tocada por tarefa auxiliar.
 */
async function askTier(userPrompt: string, tier: AiTier): Promise<AIResult> {
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
  let res = await callModel(key, modelId, userPrompt);
  if (res.status === 'notfound' && tier === 'lite') {
    res = await callModel(key, modelFor('flash'), userPrompt);
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
export async function askGemini(userPrompt: string, tier: AiTier = 'flash'): Promise<AIResult> {
  return askTier(userPrompt, tier);
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
    if (r.ok) return { text: r.text, tier: 'flash', badge: null, error: null };
    if (r.error === 'NO_KEY') return { text: null, tier: 'unavailable', badge: null, error: 'NO_KEY' };
  }
  const lite = await askTier(userPrompt, 'lite');
  if (lite.ok) return { text: lite.text, tier: 'lite', badge: BADGE_LITE, error: null };
  if (lite.error === 'NO_KEY') return { text: null, tier: 'unavailable', badge: null, error: 'NO_KEY' };
  return { text: null, tier: 'unavailable', badge: null, error: lite.error };
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

const bNum = (v: number | null, d = 1): string =>
  v == null || !Number.isFinite(v) ? 'N/A' : (Number.isInteger(v) ? String(v) : v.toFixed(d));
const bSigned = (v: number | null, d = 1): string =>
  v == null || !Number.isFinite(v) ? 'N/A' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
const bGap = (g: number | null): string => (g == null ? '' : `, gap ${bSigned(g)}%`);

/**
 * Prompt do brief: carrega SOMENTE os números fornecidos e impõe formato,
 * tamanho (150–250 palavras), tom (dados, sem hype, sem recomendação).
 */
export function buildMorningBriefPrompt(i: MorningBriefInput): string {
  const sectors = [
    ...i.sectorsTop.map((s) => `${s.label} ${bSigned(s.chg)}%`),
    ...i.sectorsBottom.map((s) => `${s.label} ${bSigned(s.chg)}%`),
  ].join(' · ') || 'N/A';
  const news = i.news.map((x) => `“${x.title}” (${x.source})`).join(' | ') || 'N/A';
  const elites = i.elites.map((e) => `${e.symbol} score ${e.score} R:R ${e.rr ?? 'N/A'}`).join(' · ') || 'nenhum Elite 80+';
  return [
    `ABERTURA US ${i.dateBrt} — S&P 500 ${bNum(i.spx.price)} (${bSigned(i.spx.chg)}%${bGap(i.spx.gap)}) · Nasdaq 100 ${bNum(i.ndx.price)} (${bSigned(i.ndx.chg)}%${bGap(i.ndx.gap)}) · Dow ${bNum(i.dji.price)} (${bSigned(i.dji.chg)}%${bGap(i.dji.gap)}).`,
    `VOL: VIX ${bNum(i.vix.level)} (${bSigned(i.vix.chg)}%) · DXY em ${i.dxy.dir ?? 'N/A'} (${bSigned(i.dxy.chg)}%).`,
    `CRIPTO: BTC ${bNum(i.btc.price)} (${bSigned(i.btc.chg24)}% 24h) · ETH ${bNum(i.eth.price)} (${bSigned(i.eth.chg24)}% 24h) · 48h: S&P ${bSigned(i.btcCorr48.spx48)}% vs BTC ${bSigned(i.btcCorr48.btc48)}% → ${i.btcCorr48.mode ?? 'N/A'}.`,
    `REGIME: ${i.regime} · amplitude ${i.breadth ?? 'N/A'}. SETORES: ${sectors}. NOTÍCIAS 12h: ${news}. ELITES 1–3m: ${elites}. DIVERGÊNCIAS: ${i.flags.join(' | ') || 'nenhuma'}.`,
    'Escreva o Morning Brief em português do Brasil, 150 a 250 palavras, Markdown com as seções nesta ordem: 🎯 frase de abertura (1 linha: regime + S&P% + setor líder), 📊 macro em 3 bullets (causa do sentimento, eventos 24h, fora-do-padrão), 🎨 correlação crypto (segue ou desacoplado + implicação), 🎯 ação concreta (máx 2 bullets: priorizar e evitar), ⚠️ alertas de risco (SÓ se houver divergência; sem divergência escreva "Sem alertas além do monitoramento padrão").',
  'Tom direto e técnico, sem hype: nunca usar incrível, espetacular, extraordinário, imperdível, disparada, garantido. Use dados, não opiniões. Nunca recomendar comprar, vender ou manter.',
    'Responda com AS e SÓ AS 5 seções abaixo, uma por parágrafo (cada bloco inicia com a âncora exata):',
    '🎯 <frase de abertura 1 linha>',
    '📊 <macro 3 bullets: causa | eventos 24h | alerta>',
    '🎨 <correlação 48h + implicação>',
    '🎯 <priorizar> <evitar>',
    '⚠️ <alerta ou Sem alertas além do monitoramento padrão>',
    'NUNCA resuma tudo em 1 linha; NUNCA omita uma seção.',
  ].join('\n');
}

/** Frase de abertura (1 linha) para o card compacto — determinística. */
export function buildBriefHeadline(i: MorningBriefInput): string {
  const lead = i.sectorsTop[0] ? ` liderado por ${i.sectorsTop[0].label}` : '';
  return `🎯 ${i.regime}: S&P ${bSigned(i.spx.chg)}%${lead}, Nasdaq ${bSigned(i.ndx.chg)}%. VIX ${bNum(i.vix.level)} (${bSigned(i.vix.chg)}%).`;
}

/**
 * Template determinístico do brief (fallback sem IA): mesmas 5 seções com
 * os números reais, 150–250 palavras, sem hype. Garante leitura <60s sempre.
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
 * Validador determinístico do brief: pega a 1-linha da imagem e similares.
 * Aprova só texto que traz as 5 âncoras + 3 números-chave reais do input
 * + 100–300 palavras. Garante resposta ruim → template, não badge vazio.
 */
export interface BriefValidity {
  ok: boolean;
  reason: string | null;
  words: number;
}

const requiredNumbers = (i: MorningBriefInput): string[] => [
  bSigned(i.spx.chg),
  bNum(i.vix.level),
  bNum(i.btc.price),
];

/**
 * Normaliza números para comparar a saída da IA (pt-BR: "115.420",
 * "+0,4%", "14,2") com os valores crus do input ("115420", "+0.4", "14.2").
 * Sem isso, resposta válida era descartada e o usuário via o template
 * idêntico — "cota caiu e nada apareceu".
 */
const normNum = (s: string): string => {
  const t = s.replace(/[^0-9.,+-]/g, '');
  return t
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1') // ponto de milhar: "115.420"→"115420"; "14.2" intacto
    .replace(/(\d),(\d)/g, '$1.$2'); // vírgula decimal: "+0,4"→"+0.4"; vírgula de lista ("5, gap") intacta
};

export function briefOutputValid(text: string | null, i: MorningBriefInput): BriefValidity {
  if (!text || !text.trim()) return { ok: false, reason: 'texto vazio', words: 0 };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 100) return { ok: false, reason: 'texto curto demais (colapso em 1 linha?)', words };
  if (words > 300) return { ok: false, reason: 'texto muito longo', words };
  const missing = ['🎯', '📊', '🎨', '⚠️'].filter((a) => !text.includes(a));
  if (missing.length) return { ok: false, reason: `${missing.length} âncora(s) de seção ausente`, words };
  const nt = normNum(text);
  const nums = requiredNumbers(i).filter((n) => n && n !== 'N/A' && n !== 'null' && !nt.includes(normNum(n)));
  if (nums.length) return { ok: false, reason: `número-chave ausente (${nums.join(', ')})`, words };
  for (const h of BANNED_HYPE) if (text.toLowerCase().includes(h)) return { ok: false, reason: `hype proibido: ${h}`, words };
  return { ok: true, reason: null, words };
}

/**
 * Geração do brief com retry de reparo: se a resposta violar regras
 * (1-linha colapsada, âncora faltando, número sumiu), reenvia corrigindo —
 * 1x. Se falhar de novo, cai pro template (nunca gruda resposta ruim como IA).
 * Reserva do brief: canExplainFlash libera 1 slot garantido pro Flash.
 */
export async function generateBrief(userPrompt: string, template: string, input: MorningBriefInput): Promise<CascadeOut> {
  const first = await askGemini(userPrompt, 'flash');
  if (first.ok) {
    const v = briefOutputValid(first.text, input);
    if (v.ok) { await markBriefDone(); return { text: first.text, tier: 'flash', badge: null, error: null }; }
    if (!first.cached) {
      const repair = await askGemini(
        `${userPrompt}\n\nREPARO: sua resposta anterior tinha ${v.words} palavras e falhou por: ${v.reason}. Reescreva com AS e SÓ AS 5 seções (🎯📊🎨⚠️), uma por parágrafo, usando os números do prompt.`,
        'flash',
      );
      const v2 = repair.ok ? briefOutputValid(repair.text, input) : { ok: false, reason: 'reparo falhou', words: 0 };
      if (repair.ok && v2.ok) { await markBriefDone(); return { text: repair.text, tier: 'flash', badge: null, error: null }; }
    }
  }
  await markBriefDone();
  return { text: template, tier: 'template', badge: BADGE_TEMPLATE, error: first.ok ? null : first.error };
}
