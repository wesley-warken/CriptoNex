import { useEffect, useMemo, useState } from 'react';
import { topFunding, fundingHistory, openInterestHist, longShortRatio, takerRatio } from '@/services/derivatives';
import { Panel, PanelTitle, Skeleton, ErrorBox } from '@/components/ui/kit';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { fmtPct } from '@/lib/format';

const SYMS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'LINK', 'AVAX', 'HYPE'];

export function Derivatives() {
  const [fund, setFund] = useState<{ symbol: string; rate: number; time: number; markPrice?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('BTC');
  const [hist, setHist] = useState<{ time: number; rate: number }[]>([]);
  const [oi, setOi] = useState<{ time: number; openInterestValue: number }[]>([]);
  const [ls, setLs] = useState<{ time: number; longShortRatio: number }[]>([]);
  const [taker, setTaker] = useState<{ time: number; longShortRatio: number }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setFund(await topFunding(30));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Derivativos indisponíveis');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, o, l, t] = await Promise.all([
          fundingHistory(symbol, 60),
          openInterestHist(symbol, '4h', 60),
          longShortRatio(symbol, '4h', 60),
          takerRatio(symbol, '4h', 60),
        ]);
        if (!alive) return;
        setHist(h);
        setOi(o);
        setLs(l);
        setTaker(t);
      } catch {
        /* mantém anterior */
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const fmtT = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const avgFund = useMemo(() => (hist.length ? (hist.reduce((s, h) => s + h.rate, 0) / hist.length) * 100 : null), [hist]);
  const lastLs = ls.length ? ls[ls.length - 1].longShortRatio : null;
  const oiChg = oi.length > 1 ? ((oi[oi.length - 1].openInterestValue / oi[0].openInterestValue - 1) * 100) : null;

  if (loading) return <Skeleton className="h-96" />;
  if (error && !fund.length) return <ErrorBox message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Panel><div className="text-xs text-muted">Funding médio {symbol} (≈60 fixings)</div><div className="tabular text-xl font-bold" style={{ color: (avgFund ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{avgFund != null ? `${avgFund.toFixed(4)}%` : '—'}</div><div className="text-xs text-muted">{avgFund != null && avgFund > 0.01 ? 'Longs pagando shorts — posicionamento comprado' : avgFund != null && avgFund < -0.01 ? 'Shorts pagando longs — posicionamento vendido' : 'Neutro'}</div></Panel>
        <Panel><div className="text-xs text-muted">Long/Short global {symbol}</div><div className="tabular text-xl font-bold">{lastLs != null ? lastLs.toFixed(2) : '—'}</div><div className="text-xs text-muted">contas compradas ÷ vendidas</div></Panel>
        <Panel><div className="text-xs text-muted">Open Interest {symbol} (período)</div><div className="tabular text-xl font-bold" style={{ color: (oiChg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{oiChg != null ? fmtPct(oiChg) : '—'}</div><div className="text-xs text-muted">OI sobe + preço sobe = força; OI sobe + preço cai = pressão</div></Panel>
        <Panel><div className="text-xs text-muted">Leitura</div><div className="text-sm text-muted">Funding muito positivo + OI em alta sugere euforia alavancada (risco de squeeze). Leitura probabilística, não garantia.</div></Panel>
      </div>

      <div className="flex flex-wrap gap-1">
        {SYMS.map((s) => <button key={s} onClick={() => setSymbol(s)} className={s === symbol ? 'rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-bold text-black' : 'rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-muted'}>{s}</button>)}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Fullscreen title={`Funding extremo — top 30 (atual)`}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fund.map((f) => ({ name: f.symbol, v: f.rate * 100 }))} layout="vertical">
              <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${v.toFixed(2)}%`} />
              <YAxis type="category" dataKey="name" fontSize={10} width={52} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(4)}%`, 'funding']} />
              <Bar dataKey="v">{fund.map((f) => <Cell key={f.symbol} fill={f.rate >= 0 ? 'var(--up)' : 'var(--down)'} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Fullscreen>
        <Fullscreen title={`Funding ${symbol} — histórico`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hist.map((h) => ({ t: fmtT(h.time), v: h.rate * 100 }))}>
              <XAxis dataKey="t" fontSize={10} /><YAxis fontSize={10} tickFormatter={(v: number) => `${v.toFixed(3)}%`} /><Tooltip formatter={(v) => [`${Number(v).toFixed(4)}%`, 'funding']} />
              <Line type="monotone" dataKey="v" stroke="var(--accent)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Fullscreen>
        <Fullscreen title={`Open Interest ${symbol} (USD)`}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={oi.map((o) => ({ t: fmtT(o.time), v: o.openInterestValue }))}>
              <XAxis dataKey="t" fontSize={10} /><YAxis fontSize={10} tickFormatter={(v: number) => `$${(v / 1e9).toFixed(1)}B`} /><Tooltip />
              <Line type="monotone" dataKey="v" stroke="var(--accent-2)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Fullscreen>
        <Fullscreen title={`Long/Short ${symbol} + taker`}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={ls.map((l, i) => ({ t: fmtT(l.time), contas: l.longShortRatio, taker: taker[i]?.longShortRatio ?? null }))}>
              <XAxis dataKey="t" fontSize={10} /><YAxis fontSize={10} domain={[0.5, 2]} /><Tooltip />
              <Line type="monotone" dataKey="contas" stroke="var(--up)" dot={false} name="contas L/S" />
              <Line type="monotone" dataKey="taker" stroke="var(--warn)" dot={false} name="taker buy/sell" />
            </LineChart>
          </ResponsiveContainer>
        </Fullscreen>
      </div>
    </div>
  );
}
