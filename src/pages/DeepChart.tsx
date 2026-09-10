import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines } from '@/services/providers/binance';
import { correlationMatrix } from '@/engine/correlation';
import { Panel, PanelTitle, Skeleton, ErrorBox } from '@/components/ui/kit';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { fmtPct, fmtNum } from '@/lib/format';

const COLS = ['1H', '24H', '7D'] as const;
export function DeepChart() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const nav = useNavigate();
  const [tfIdx, setTfIdx] = useState(1);
  const treemap = useMemo(() => {
    const top = [...m.data].filter((d) => (d.marketCap ?? 0) > 0).slice(0, 30);
    const root = d3.hierarchy({ children: top } as unknown as { children: typeof top }).sum((d) => (d as unknown as { marketCap?: number }).marketCap ?? 1);
    d3.treemap().size([100, 42]).padding(0.6)(root as unknown as d3.HierarchyRectangularNode<unknown>);
    const leaves = (root.leaves() as unknown as { x0: number; y0: number; x1: number; y1: number }[]);
    return { leaves, top };
  }, [m.data]);
  if (m.loading) return <Skeleton className="h-96" />;
  if (m.error && !m.data.length) return <ErrorBox message={m.error} onRetry={m.reload} />;
  const val = (d: (typeof m.data)[number], c: (typeof COLS)[number]) => c === '1H' ? (d.change1h ?? 0) : c === '24H' ? (d.change24h ?? 0) : (d.change7d ?? 0);
  return (
    <div className="space-y-3">
      <Fullscreen title="Treemap Top 30 — área = market cap · cor = performance">
        <div className="relative h-[420px] w-full overflow-hidden rounded-lg">
          {treemap.leaves.map((l, i) => {
            const d = treemap.top[i];
            if (!d) return null;
            const v = val(d, COLS[tfIdx]);
            const x0 = l.x0; const y0 = l.y0; const x1 = l.x1; const y1 = l.y1;
            return (
              <button key={d.symbol} onClick={() => nav(`/monitor?symbol=${d.symbol}`)} title={`${d.name} ${fmtPct(v)}`}
                className="absolute flex flex-col items-center justify-center overflow-hidden rounded text-black"
                style={{ left: `${x0}%`, top: `${(y0 / 42) * 100}%`, width: `${Math.max(4, x1 - x0)}%`, height: `${Math.max(6, ((y1 - y0) / 42) * 100)}%`, background: (v ?? 0) >= 0 ? `rgba(52,211,153,${0.4 + Math.min(0.55, Math.abs(v ?? 0) / 12)})` : `rgba(251,113,133,${0.4 + Math.min(0.55, Math.abs(v ?? 0) / 12)})` }}>
                <span className="text-xs font-bold">{d.symbol}</span>
                <span className="text-[10px]">{fmtPct(v)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1 text-xs">{COLS.map((c, i) => <button key={c} onClick={() => setTfIdx(i)} className={i === tfIdx ? 'rounded bg-[var(--accent)] px-2 py-1 font-bold text-black' : 'rounded border border-[var(--border)] px-2 py-1 text-muted'}>{c}</button>)}</div>
      </Fullscreen>
      <Fullscreen title="Heatmap Ativo × Timeframe">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr><th className="p-2 text-left">Ativo</th>{COLS.map((c) => <th key={c} className="p-2">{c}</th>)}</tr></thead>
          <tbody>{m.data.slice(0, 25).map((d) => (
            <tr key={d.symbol} className="border-t border-[var(--border)]">
              <td className="p-2 font-bold">{d.symbol}</td>
              {COLS.map((c) => { const v = val(d, c) ?? 0; return <td key={c}><button onClick={() => nav(`/monitor?symbol=${d.symbol}`)} className="tabular w-full rounded px-2 py-1.5 text-xs font-bold text-black" style={{ background: v >= 0 ? `rgba(52,211,153,${0.35 + Math.min(0.55, Math.abs(v) / 12)})` : `rgba(251,113,133,${0.35 + Math.min(0.55, Math.abs(v) / 12)})` }}>{fmtPct(v)}</button></td>; })}
            </tr>
          ))}          </tbody>
        </table></div>
      </Fullscreen>
      <CorrelationPanel />
      <ConverterPanel prices={Object.fromEntries(m.data.map((d) => [d.symbol, d.price]))} />
    </div>
  );
}

function CorrelationPanel() {
  const [corr, setCorr] = useState<{ symbols: string[]; matrix: (number | null)[][] } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const assets = CRYPTO_ASSETS.filter((a) => a.binanceSymbol).slice(0, 12);
      const series: Record<string, number[]> = {};
      for (let i = 0; i < assets.length; i += 4) {
        const batch = await Promise.all(
          assets.slice(i, i + 4).map(async (a) => {
            try {
              const kl = await binanceKlines(a.binanceSymbol!, '1d', 120);
              return [a.symbol, kl.map((k) => k.close)] as const;
            } catch {
              return null;
            }
          }),
        );
        for (const b of batch) if (b && b[1].length > 30) series[b[0]] = b[1];
      }
      if (alive && Object.keys(series).length >= 3) setCorr(correlationMatrix(series));
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!corr) return <Panel><PanelTitle>Matriz de correlação (retornos 1d)</PanelTitle><div className="text-sm text-muted">Calculando…</div></Panel>;
  const cellBg = (v: number | null) => {
    if (v == null) return 'var(--surface-2)';
    const t = Math.max(-1, Math.min(1, v));
    return t >= 0 ? `rgba(52,211,153,${0.12 + t * 0.75})` : `rgba(251,113,133,${0.12 - t * 0.75})`;
  };
  return (
    <Fullscreen title="Matriz de correlação — retornos diários">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead><tr><th className="p-1.5"></th>{corr.symbols.map((s) => <th key={s} className="p-1.5">{s}</th>)}</tr></thead>
          <tbody>
            {corr.symbols.map((a, i) => (
              <tr key={a}>
                <td className="p-1.5 font-bold">{a}</td>
                {corr.symbols.map((b, j) => {
                  const v = corr.matrix[i][j];
                  return <td key={b} className="tabular p-1.5 text-center font-bold text-black" style={{ background: cellBg(v) }}>{v == null ? '—' : v.toFixed(2)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-xs text-muted">Verde = andam juntas · vermelho = andam opostas. Alta correlação com BTC reduz diversificação.</div>
    </Fullscreen>
  );
}

function ConverterPanel({ prices }: { prices: Record<string, number> }) {
  const syms = useMemo(() => Object.keys(prices).sort(), [prices]);
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('BTC');
  const [to, setTo] = useState('ETH');
  const priceOf = (s: string) => (s === 'USD' ? 1 : (prices[s] ?? null));
  const pf = priceOf(from);
  const pt = priceOf(to);
  const result = pf != null && pt != null && pt > 0 ? (Number(amount) * pf) / pt : null;
  const sel = (v: string, fn: (s: string) => void) => (
    <select value={v} onChange={(e) => fn(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm">
      <option value="USD">USD</option>
      {syms.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
  return (
    <Panel>
      <PanelTitle>Conversor</PanelTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" />
        {sel(from, setFrom)}
        <span className="text-muted">→</span>
        {sel(to, setTo)}
        <strong className="tabular text-lg">{result != null ? `${fmtNum(result, 6)} ${to}` : '—'}</strong>
      </div>
    </Panel>
  );
}
