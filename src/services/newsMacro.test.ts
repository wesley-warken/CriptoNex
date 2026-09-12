import { describe, expect, it } from 'vitest';
import { withinHours, macroByKeywords, type NewsItem } from './news';

const mk = (title: string, publishedAt: number | null, summary = ''): NewsItem => ({
  id: title, title, link: '', source: 'T', publishedAt, summary, coins: [], image: null,
});

describe('macro 12h: filtro temporal + keywords', () => {
  const now = Date.parse('2026-09-12T10:30:00-03:00');
  it('withinHours corta velhas e futuras, mantém recentes', () => {
    const items = [
      mk('a', now - 2 * 3600_000),
      mk('b', now - 13 * 3600_000),
      mk('c', null),
      mk('d', now + 3600_000),
    ];
    expect(withinHours(items, 12, now).map((i) => i.title)).toEqual(['a']);
  });
  it('macroByKeywords pega CPI/FOMC/earnings e ignora resto', () => {
    const items = [
      mk('CPI de amanhã deve vir em linha', now),
      mk('FOMC mantém juros', now),
      mk('Bitcoin sobe com ETF', now),
    ];
    expect(macroByKeywords(items).map((i) => i.title)).toEqual(['CPI de amanhã deve vir em linha', 'FOMC mantém juros']);
  });
});
