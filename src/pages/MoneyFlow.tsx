import { useEffect, useMemo, useState } from 'react';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines } from '@/services/providers/binance';
import { useUniverseCrypto } from '@/services/universeHooks';
import { cmf, cmfLabel, type FlowRow } from '@/engine/moneyflow';
import { Panel, PanelTitle, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { fmtUSD, fmtPct } from '@/lib/format';
import { Link } from 'react-router-dom';

export function MoneyFlow() {
  const u = useUniverseCrypto();
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [minRank, setMinRank] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const assets = CRYPTO_ASSETS.filter((a) => a.binanceSymbol);
        const out: FlowRow[] = [];
        for (let i = 0; i < assets.length; i += 5) {
          const batch = await Promise.all(
            assets.slice(i, i + 5).map(async (a) => {
              try {
                const kl = await binanceKlines(a.binanceSymbol!, '1d', 60);
                const v = cmf(kl, 20);
                if (v == null || !kl.length) return null;
                return { symbol: a.symbol, cmf: v, price: kl[kl.length - 1].close } as FlowRow & { price: number };
              } catch {
                return null;
              }
            }),
          );
          for (const b of batch) if (b) out.push({ ...b, change24h: null });
          if (alive) setRows([...out]);
        }
        // 24h do universo para contexto
        if (alive) {
          const bySym = Object.fromEntries(u.coins.map((c) => [c.symbol, c.change24h]));
          setRows((prev) => prev.map((r) => ({ ...r, change24h: bySym[r.symbol] ?? null })));
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Fluxo indisponível');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = rows.filter((r) => (needle ? r.symbol.toLowerCase().includes(needle) : true));
    return [...list].sort((x, y) => (order === 'desc' ? y.cmf - x.cmf : x.cmf - y.cmf));
  }, [rows, needle, order]);
  const visible = filtered.filter((_, i) => i >= minRank && i < minRank + 40);

  if (loading && !rows.length) return <Skeleton className="h-96" />;
  if (error && !rows.length) return <ErrorBox message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar…" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5" />
        <label>Faixa <select value={minRank} onChange={(e) => setMinRank(Number(e.target.value))} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          {[0, 40, 80, 120].map((v) => <option key={v} value={v}>{v}{v === 0 ? '–40 (top)' : `–${v + 40}`}</option>)}
        </select></label>
        <label>Ordem <select value={order} onChange={(e) => setOrder(e.target.value as typeof order)} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <option value="desc">Maior compra primeiro</option>
          <option value="asc">Maior venda primeiro</option>
        </select></label>
        <span className="text-xs text-muted">CMF(20) diário · verde = entrada de dinheiro, vermelho = saída</span>
      </div>
      <Fullscreen title={`Fluxo de dinheiro — ${visible.length} ativos`}>
        {!visible.length && <Empty title="Nada aqui" hint="Ajuste busca ou faixa." />}
        <ResponsiveContainer width="100%" height={Math.max(280, visible.length * 26)}>
          <BarChart data={visible.map((r) => ({ name: r.symbol, v: r.cmf }))} layout="vertical">
            <XAxis type="number" fontSize={10} domain={[-1, 1]} />
            <YAxis type="category" dataKey="name" fontSize={11} width={60} />
            <Tooltip formatter={(v) => [Number(v).toFixed(3), 'CMF']} />
            <Bar dataKey="v">{visible.map((r) => <Cell key={r.symbol} fill={r.cmf >= 0 ? 'var(--up)' : 'var(--down)'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </Fullscreen>
      <Panel>
        <PanelTitle>Tabela</PanelTitle>
        {visible.map((r) => (
          <div key={r.symbol} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-1.5 text-sm">
            <Link to={`/monitor?symbol=${r.symbol}`} className="w-16 font-bold hover:underline">{r.symbol}</Link>
            <span className="tabular">{fmtUSD(r.price)}</span>
            <span className="tabular" style={{ color: (r.change24h ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{r.change24h != null ? fmtPct(r.change24h) : ''}</span>
            <span className="tabular" style={{ color: r.cmf >= 0 ? 'var(--up)' : 'var(--down)' }}>CMF {r.cmf.toFixed(3)} · {cmfLabel(r.cmf)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
