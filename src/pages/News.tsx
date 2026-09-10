import { useEffect, useMemo, useState } from 'react';
import { fetchNews, type NewsItem } from '@/services/news';
import { sentimentScore, translateToPt } from '@/services/sentiment';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { Fullscreen } from '@/components/charts/Fullscreen';

function ago(ts: number | null): string {
  if (!ts) return 'sem data';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function News() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('ALL');
  const [coin, setCoin] = useState('ALL');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchNews();
      setItems(r.items);
      setErrors(r.errors);
      if (!r.items.length) setError(r.errors.join(' · ') || 'Nenhuma notícia retornada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Feed indisponível');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sources = [...new Set(items.map((i) => i.source))];
  const coins = [...new Set(items.flatMap((i) => i.coins))].sort();
  const [mood, setMood] = useState('ALL');
  const [translated, setTranslated] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<string | null>(null);

  const withMood = useMemo(
    () => items.map((i) => ({ ...i, mood: sentimentScore(`${i.title} ${i.summary}`) })),
    [items],
  );
  const needle = q.trim().toLowerCase();
  const rows = withMood.filter((i) => (source === 'ALL' ? true : i.source === source))
    .filter((i) => (coin === 'ALL' ? true : i.coins.includes(coin)))
    .filter((i) => (mood === 'ALL' ? true : i.mood.label === mood))
    .filter((i) => (needle ? (i.title + ' ' + i.summary).toLowerCase().includes(needle) : true));

  const doTranslate = async (n: (typeof withMood)[number]) => {
    if (translated[n.id] || translating) return;
    setTranslating(n.id);
    try {
      const t = await translateToPt(n.title);
      setTranslated((prev) => ({ ...prev, [n.id]: t }));
    } catch {
      /* mantém original */
    } finally {
      setTranslating(null);
    }
  };

  if (loading) return <Skeleton className="h-96" />;
  if (error && !items.length) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar notícias…" className="min-w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5" />
        <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <option value="ALL">Todas as fontes</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={coin} onChange={(e) => setCoin(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <option value="ALL">Todas as moedas</option>
          {coins.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={mood} onChange={(e) => setMood(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5" title="Sentimento estimado (heurística)">
          <option value="ALL">Qualquer humor</option>
          <option value="positivo">Positivas (8–10)</option>
          <option value="neutro">Neutras (4–7)</option>
          <option value="negativo">Negativas (1–3)</option>
        </select>
        <span className="text-xs text-muted">{rows.length} matérias</span>
        <button onClick={load} className="ml-auto rounded-lg border border-[var(--border)] px-2 py-1 text-xs">Atualizar</button>
      </div>
      {errors.length > 0 && <div className="text-xs text-[var(--warn)]">Algumas fontes falharam: {errors.join(' · ')}</div>}
      <Fullscreen title={`Feed de notícias — ${rows.length}`}>
        {!rows.length && <Empty title="Nada encontrado" hint="Ajuste busca, fonte ou moeda." />}
        {rows.slice(0, 120).map((n) => (
          <div key={n.id} className="flex gap-3 border-b border-[var(--border)] py-2.5">
            {n.image && (
              <a href={n.link} target="_blank" rel="noreferrer" className="hidden w-28 shrink-0 sm:block">
                <img src={n.image} alt="" loading="lazy" className="h-20 w-28 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </a>
            )}
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{n.source}</Badge>
              <span className="text-xs text-muted">{ago(n.publishedAt)}</span>
              <span className="inline-flex items-center gap-0.5" title={`Sentimento estimado ${n.mood.score}/10 (heurística por palavras-chave)`}>
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className="inline-block h-2.5 w-1.5 rounded-sm" style={{ background: i < n.mood.score ? (n.mood.score >= 8 ? 'var(--up)' : n.mood.score <= 3 ? 'var(--down)' : 'var(--warn)') : 'var(--surface-2)' }} />
                ))}
                <span className="ml-1 font-mono text-[11px] text-muted">{n.mood.score}</span>
              </span>
              {n.coins.slice(0, 6).map((c) => <span key={c} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px]">{c}</span>)}
              <span className="ml-auto flex gap-1">
                <button onClick={() => void doTranslate(n)} className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px]" title="Traduzir título para português">
                  {translating === n.id ? '…' : translated[n.id] ? 'PT ✓' : 'PT'}
                </button>
                <a href={n.link} target="_blank" rel="noreferrer" className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px]">abrir ↗</a>
              </span>
            </div>
            <a href={n.link} target="_blank" rel="noreferrer" className="mt-0.5 block text-sm font-semibold leading-snug hover:underline">{translated[n.id] ?? n.title}</a>
            {n.summary && <div className="text-xs text-muted">{n.summary}…</div>}
            </div>
          </div>
        ))}
      </Fullscreen>
    </div>
  );
}
