import { describe, expect, it } from 'vitest';
import {
  quotaDay, canSpend, hashPrompt, buildSetupPrompt, buildContextPrompt, AI_SYSTEM, AI_DAILY_CAP,
  AI_LITE_DAILY_CAP, canExplainFlash, buildMorningBriefPrompt, buildBriefTemplate, buildBriefHeadline,
  briefOutputValid, BANNED_HYPE, type MorningBriefInput,
} from './aiAnalysis';

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
    expect(p).toMatch(/150.*250|250.*150/);
    expect(p.toLowerCase()).not.toMatch(/compre|recomendo/);
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

describe('validador anti-1-linha aceita pt-BR', () => {
  const iaPtBr = [
    '🎯 Abertura em tom positivo com o S&P 500 em alta de +0,8% aos 6.487 pontos, liderado por Tech com +1,5%. O Nasdaq 100 avança +1,2% com gap de +0,5%, enquanto o VIX recua para 14,2 pontos, indicando apetite por risco na manhã.',
    '📊 O dólar em queda de 0,2% alivia ativos de risco e sustenta o movimento. Entre os eventos das últimas 24h, o CPI de amanhã deve vir em linha e as big techs divulgam balanços na semana. Nada fora do padrão nos gaps dos índices, todos positivos na abertura de hoje.',
    '🎨 O BTC desacoplou das ações e opera aos 115.420 dólares com +2,1% em 24h, enquanto o S&P subiu +0,2% em 48h contra +2,0% do BTC no período. O ETH acompanha aos 4.521 dólares com +1,4%. Para hoje, posições em cripto não dependem de confirmação das ações.',
    '🎯 Priorizar pullbacks em NVDA com score 84 e R:R 2,6 e META com score 81 no horizonte de 1 a 3 meses. Evitar reversões de topo, pois o regime sustenta tendência e não movimentos contrários ao fluxo dominante do mercado acionário.',
    '⚠️ Sem alertas além do monitoramento padrão para a sessão de hoje, com amplitude em 68 indicando fundo amplo e saudável para a continuidade do movimento de alta observado.',
  ].join('\n');
  it('aprova resposta válida com números formatados em pt-BR', () => {
    const v = briefOutputValid(iaPtBr, briefInput);
    expect(v.ok).toBe(true);
    expect(v.reason).toBeNull();
  });
  it('aprova o próprio template determinístico', () => {
    expect(briefOutputValid(buildBriefTemplate(briefInput), briefInput).ok).toBe(true);
  });
  it('reprova colapso em 1 linha', () => {
    const v = briefOutputValid('🎯 Alta com S&P +0,8% e VIX 14,2.', briefInput);
    expect(v.ok).toBe(false);
  });
  it('reprova âncora ausente', () => {
    const semAnchor = iaPtBr.replace('🎨', 'Sobre cripto:');
    expect(briefOutputValid(semAnchor, briefInput).ok).toBe(false);
  });
});
