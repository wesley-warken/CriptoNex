import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  quotaDay, canSpend, hashPrompt, buildSetupPrompt, buildContextPrompt, AI_SYSTEM, AI_DAILY_CAP,
  AI_LITE_DAILY_CAP, canExplainFlash, buildMorningBriefPrompt, buildBriefTemplate, buildBriefHeadline,
  briefOutputValid, generateBrief, BANNED_HYPE, BRIEF_MIN_WORDS, BRIEF_MAX_WORDS,
  analysisOutputValid, generateAnalysis, ANALYSIS_MIN_WORDS, ANALYSIS_MAX_TOKENS, type MorningBriefInput,
} from './aiAnalysis';
import { ANALYST_SYSTEM, buildAnalystPrompt } from './analystPrompt';

describe('cota dura do plano gratuito', () => {
  it('quotaDay em YYYY-MM-DD e canSpend com virada de dia', () => {
    expect(quotaDay(new Date(2026, 8, 12, 10).getTime())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(canSpend(null, '2026-09-12')).toBe(true);
    expect(canSpend({ day: '2026-09-12', count: AI_DAILY_CAP - 1 }, '2026-09-12')).toBe(true);
    expect(canSpend({ day: '2026-09-12', count: AI_DAILY_CAP }, '2026-09-12')).toBe(false);
    expect(canSpend({ day: '2026-09-11', count: AI_DAILY_CAP }, '2026-09-12')).toBe(true);
  });
  it('hash estável e distinto', () => {
    expect(hashPrompt('abc')).toBe(hashPrompt('abc'));
    expect(hashPrompt('abc')).not.toBe(hashPrompt('abd'));
  });
});

describe('prompts só com dados reais + linguagem honesta', () => {
  const setup = {
    symbol: 'SOL', setupLabel: 'Pullback em tendência', horizonLabel: '3–4 meses',
    score: 82, confidence: 71, tier: 'FORTE',
    entryLow: 185, entryHigh: 192, entryIdeal: 190, stop: 168,
    t1: 215, t2: 242, t3: 270, rr1: 2.4, rr2: 3.1, rr3: 4,
    basePct: 21, why: ['Tendência semanal Alta'], risks: ['Volatilidade elevada'],
    regime: 'RISK-ON', evN: 184, evHit: 0.63,
  };
  it('setup carrega números reais e proíbe recomendação', () => {
    const p = buildSetupPrompt(setup);
    for (const n of ['SOL', '185', '168', '215', '2.4', '184', '63']) expect(p).toContain(n);
    expect(p.toLowerCase()).not.toMatch(/compre|recomendo comprar/);
  });
  it('system proíbe probabilidade e recomendação', () => {
    expect(AI_SYSTEM).toMatch(/Nunca recomende/i);
    expect(AI_SYSTEM).toMatch(/probabilidade/i);
  });
  it('contexto carrega valores e pede briefing neutro', () => {
    const p = buildContextPrompt({ btc7d: -3.2, btc30d: 21.7, breadth: 74, regime: 'STRONG RISK-ON', br30d: 5.7, us30d: 2.9 });
    expect(p).toContain('-3.2');
    expect(p).toContain('74');
  });
});

const briefInput: MorningBriefInput = {
  dateBrt: '12/09/2026',
  spx: { label: 'S&P 500', price: 6487.5, chg: 0.8, gap: 0.3 },
  ndx: { label: 'Nasdaq 100', price: 23410.2, chg: 1.2, gap: 0.5 },
  dji: { label: 'Dow Jones', price: 45512.9, chg: 0.4, gap: 0.1 },
  vix: { level: 14.2, chg: -3.1 },
  dxy: { dir: 'queda', chg: -0.2 },
  btc: { price: 115420, chg24: 2.1 },
  eth: { price: 4521, chg24: 1.4 },
  btcCorr48: { spx48: 0.2, btc48: 2.0, mode: 'desacoplado' },
  regime: 'RISK-ON', breadth: 68,
  sectorsTop: [{ label: 'Tech (XLK)', chg: 1.5 }, { label: 'Comunicação (XLC)', chg: 1.1 }],
  sectorsBottom: [{ label: 'Energia (XLE)', chg: -0.6 }],
  news: [
    { title: 'CPI de amanhã deve vir em linha', source: 'Yahoo Finance' },
    { title: 'Big Tech divulga balanços na semana', source: 'Yahoo Finance' },
  ],
  elites: [{ symbol: 'NVDA', score: 84, rr: 2.6 }, { symbol: 'META', score: 81, rr: 2.2 }],
  flags: [],
};

describe('reserva de cota do principal (brief primeiro)', () => {
  it('explain usa Flash quando cabe + reserva do brief pendente', () => {
    expect(canExplainFlash(18, false)).toBe(true); // 18+1+1 <= 20
    expect(canExplainFlash(19, false)).toBe(false); // 19+1+1 > 20: slot do brief
    expect(canExplainFlash(19, true)).toBe(true); // brief rodou: libera geral
    expect(canExplainFlash(20, true)).toBe(false);
    expect(canExplainFlash(0, false)).toBe(true);
  });
  it('teto do lite é separado e maior', () => {
    expect(AI_LITE_DAILY_CAP).toBeGreaterThan(AI_DAILY_CAP);
  });
});

describe('morning brief: prompt e template determinístico', () => {
  it('prompt carrega todos os números e proíbe recomendação', () => {
    const p = buildMorningBriefPrompt(briefInput);
    for (const n of ['6487.5', '1.2', '14.2', '115420', 'RISK-ON', '68', 'NVDA', '84', '2.6']) expect(p).toContain(n);
    expect(p).toMatch(/800 palavras/);
    expect(p).toMatch(/8192/);
    expect(p.toLowerCase()).not.toMatch(/compre|recomendo/);
  });
  it('prompt impõe piso 800, teto 8192 e N/A honesto', () => {
    const p = buildMorningBriefPrompt(briefInput);
    expect(p).toMatch(/no mínimo 800 palavras/i);
    expect(p).toMatch(/no máximo 8192/i);
    expect(p).toMatch(/N\/A NÃO significa zero/);
    expect(p).toMatch(/inconclusivo/);
  });
  it('template tem 5 âncoras, 150–250 palavras e números reais', () => {
    const t = buildBriefTemplate(briefInput);
    for (const a of ['🎯', '📊', '🎨', '⚠️']) expect(t).toContain(a);
    const words = t.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(150);
    expect(words).toBeLessThanOrEqual(250);
    for (const n of ['6487.5', '14.2', '115420', 'NVDA']) expect(t).toContain(n);
  });
  it('template sem hype vazio', () => {
    const t = buildBriefTemplate({ ...briefInput, flags: ['VIX em alta junto com o S&P: cautela com tamanho.'] });
    for (const h of BANNED_HYPE) expect(t.toLowerCase()).not.toContain(h);
    expect(t).toContain('⚠️');
  });
  it('headline em 1 linha com o essencial', () => {
    const h = buildBriefHeadline(briefInput);
    expect(h).not.toContain('\n');
    expect(h).toContain('RISK-ON');
    expect(h).toContain('0.8');
  });
});

describe('validador estrutural: piso 800, teto 8192, 5 âncoras em ordem', () => {
  // base curta (sem piso) — usada para compor a versão longa 800+
  const basePtBr = [
    '🎯 Abertura em tom positivo com o S&P 500 em alta de +0,8% aos 6.487 pontos, liderado por Tech com +1,5%. Nasdaq avança +1,2% e o VIX recua para 14,2 pontos.',
    '📊 O dólar em queda de 0,2% alivia ativos de risco. O CPI de amanhã deve vir em linha e as big techs divulgam balanços na semana. Gaps positivos e VIX em queda confirmam o tom da abertura.',
    '🎨 O BTC desacoplou e opera aos 115.420 dólares com +2,1% em 24h, enquanto o S&P subiu +0,2% em 48h contra +2,0% do BTC. O ETH segue aos 4.521 dólares com +1,4%.',
    '🎯 Priorizar pullbacks em NVDA com score 84 e META com score 81 no horizonte de 1 a 3 meses. Evitar reversões de topo, pois o regime sustenta tendência.',
    '⚠️ Sem alertas além do monitoramento padrão, com amplitude em 68 indicando fundo amplo e saudável.',
  ].join('\n');
  // expande cada seção com parágrafos analíticos até bater 800+ palavras (determinístico)
  const filler = 'Análise técnica detalhada com contexto macro, leitura de fluxo, níveis de suporte e resistência, validação de volume e amplitude, correlação intermercados e gestão de risco. ';
  const elongate = (s: string) => `${s}\n${filler.repeat(160)}`; // ~ 160*22 ≈ 3520 palavras; garante >800
  const iaPtBr = elongate(basePtBr);
  it('aprova resposta válida longa com números formatados em pt-BR', () => {
    const v = briefOutputValid(iaPtBr);
    expect(v.ok).toBe(true);
    expect(v.reason).toBeNull();
    expect(v.words).toBeGreaterThanOrEqual(BRIEF_MIN_WORDS);
    expect(v.words).toBeLessThanOrEqual(BRIEF_MAX_WORDS);
  });
  it('rejeita colapso em 1 linha mesmo com as âncoras', () => {
    const umaLinha = '🎯 Abertura em alta 📊 Macro estável 🎨 Crypto segue 🎯 Priorizar tudo ⚠️ Sem alertas hoje e amanhã com bom humor ' + filler.repeat(80);
    expect(briefOutputValid(umaLinha).ok).toBe(false);
  });
  it('rejeita texto curto demais (<800)', () => {
    const curto = basePtBr; // ~130 palavras
    const v = briefOutputValid(curto);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/mínimo.*800/);
  });
  it('rejeita texto acima de 8192 palavras', () => {
    const longo = `${iaPtBr}\n${iaPtBr}\n${iaPtBr}`; // > 8192
    const v = briefOutputValid(longo);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/8192/);
  });
  it('reprova colapso em 1 linha', () => {
    const v = briefOutputValid('🎯 Alta com S&P +0,8% e VIX 14,2. ' + filler.repeat(80));
    expect(v.ok).toBe(false);
  });
  it('reprova âncora ausente', () => {
    const semAnchor = iaPtBr.replace('🎨', 'Sobre cripto:');
    expect(briefOutputValid(semAnchor).ok).toBe(false);
  });
  it('reprova ordem trocada e falta do segundo 🎯', () => {
    const ordemErrada = [
      '🎯 Abertura longa ' + filler.repeat(40),
      '⚠️ Alerta invertido ' + filler.repeat(40),
      '📊 Macro fora de ordem ' + filler.repeat(40),
      '🎨 Crypto fora de ordem ' + filler.repeat(40),
      '🎯 Ação fora de ordem ' + filler.repeat(40),
    ].join('\n');
    expect(briefOutputValid(ordemErrada).ok).toBe(false);
    const soUmTarget = basePtBr.replace('🎯 Priorizar', 'Priorizar') + '\n' + filler.repeat(160);
    expect(briefOutputValid(soUmTarget).ok).toBe(false);
  });
  it('fallback sem chave expõe o motivo no detail', async () => {
    // Chave camuflada: NO_KEY determinístico, sem rede.
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    try {
      const r = await generateBrief('prompt', 'TEMPLATE');
      expect(r.tier).toBe('template');
      expect(r.text).toBe('TEMPLATE');
      expect(r.error).toBe('NO_KEY');
      expect(r.detail).toBe('NO_KEY');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('Análise Completa: piso 800, validador e prompt', () => {
  const filler = (n: number): string[] => Array.from({ length: n }, (_, i) => `palavra${i}`);
  const good = [`MARKET REGIME`, ...filler(850), `CONCLUSÃO DO AI ANALYST`].join(` `);
  it('aprova análise longa com os dois cabeçalhos e 800+', () => {
    const v = analysisOutputValid(good);
    expect(v.ok).toBe(true);
    expect(v.words).toBeGreaterThanOrEqual(800);
  });
  it('rejeita curta (<800) e sem cabeçalhos', () => {
    expect(analysisOutputValid(`resumo curto`).ok).toBe(false);
    expect(analysisOutputValid(`${`MARKET REGIME`} só isso`).ok).toBe(false);
    const noEnd = [...filler(850), `MARKET REGIME`].join(` `);
    expect(analysisOutputValid(noEnd).ok).toBe(false);
    const short = [`MARKET REGIME`, ...filler(200), `CONCLUSÃO DO AI ANALYST`].join(` `);
    expect(analysisOutputValid(short).ok).toBe(false);
  });
  it('piso e teto publicados nas constantes (800 / 8192)', () => {
    expect(ANALYSIS_MIN_WORDS).toBe(800);
    expect(ANALYSIS_MAX_TOKENS).toBe(8192);
    expect(BRIEF_MIN_WORDS).toBe(800);
  });
  it('prompt do analista carrega dados e impõe 800', () => {
    const p = buildAnalystPrompt(briefInput);
    for (const n of ['6487.5', '115420', 'RISK-ON']) expect(p).toContain(n);
    expect(p).toMatch(/800 palavras/);
  });
  it('analyst system tem identidade e não inventa', () => {
    expect(ANALYST_SYSTEM).toMatch(/FONTE DA VERDADE/);
    expect(ANALYST_SYSTEM).toMatch(/MARKET REGIME/);
  });
  it('sem chave: indisponível com motivo, sem throw', async () => {
    vi.stubEnv(`VITE_GEMINI_API_KEY`, ``);
    try {
      const r = await generateAnalysis(`prompt`, ANALYST_SYSTEM);
      expect(r.tier).toBe(`unavailable`);
      expect(r.error).toBe(`NO_KEY`);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
