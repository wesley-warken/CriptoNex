import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { geckoGlobal, geckoHistory30d } from '@/services/providers/coingecko';
import { fearGreed, fgLabel } from '@/services/providers/sentiment';
import { yahooChart } from '@/services/lookup';
import { Panel, PanelTitle, Stat, Badge, Skeleton, ErrorBox } from '@/components/ui/kit';
import { Sparkline } from '@/components/charts/Sparkline';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { fmtUSD, fmtPct, fmtNum, fmtPrice, timeAgo } from '@/lib/format';
import { summarize, totals } from '@/lib/portfolio';
import { rankOpportunities } from '@/engine/ranking';

/** Medidor semicircular de Fear & Greed (SVG próprio). */
function Gauge({ value }: { value: number | null }) {
  const v = value ?? 0;
  const ang = (v / 100) * 180;
  const color = v >= 75 ? '#34d399' : v >= 55 ? '#a3e635' : v >= 45 ? '#fbbf24' : v >= 25 ? '#fb923c' : '#fb7185';
  const cx = 60;
  const cy = 58;
  const r = 48;
  const rad = (a: number) => (a * Math.PI) / 180;
  const px = cx + r * Math.cos(rad(180 - ang));
  const py = cy - r * Math.sin(rad(180 - ang));
  return (
    <svg width="120" height="66" viewBox="0 0 120 66">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--surface-2)" strokeWidth="10" strokeLinecap="round" />
      {value != null && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${px} ${py}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="bold" fontFamily="JetBrains Mono, monospace">{value ?? '—'}</text>
    </svg>
  );
}

export function Dashboard() {
  const refreshSec = useStore((s) => s.refreshSec);
  const watchlist = useStore((s) => s.watchlist);
  const operations = useStore((s) => s.operations);
  const m = useCryptoMarket(refreshSec);
  const a = useAnalysis(m.data, m.candles);
  const [global, setGlobal] = useState<{ btcDominance: number; totalMcap: number } | null>(null);
  const [hist, setHist] = useState<{ btc: number[]; eth: number[] }>({ btc: [], eth: [] });
  const [fg, setFg] = useState<number | null>(null);
  const [gold, setGold] = useState<{ price: number | null; spark: number[] }>({ price: null, spark: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await geckoGlobal();
        if (alive) setGlobal(g);
      } catch {
        /* painel global é complementar */
      }
      try {
        const [b, e] = await Promise.all([geckoHistory30d('bitcoin'), geckoHistory30d('ethereum')]);
        if (alive) setHist({ btc: b, eth: e });
      } catch {
        /* sem histórico: mantém sparklines vazios */
      }
      try {
        const f = await fearGreed(2);
        if (alive) setFg(f.current);
      } catch {
        /* sem F&G */
      }
      try {
        const g = await yahooChart('GC=F', '1mo', '1d');
        if (alive) setGold({ price: g.price, spark: g.candles.map((k) => k.close) });
      } catch {
        /* sem ouro */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (m.loading) return <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} />)}</div>;
  if (m.error && !m.data.length) return <ErrorBox message={m.error} onRetry={m.reload} />;
  const ranked = rankOpportunities(a.scores).slice(0, 5);
  const gainers = [...m.data].sort((x, y) => (y.change24h ?? -999) - (x.change24h ?? -999)).slice(0, 5);
  const losers = [...m.data].sort((x, y) => (x.change24h ?? 999) - (y.change24h ?? 999)).slice(0, 5);
  const btc = m.data.find((d) => d.symbol === 'BTC');
  const dashRows = summarize(
    operations.map((o) => ({ ...o, price: o.price })),
    Object.fromEntries(m.data.map((d) => [d.symbol, d.price])),
  );
  const dashT = totals(dashRows, 'standard');
  const invested = dashT.invested;
  const current = dashT.current;
  const regimeTone = a.regime.label.includes('RISK-ON') ? 'up' : a.regime.label.includes('RISK-OFF') ? 'down' : 'warn';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{m.stale ? 'Dados desatualizados' : `Atualizado ${timeAgo(m.updatedAt)}`}</span>
        {m.stale && m.updatedAt && <span>· Atualização: {new Date(m.updatedAt).toLocaleTimeString('pt-BR')}</span>}
        <button onClick={m.reload} className="ml-auto rounded-lg border border-[var(--border)] px-2 py-1">Recarregar</button>
      </div>
      <Panel>
        <PanelTitle>Leituras</PanelTitle>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-4">
          <Stat label="Market Regime" value={a.regime.label} sub={`Confiança ${a.regime.confidence}%`} tone={regimeTone} />
          <Stat label="BTC" value={fmtUSD(btc?.price)} sub={fmtPct(btc?.change24h)} tone={(btc?.change24h ?? 0) >= 0 ? 'up' : 'down'} />
          <Stat label="Market Breadth" value={`${a.regime.breadth}%`} sub={`Momentum ${a.regime.momentum}`} />
          <Stat label="Portfolio" value={fmtUSD(current)} sub={`Investido ${fmtUSD(invested)}`} tone={current >= invested ? 'up' : 'down'} />
        </div>
      </Panel>
      <Panel>
        <PanelTitle right={<span className="text-xs normal-case text-muted">CoinGecko global · Yahoo ouro</span>}>Mercado global</PanelTitle>
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <div className="text-xs text-muted">Medo &amp; Ganância</div>
            <Gauge value={fg} />
            <div className="text-xs text-muted">{fg != null ? fgLabel(fg) : '—'}</div>
          </div>
          <div><div className="text-xs text-muted">Market cap total</div><div className="tabular text-lg font-bold">{global ? fmtUSD(global.totalMcap, 0) : '—'}</div>
            <div className="mt-1 text-xs text-muted">Dominância BTC</div><div className="tabular text-lg font-bold">{global ? `${global.btcDominance.toFixed(1)}%` : '—'}</div>
            {global && <div className="mt-1"><Badge tone={global.btcDominance >= 58 ? 'warn' : undefined}>{global.btcDominance >= 58 ? 'BTC dominando — sem altseason' : 'Dominância comportada'}</Badge></div>}
          </div>
          <div>
            <div className="text-xs text-muted">Ouro (GC=F)</div>
            <div className="tabular text-lg font-bold">{gold.price != null ? fmtNum(gold.price) : '—'}</div>
            <Sparkline data={gold.spark} width={150} height={40} />
            <div className="text-xs text-muted">Ouro em alta forte = fuga de risco</div>
          </div>
          <div><div className="text-xs text-muted">BTC 30d</div><Sparkline data={hist.btc} width={150} height={44} /></div>
          <div><div className="text-xs text-muted">ETH 30d</div><Sparkline data={hist.eth} width={150} height={44} /></div>
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Fullscreen title="Top Opportunities">
          {ranked.map((o, i) => (
            <div key={o.symbol} className="flex items-center gap-3 border-b border-[var(--border)] py-2 text-sm">
              <span className="tabular w-6 text-muted">#{i + 1}</span>
              <Link to={`/monitor?symbol=${o.symbol}`} className="w-16 font-bold hover:underline">{o.symbol}</Link>
              <ScoreAudit score={o} />
              <span className="text-xs text-muted">{o.classification} · conf {o.confidence}%</span>
              <Badge tone={o.signal === 'BUY' ? 'up' : o.signal === 'SELL' ? 'down' : 'warn'}>{o.signal}</Badge>
            </div>
          ))}
        </Fullscreen>
        <Fullscreen title="Watchlist">
          {watchlist.length === 0 && <div className="text-sm text-muted">Watchlist vazia — adicione ativos no Radar.</div>}
          {watchlist.map((s) => {
            const d = m.data.find((x) => x.symbol === s);
            if (!d) return null;
            return (
              <div key={s} className="flex items-center gap-3 border-b border-[var(--border)] py-2 text-sm">
                <Link to={`/monitor?symbol=${s}`} className="w-16 font-bold hover:underline">{s}</Link>
                <span className="tabular">{fmtPrice(d.price)}</span>
                <span className="tabular" style={{ color: (d.change24h ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtPct(d.change24h)}</span>
                <Sparkline data={d.sparkline30d ?? []} />
              </div>
            );
          })}
        </Fullscreen>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel><PanelTitle>Top Gainers 24h</PanelTitle>{gainers.map((d) => <div key={d.symbol} className="flex justify-between border-b border-[var(--border)] py-1.5 text-sm"><span className="font-semibold">{d.symbol}</span><span className="tabular text-[var(--up)]">{fmtPct(d.change24h)}</span></div>)}</Panel>
        <Panel><PanelTitle>Top Losers 24h</PanelTitle>{losers.map((d) => <div key={d.symbol} className="flex justify-between border-b border-[var(--border)] py-1.5 text-sm"><span className="font-semibold">{d.symbol}</span><span className="tabular text-[var(--down)]">{fmtPct(d.change24h)}</span></div>)}</Panel>
      </div>
    </div>
  );
}
