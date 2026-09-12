import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { fearGreed, geckoTrendingSafe } from '@/services/sentimentSafe';
import { geckoCategories, type GeckoCategory } from '@/services/providers/coingecko';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MStats } from '@/components/minimal/MStats';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { fmtUSD, fmtPct } from '@/lib/format';

export function Social() {
  const [fg, setFg] = useState<{ current: number | null; history: { time: number; value: number; label: string }[] } | null>(null);
  const [trend, setTrend] = useState<{ symbol: string; name: string }[]>([]);
  const [cats, setCats] = useState<GeckoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, t] = await Promise.all([fearGreed(31), geckoTrendingSafe()]);
        if (alive) { setFg(f); setTrend(t); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Falha'); }
      finally { if (alive) setLoading(false); }
      try {
        const c = await geckoCategories();
        if (alive) setCats(c);
      } catch {
        /* treemap de categorias é complementar */
      }
    })();
    return () => { alive = false; };
  }, []);
  const treemap = useMemo(() => {
    if (!cats.length) return null;
    const root = d3.hierarchy({ children: cats } as unknown as { children: GeckoCategory[] }).sum((d) => (d as unknown as GeckoCategory).market_cap ?? 1);
    d3.treemap().size([100, 40]).padding(0.8)(root as unknown as d3.HierarchyRectangularNode<unknown>);
    return { leaves: root.leaves() as unknown as { x0: number; y0: number; x1: number; y1: number }[], top: cats };
  }, [cats]);
  if (loading) return <Skeleton className="h-72" />;
  if (error && !fg) return <ErrorBox message={error} onRetry={() => window.location.reload()} />;
  return (
    <div className="space-y-3 text-[var(--text-secondary)]">
      <MStats
        items={[
          { label: 'Fear & Greed atual', value: fg?.current != null ? String(fg.current) : '—', sub: fg?.history.length ? fg.history[fg.history.length - 1].label : 'indisponível' },
          { label: 'Sentimento (contexto)', value: fg?.current ? String(Math.round(fg.current * 0.6 + 20)) : '—', sub: 'não domina o Technical Score' },
        ]}
      />
      <MSection title="Trending (CoinGecko)">
        <div className="divide-y divide-[var(--border)]">
          {trend.map((t) => (
            <div key={t.symbol} className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <strong className="font-semibold text-[var(--text-primary)]">{t.symbol}</strong>
              <span className="text-[var(--text-muted)]">{t.name}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">Social é contexto, não sinal automático de compra. Não domina o Technical Score.</p>
      </MSection>
      <Fullscreen title="Fear & Greed — 30d">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={(fg?.history ?? []).map((h) => ({ t: new Date(h.time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), v: h.value }))}>
            <XAxis dataKey="t" fontSize={10} /><YAxis domain={[0, 100]} fontSize={10} /><Tooltip />
            <Area type="monotone" dataKey="v" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </Fullscreen>
      <MSection title="Reddit — menções"><p className="text-sm leading-6 text-[var(--text-secondary)]">Busca Reddit sob rate-limit frequente. Use o Monitor para contexto técnico e trate social como confirmação secundária. r/cryptocurrency e r/bitcoin são as fontes padrão quando o proxy está ativo.</p></MSection>
      <Fullscreen title="Mapa de categorias — tamanho = market cap da categoria">
        {!treemap && <div className="text-sm text-[var(--text-muted)]">Carregando categorias…</div>}
        {treemap && (
          <div className="relative h-[380px] w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
            {treemap.leaves.map((l, i) => {
              const c = treemap.top[i];
              if (!c) return null;
              const v = c.market_cap_change_24h ?? 0;
              return (
                <div key={c.id} title={`${c.name} · ${fmtUSD(c.market_cap, 0)} · 24h ${fmtPct(v)} · top: ${(c.top_3_coins ?? []).join(', ')}`}
                  className="absolute flex flex-col items-center justify-center overflow-hidden rounded text-white shadow-sm"
                  style={{ left: `${l.x0}%`, top: `${(l.y0 / 40) * 100}%`, width: `${Math.max(5, l.x1 - l.x0)}%`, height: `${Math.max(8, ((l.y1 - l.y0) / 40) * 100)}%`, background: v >= 0 ? `rgba(16,185,129,${0.65 + Math.min(0.3, Math.abs(v) / 8)})` : `rgba(239,68,68,${0.65 + Math.min(0.3, Math.abs(v) / 8)})` }}>
                  <span className="px-1 text-center text-xs font-semibold leading-tight">{c.name}</span>
                  <span className="text-[10px] tabular-nums font-semibold">{fmtPct(v)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-1 text-xs text-[var(--text-muted)]">Área = capitalização da categoria · cor = variação 24h · passe o mouse para ver as top moedas. Dados CoinGecko.</div>
      </Fullscreen>
    </div>
  );
}
