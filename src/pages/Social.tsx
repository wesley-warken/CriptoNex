import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { fearGreed, geckoTrendingSafe } from '@/services/sentimentSafe';
import { geckoCategories, type GeckoCategory } from '@/services/providers/coingecko';
import { Panel, PanelTitle, Skeleton, ErrorBox } from '@/components/ui/kit';
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
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Panel><PanelTitle>Fear &amp; Greed atual</PanelTitle><div className="tabular text-4xl font-bold">{fg?.current ?? '—'}</div><div className="text-sm text-muted">{fg?.history.length ? fg.history[fg.history.length - 1].label : 'indisponível'}</div></Panel>
        <Panel><PanelTitle>Trending (CoinGecko)</PanelTitle>{trend.map((t) => <div key={t.symbol} className="flex justify-between py-1 text-sm"><strong>{t.symbol}</strong><span className="text-muted">{t.name}</span></div>)}</Panel>
        <Panel><PanelTitle>Sentiment score (contexto)</PanelTitle><div className="tabular text-4xl font-bold">{fg?.current ? Math.round(fg.current * 0.6 + 20) : '—'}</div><div className="text-xs text-muted">Social é contexto, não sinal automático de compra. Não domina o Technical Score.</div></Panel>
      </div>
      <Fullscreen title="Fear & Greed — 30d">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={(fg?.history ?? []).map((h) => ({ t: new Date(h.time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), v: h.value }))}>
            <XAxis dataKey="t" fontSize={10} /><YAxis domain={[0, 100]} fontSize={10} /><Tooltip />
            <Area type="monotone" dataKey="v" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      </Fullscreen>
      <Panel><PanelTitle>Reddit — menções</PanelTitle><div className="text-sm text-muted">Busca Reddit sob rate-limit frequente. Use o Monitor para contexto técnico e trate social como confirmação secundária. r/cryptocurrency e r/bitcoin são as fontes padrão quando o proxy está ativo.</div></Panel>
      <Fullscreen title="Mapa de categorias — tamanho = market cap da categoria">
        {!treemap && <div className="text-sm text-muted">Carregando categorias…</div>}
        {treemap && (
          <div className="relative h-[380px] w-full overflow-hidden rounded-lg">
            {treemap.leaves.map((l, i) => {
              const c = treemap.top[i];
              if (!c) return null;
              const v = c.market_cap_change_24h ?? 0;
              return (
                <div key={c.id} title={`${c.name} · ${fmtUSD(c.market_cap, 0)} · 24h ${fmtPct(v)} · top: ${(c.top_3_coins ?? []).join(', ')}`}
                  className="absolute flex flex-col items-center justify-center overflow-hidden rounded text-black"
                  style={{ left: `${l.x0}%`, top: `${(l.y0 / 40) * 100}%`, width: `${Math.max(5, l.x1 - l.x0)}%`, height: `${Math.max(8, ((l.y1 - l.y0) / 40) * 100)}%`, background: v >= 0 ? `rgba(52,211,153,${0.4 + Math.min(0.5, Math.abs(v) / 8)})` : `rgba(251,113,133,${0.4 + Math.min(0.5, Math.abs(v) / 8)})` }}>
                  <span className="px-1 text-center text-xs font-bold leading-tight">{c.name}</span>
                  <span className="text-[10px]">{fmtPct(v)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-1 text-xs text-muted">Área = capitalização da categoria · cor = variação 24h · passe o mouse para ver as top moedas. Dados CoinGecko.</div>
      </Fullscreen>
    </div>
  );
}
