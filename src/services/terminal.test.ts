import { describe, it, expect } from 'vitest';
import { pearson, returns, correlationMatrix } from '@/engine/correlation';
import { floorPivots, pivotZone, aggregateClosed } from '@/engine/pivots';
import { acquire, report429, tryAcquire } from '@/services/rateLimit';
import { detectPatterns } from '@/engine/patterns';
import { fromPaprika, fromLore } from '@/services/bubbles';
import { companyLogo, avatarLetters } from '@/lib/logos';
import domains from '@/data/company-domains.json';
import { describeCondition, evaluateCondition, evaluateScan } from '@/engine/scanConditions';
import { cycleReading, zoneOf } from '@/engine/cycle';
import { orderB3Queue, orderUsQueue } from '@/services/scanner';
import { scorePartial } from '@/engine/scoring/partial';
import { shouldTrigger } from '@/services/alertEngine';
import { parseRss, tagCoins } from '@/services/news';

describe('correlação', () => {
  it('pearson de séries idênticas = 1', () => {
    expect(pearson([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6])).toBeCloseTo(1);
  });
  it('pearson de séries opostas = -1', () => {
    expect(pearson([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1])).toBeCloseTo(-1);
  });
  it('retorna null com amostra curta ou constante', () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([5, 5, 5, 5, 5, 5], [1, 2, 3, 4, 5, 6])).toBeNull();
  });
  it('matriz é simétrica com diagonal 1', () => {
    const m = correlationMatrix({ A: [10, 11, 12, 13, 14, 15, 16], B: [20, 21, 22, 23, 24, 25, 26] });
    expect(m.symbols).toEqual(['A', 'B']);
    expect(m.matrix[0][0]).toBe(1);
    expect(m.matrix[0][1]).toBeCloseTo(m.matrix[1][0] ?? 0);
  });
  it('returns calcula variação simples', () => {
    expect(returns([100, 110, 99])).toHaveLength(2);
    expect(returns([100, 110, 99])[0]).toBeCloseTo(0.1);
  });
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
<item><title>Bitcoin ETF inflows hit record</title><link>https://x.test/a</link><pubDate>Mon, 08 Sep 2026 12:00:00 GMT</pubDate><description>Bitcoin and ethereum rally</description></item>
<item><title>Weather report</title><link>https://x.test/b</link><pubDate>bad-date</pubDate><description>rain</description></item>
</channel></rss>`;

describe('news', () => {
  it('parseia itens com data e resumo', () => {
    const items = parseRss(RSS, 'Test');
    expect(items).toHaveLength(2);
    expect(items[0].publishedAt).toBeGreaterThan(0);
    expect(items[1].publishedAt).toBeNull();
  });
  it('extrai imagem de enclosure e media', () => {
    const xml = '<?xml version="1.0"?><rss><channel>' + '<item><title>A</title><link>https://x/a</link><enclosure url="https://img.test/a.jpg" type="image/jpeg"/></item>' + '<item><title>B</title><link>https://x/b</link><media:content url="https://img.test/b.png"/></item>' + '<item><title>C</title><link>https://x/c</link></item>' + '</channel></rss>';
    const items = parseRss(xml, 'Test');
    expect(items[0].image).toBe('https://img.test/a.jpg');
    expect(items[1].image).toBe('https://img.test/b.png');
    expect(items[2].image).toBeNull();
  });
  it('marca moedas por palavra-chave', () => {
    expect(tagCoins('Bitcoin ETF inflows')).toEqual(expect.arrayContaining(['BTC', 'ETF']));
    expect(tagCoins('Weather report')).toEqual([]);
  });
});

describe('pivos', () => {
  it('calcula R/S pela fórmula clássica', () => {
    const p = floorPivots(110, 90, 100);
    expect(p.p).toBe(100);
    expect(p.r1).toBe(110);
    expect(p.s1).toBe(90);
    expect(p.r2).toBe(120);
    expect(p.s2).toBe(80);
    // R3 = H + 2·(P−L); S3 = L − 2·(H−P)
    expect(p.r3).toBe(130);
    expect(p.s3).toBe(70);
  });
  it('confere o caso APT do relatório (H=0.68 L=0.63 C=0.64)', () => {
    const p = floorPivots(0.68, 0.63, 0.64);
    expect(p.p).toBeCloseTo(0.65, 10);
    expect(p.r1).toBeCloseTo(0.67, 10);
    expect(p.s1).toBeCloseTo(0.62, 10);
    expect(p.r2).toBeCloseTo(0.7, 10);
    expect(p.s2).toBeCloseTo(0.6, 10);
    expect(p.r3).toBeCloseTo(0.72, 10);
    expect(p.s3).toBeCloseTo(0.57, 10);
  });
  it('agrega N fechados descartando o candle em formação', () => {
    const daily = [
      { high: 10, low: 9, close: 9.5, time: 1 },
      { high: 11, low: 9, close: 10.5, time: 2 },
      { high: 12, low: 10, close: 11, time: 3 },
    ];
    const s = aggregateClosed(daily, 5);
    expect(s).toMatchObject({ high: 11, low: 9, close: 10.5, sessions: 2 });
    expect(aggregateClosed([], 5)).toBeNull();
  });
  it('zona descreve posição do preço', () => {
    const p = floorPivots(110, 90, 100);
    expect(pivotZone(105, p)).toContain('R1');
    expect(pivotZone(95, p)).toContain('S1');
  });
});

describe('scorePartial', () => {
  const up = Array.from({ length: 200 }, (_, i) => 10 + i * 0.15 + Math.sin(i / 2) * 1.2);
  it('tende a BUY em alta consistente e zera volume', () => {
    const o = scorePartial({ symbol: 'T', closes: up });
    expect(o).not.toBeNull();
    expect(o!.signal).toBe('BUY');
    expect(o!.score).toBeGreaterThan(50);
    expect(o!.breakdown.find((b) => b.label === 'VOLUME')?.earned).toBe(0);
    expect(o!.confidence).toBeLessThanOrEqual(70);
    expect(o!.dataQuality).toBeLessThanOrEqual(50);
    expect(o!.risks.join(' ')).toContain('parcial');
  });
  it('retorna null com amostra curta', () => {
    expect(scorePartial({ symbol: 'T', closes: [1, 2, 3] })).toBeNull();
  });
});

describe('alertEngine', () => {  const base = { id: '1', symbol: 'BTC', kind: 'crypto' as const, condition: 'above' as const, price: 100, active: true, createdAt: '', triggeredAt: null };
  it('dispara acima/abaixo e respeita ativo', () => {
    expect(shouldTrigger(base, 100)).toBe(true);
    expect(shouldTrigger(base, 99)).toBe(false);
    expect(shouldTrigger({ ...base, condition: 'below' }, 100)).toBe(true);
    expect(shouldTrigger({ ...base, active: false }, 200)).toBe(false);
    expect(shouldTrigger(base, null)).toBe(false);
  });
});

describe('rateLimit', () => {
  it('espaça aquisições do mesmo host', async () => {
    const t0 = Date.now();
    await acquire('test-host-rl');
    await acquire('test-host-rl');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(800);
  });
  it('backoff segura o host', async () => {
    report429('test-host-bo', 1200);
    const t0 = Date.now();
    await acquire('test-host-bo');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  });
  it('tryAcquire desiste no prazo em vez de travar o lote', async () => {
    report429('test-host-try', 60000);
    const t0 = Date.now();
    expect(await tryAcquire('test-host-try', 300)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it('tryAcquire concede quando o host está livre', async () => {
    expect(await tryAcquire('test-host-free', 1000)).toBe(true);
  });
});

describe('scanOrder', () => {  it('B3: líquidas (ticker curto) primeiro', () => {
    const q = orderB3Queue([
      { symbol: 'LONGO11', name: 'x' },
      { symbol: 'PETR4', name: 'y' },
    ]);
    expect(q[0].symbol).toBe('PETR4');
    expect(q[0].yahoo).toBe('PETR4.SA');
  });
  it('EUA: megacaps primeiro, cobre tudo', () => {
    const q = orderUsQueue([
      { symbol: 'ZZZZ', name: 'z', exchange: 'NASDAQ' },
      { symbol: 'AAPL', name: 'a', exchange: 'NASDAQ' },
    ]);
    expect(q).toHaveLength(2);
    expect(q[0].symbol).toBe('AAPL');
  });
});

describe('patterns', () => {
  const mk = (closes: number[]) => closes.map((c: number, i: number) => ({ time: i * 86400000, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }));
  it('detecta rompimento de máxima com volume', () => {
    const base = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 2);
    base.push(115);
    const kl = mk(base);
    kl[kl.length - 1].volume = 5000;
    const pats = detectPatterns(kl);
    expect(pats.some((x) => x.pattern.includes('Rompimento'))).toBe(true);
  });
  it('retorna vazio com poucos candles', () => {
    expect(detectPatterns(mk([1, 2, 3]))).toEqual([]);
  });
});

describe('cycle', () => {
  const mk = (closes: number[]) => closes.map((c: number, i: number) => ({ time: i * 86400000, open: c, high: c, low: c, close: c, volume: 1 }));
  it('100 na máxima, 0 na mínima', () => {
    const up = mk(Array.from({ length: 30 }, (_, i) => 10 + i));
    expect(cycleReading(up, '30d')?.pct).toBe(100);
    expect(cycleReading(up, '30d')?.zone).toBe('topo-risco');
    const down = mk(Array.from({ length: 30 }, (_, i) => 40 - i));
    expect(cycleReading(down, '30d')?.pct).toBe(0);
    expect(cycleReading(down, '30d')?.zone).toBe('acumulacao');
  });
  it('zoneOf nos limites', () => {
    expect(zoneOf(90)).toBe('topo-risco');
    expect(zoneOf(70)).toBe('euforia');
    expect(zoneOf(20)).toBe('acumulacao');
    expect(zoneOf(50)).toBe('neutra');
  });
});

describe('scanConditions', () => {
  const mk = (closes: number[]) => closes.map((c: number, i: number) => ({ time: i * 86400000, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }));
  const falling = mk(Array.from({ length: 80 }, (_, i) => 100 - i * 0.5));
  it('RSI abaixo de 30 em queda livre', () => {
    expect(evaluateCondition(falling, null, { id: '1', indicator: 'RSI', timeframe: '4h', op: 'below', v1: 30 })).toBe(true);
  });
  it('RSI entre 25 e 30', () => {
    const v = [100];
    for (let i = 1; i < 80; i++) v.push(v[i - 1] + (i % 7 === 0 ? 1 : -0.5));
    const kl = v.map((c, i) => ({ time: i * 86400000, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }));
    expect(evaluateCondition(kl, null, { id: '1', indicator: 'RSI', timeframe: '4h', op: 'between', v1: 30, v2: 25 })).toBe(true);
  });
  it('market cap maior ou igual', () => {
    expect(evaluateCondition([], 250000000, { id: '1', indicator: 'MARKETCAP', timeframe: '1d', op: 'above', v1: 200000000 })).toBe(true);
    expect(evaluateCondition([], 100, { id: '1', indicator: 'MARKETCAP', timeframe: '1d', op: 'above', v1: 200000000 })).toBe(false);
  });
  it('scan exige todas as condições (E)', () => {
    const scan: import('@/engine/scanConditions').CustomScan = { id: 's', name: 't', icon: '', color: '', description: '', conditions: [
      { id: '1', indicator: 'RSI', timeframe: '4h', op: 'below', v1: 30 },
      { id: '2', indicator: 'MARKETCAP', timeframe: '1d', op: 'above', v1: 200000000 },
    ], createdAt: '' };
    expect(evaluateScan(() => falling, 250000000, scan)).toBe(true);
    expect(evaluateScan(() => falling, 100, scan)).toBe(false);
  });
  it('descreve condição em pt-BR', () => {
    expect(describeCondition({ id: '1', indicator: 'RSI', timeframe: '4h', op: 'between', v1: 30, v2: 25 })).toContain('RSI 4h');
  });
});

describe('bubbles', () => {
  it('mapeia CoinPaprika com todos os timeframes', () => {
    const b = fromPaprika({ id: 'btc-bitcoin', symbol: 'btc', name: 'Bitcoin', quotes: { USD: { price: 50000, market_cap: 1e12, volume_24h: 1e10, percent_change_1h: 0.1, percent_change_24h: 1, percent_change_7d: 5, percent_change_30d: 10, percent_change_1y: 100 } } });
    expect(b).toMatchObject({ symbol: 'BTC', source: 'paprika', c30d: 10, c1y: 100 });
    expect(b.image).toContain('btc@2x.png');
  });
  it('mapeia CoinLore sem 30d/1a e tolera strings', () => {
    const b = fromLore({ id: '90', symbol: 'btc', name: 'Bitcoin', price_usd: '50000', market_cap_usd: '1e12', volume24: 1e10, percent_change_1h: '0.1', percent_change_24h: '1', percent_change_7d: '5' });
    expect(b).toMatchObject({ symbol: 'BTC', source: 'coinlore', c30d: null, c1y: null });
  });
});

describe('logos', () => {
  it('mapa sem duplicatas e domínios válidos', () => {
    const vals = Object.values(domains as Record<string, string>);
    expect(vals.length).toBeGreaterThan(100);
    for (const d of vals) expect(d).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
  });
  it('companyLogo resolve com e sem sufixo', () => {
    expect(companyLogo('PETR4')).toContain('petrobras.com.br');
    expect(companyLogo('petr4.sa')).toContain('petrobras.com.br');
    expect(companyLogo('AAPL')).toContain('apple.com');
    expect(companyLogo('MOEDAQUALQUER123')).toBeNull();
  });
  it('avatarLetters usa 2 letras', () => {
    expect(avatarLetters('PETR4')).toBe('PE');
    expect(avatarLetters('^BVSP')).toBe('BV');
  });
});
