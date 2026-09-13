import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BADGE_TEMPLATE, buildBriefHeadline, buildBriefTemplate, buildMorningBriefPrompt,
  generateBrief, aiRemaining,
} from '@/services/aiAnalysis';
import {
  briefSeenToday, composeBriefInput, fetchUsQuotes, inBriefWindow,
  markBriefSeen, pct48h, readElites, todayBrt, type UsQuotes,
} from '@/services/morningBrief';
import { fetchMacroNews } from '@/services/news';
import { yahooChart } from '@/services/lookup';
import type { MarketData } from '@/types';

export interface MorningBriefState {
  headline: string | null;
  loading: boolean;
  loadError: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  isWindow: boolean;
  isNew: boolean;
  briefText: string | null;
  briefTier: 'flash' | 'template';
  briefBadge: string | null;
  briefBusy: boolean;
  briefError: string | null;
  generateAi: () => void;
  quotaNote: string;
}

/**
 * useMorningBrief — compõe o brief da abertura US a partir de market/analysis
 * já assinados pela página (sem polling duplo). Template determinístico sai
 * na hora; IA (Flash, com reserva) só sob clique.
 */
export function useMorningBrief(
  data: MarketData[],
  regimeLabel: string,
  regimeBreadth: number,
  btcHistory: number[],
): MorningBriefState {
  const [quotes, setQuotes] = useState<UsQuotes | null>(null);
  const [news, setNews] = useState<{ title: string; source: string }[]>([]);
  const [elites, setElites] = useState<{ symbol: string; score: number; rr: number | null }[]>([]);
  const [spx48, setSpx48] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);
  const [seen, setSeen] = useState(true);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefTier, setBriefTier] = useState<'flash' | 'template'>('template');
  const [briefBadge, setBriefBadge] = useState<string | null>(BADGE_TEMPLATE);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [quotaNote, setQuotaNote] = useState('—/20');

  const briefDay = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch {
      return '';
    }
  }, []);
  const isWindow = useMemo(() => inBriefWindow(), []);

  const btc = useMemo(() => data.find((d) => d.symbol === 'BTC') ?? null, [data]);
  const eth = useMemo(() => data.find((d) => d.symbol === 'ETH') ?? null, [data]);
  const symbols = useMemo(
    () => [...data].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 40).map((d) => d.symbol),
    [data],
  );

  useEffect(() => {
    let alive = true;
    void briefSeenToday(briefDay).then((s) => { if (alive) setSeen(s); }).catch(() => undefined);
    void aiRemaining().then((r) => { if (alive) setQuotaNote(`${r}/20`); }).catch(() => undefined);
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [q, mn, spx] = await Promise.all([
          fetchUsQuotes(),
          fetchMacroNews(3, 12).catch(() => ({ items: [], errors: ['feed macro'], fallback: true })),
          yahooChart('^GSPC', '5d', '1d').catch(() => null),
        ]);
        if (!alive) return;
        setQuotes(q);
        setNews(mn.items.map((n) => ({ title: n.title, source: n.source })));
        setSpx48(spx ? pct48h(spx.candles.map((c) => c.close)) : null);
        const el = await readElites(symbols, regimeLabel, btc?.change7d ?? null, 3).catch(() => []);
        if (!alive) return;
        setElites(el);
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : 'Falha ao carregar abertura US');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefDay]);

  const input = useMemo(() => {
    if (!quotes) return null;
    return composeBriefInput({
      dateBrt: todayBrt(),
      quotes,
      btc: { price: btc?.price ?? null, chg24: btc?.change24h ?? null },
      eth: { price: eth?.price ?? null, chg24: eth?.change24h ?? null },
      spx48,
      btc48: pct48h(btcHistory),
      regime: regimeLabel,
      breadth: regimeBreadth,
      news,
      elites,
    });
  }, [quotes, btc, eth, spx48, btcHistory, regimeLabel, regimeBreadth, news, elites]);

  useEffect(() => {
    if (input) {
      setBriefText(buildBriefTemplate(input));
      setBriefTier('template');
      setBriefBadge(BADGE_TEMPLATE);
    }
  }, [input]);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (v) {
      setSeen(true);
      void markBriefSeen(briefDay);
    }
  }, [briefDay]);

  const generateAi = useCallback(() => {
    if (!input || briefBusy) return;
    setBriefBusy(true);
    setBriefError(null);
    void (async () => {
      try {
        const template = buildBriefTemplate(input);
        const r = await generateBrief(buildMorningBriefPrompt(input), template);
        setBriefText(r.text ?? template);
        setBriefTier(r.tier === 'flash' ? 'flash' : 'template');
        setBriefBadge(r.badge);
        if (r.tier !== 'flash') {
          setBriefError(r.error
            ? `IA indisponível (${r.error}); mantido o resumo automático.`
            : `A resposta da IA não passou na validação${r.detail ? ` (${r.detail})` : ''}; mantido o resumo automático.`);
        }
      } catch (e) {
        setBriefError(e instanceof Error ? `Falha ao gerar com IA: ${e.message}` : 'Falha ao gerar com IA.');
      } finally {
        setBriefBusy(false);
        try {
          const left = await aiRemaining();
          setQuotaNote(`${left}/20`);
        } catch {
          /* mantém */
        }
      }
    })();
  }, [input, briefBusy]);

  return {
    headline: input ? buildBriefHeadline(input) : null,
    loading, loadError, open, setOpen,
    isWindow, isNew: isWindow && !seen,
    briefText, briefTier, briefBadge, briefBusy, briefError, generateAi, quotaNote,
  };
}
