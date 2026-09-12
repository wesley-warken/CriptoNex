import { useEffect, useMemo, useState } from 'react';
import { fetchNews, type NewsItem } from '@/services/news';
import { sentimentScore, translateToPt } from '@/services/sentiment';
import { Search } from 'lucide-react';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MEmpty } from '@/components/minimal/MEmpty';
import { cn } from '@/lib/utils';
import { Fullscreen } from '@/components/charts/Fullscreen';

function ago(ts: number | null): string {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m}m`;
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
      {/* Topbar Terminal News Wire */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[var(--text-muted)]"><Search size={14} /></span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar notícias e termos…"
              className="w-56 rounded-md border border-[var(--border)] bg-[var(--surface-1)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>

          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
          >
            <option value="ALL">Todas as fontes ({sources.length})</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={coin}
            onChange={(e) => setCoin(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
          >
            <option value="ALL">Todos os ativos ({coins.length})</option>
            {coins.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
            title="Sentimento estimado (heurística quant)"
          >
            <option value="ALL">Todos os humores</option>
            <option value="positivo">Positivas (8–10)</option>
            <option value="neutro">Neutras (4–7)</option>
            <option value="negativo">Negativas (1–3)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">{rows.length}</strong> matérias carregadas
          </span>

          <button
            onClick={load}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] active:scale-[0.98]"
          >
            Atualizar Feed
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="border-y border-[var(--border)] py-2 text-xs text-[var(--bear)]">
          Aviso de conectividade com fontes secundárias: {errors.join(' · ')}
        </div>
      )}

      {/* Feed Container */}
      <Fullscreen title={`Feed Noticioso do Terminal — ${rows.length} matérias em tempo real`}>
        {!rows.length && (
          <MEmpty title="Nenhuma notícia encontrada" hint="Tente ajustar os filtros de busca, fonte ou humor acima." />
        )}

        <div className="divide-y divide-[var(--border)]">
          {rows.slice(0, 120).map((n) => (
            <div key={n.id} className="flex gap-3.5 px-2 py-3 transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
              {n.image && (
                <a
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden w-28 shrink-0 overflow-hidden rounded border border-[var(--border)] sm:block"
                >
                  <img
                    src={n.image}
                    alt=""
                    loading="lazy"
                    className="h-20 w-28 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </a>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {n.source}
                  </span>

                  <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                    {ago(n.publishedAt)}
                  </span>

                  {/* Sentimento Bar */}
                  <div
                    className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-0.5"
                    title={`Sentimento estimado ${n.mood.score}/10`}
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-block h-2 w-1 rounded-sm',
                          i < n.mood.score
                            ? n.mood.score >= 8
                              ? 'bg-[var(--bull)]'
                              : n.mood.score <= 3
                              ? 'bg-[var(--bear)]'
                              : 'bg-[var(--text-muted)]'
                            : 'bg-[var(--border)]'
                        )}
                      />
                    ))}
                    <span className="ml-1.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
                      {n.mood.score}/10
                    </span>
                  </div>

                  {n.coins.slice(0, 6).map((c) => (
                    <span
                      key={c}
                      className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-secondary)]"
                    >
                      {c}
                    </span>
                  ))}

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => void doTranslate(n)}
                      className={cn(
                        'rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] transition-colors duration-150 ease-out active:scale-[0.98]',
                        translated[n.id] ? 'border-[var(--brand)] font-semibold text-[var(--brand)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                      )}
                      title="Traduzir título para português"
                    >
                      {translating === n.id ? '…' : translated[n.id] ? 'PT' : 'TRADUZIR'}
                    </button>
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] active:scale-[0.98]"
                    >
                      ABRIR ↗
                    </a>
                  </div>
                </div>

                <a
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 block text-sm font-semibold leading-snug text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline active:scale-[0.98]"
                >
                  {translated[n.id] ?? n.title}
                </a>

                {n.summary && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {n.summary}…
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Fullscreen>
    </div>
  );
}
