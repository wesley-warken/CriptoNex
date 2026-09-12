import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { useUniverseStocks } from '@/services/universeHooks';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MEmpty } from '@/components/minimal/MEmpty';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { AssetSearch } from '@/components/analysis/AssetSearch';
import { beep } from '@/lib/alerts';
import { fmtUSD, fmtPct, fmtNum } from '@/lib/format';

export function Watchlist() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const a = useAnalysis(m.data, m.candles);
  const uni = useUniverseStocks();
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const muted = useStore((s) => s.muted);
  const prev = useRef<Record<string, number>>({});

  const cryptoSyms = useMemo(() => new Set(m.data.map((d) => d.symbol)), [m.data]);
  const b3Syms = useMemo(
    () => watchlist.filter((s) => !cryptoSyms.has(s) && (uni.b3.some((b) => b.symbol === s) || (/^[A-Z]{4}[346]$/.test(s) && !s.includes('.') && !s.includes('=') && !s.startsWith('^')))),
    [watchlist, cryptoSyms, uni.b3],
  );
  const yhSyms = useMemo(() => watchlist.filter((s) => !cryptoSyms.has(s) && !b3Syms.includes(s)), [watchlist, cryptoSyms, b3Syms]);
  const brapi = useBrapiQuotes(b3Syms);
  const yh = useYahooQuotes(yhSyms);

  const rows = useMemo(
    () =>
      watchlist.map((s) => {
        const d = m.data.find((x) => x.symbol === s);
        if (d) return { symbol: s, price: d.price, chg: d.change24h, crypto: true as const };
        const b = brapi.map.get(s);
        if (b) return { symbol: s, price: b.price, chg: b.change, crypto: false as const };
        const y = yh.map.get(s);
        if (y) return { symbol: s, price: y.price, chg: y.changePct, crypto: false as const };
        return { symbol: s, price: null as number | null, chg: null as number | null, crypto: false as const };
      }),
    [watchlist, m.data, brapi.map, yh.map],
  );

  useEffect(() => {
    for (const r of rows) {
      if (r.price == null) continue;
      const p = prev.current[r.symbol];
      if (p && Math.abs(r.price / p - 1) >= 0.05) beep(muted);
      prev.current[r.symbol] = r.price;
    }
  }, [rows, muted]);

  if (m.loading && !m.data.length) return <Skeleton className="h-64" />;
  if (m.error && !m.data.length && !rows.some((r) => r.price != null)) return <ErrorBox message={m.error} onRetry={m.reload} />;
  if (!watchlist.length) return <MEmpty title="Watchlist vazia" hint="Adicione ativos pelo Radar (+W) ou pela busca global." />;

  const destOf = (s: string) => `/monitor?symbol=${encodeURIComponent(s)}`;

  return (
    <div className="space-y-3">
      <MSection title={`Watchlist — alertas ±5% ${muted ? '(mudo)' : '(som ativo)'}`}>
        <div className="divide-y divide-[var(--border)]">
          {rows.map((r) => {
            const sc = a.bySym.get(r.symbol);
            return (
              <div key={r.symbol} className="flex flex-wrap items-center gap-3 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
                <Link to={destOf(r.symbol)} className="w-24 truncate font-bold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline active:scale-[0.98]">{r.symbol}</Link>
                <span className="tabular-nums text-[var(--text-primary)]">{r.price != null ? (r.crypto ? fmtUSD(r.price) : fmtNum(r.price)) : <span className="text-[var(--text-muted)]">—</span>}</span>
                <span className={`tabular-nums font-medium ${(r.chg ?? 0) >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>{r.chg != null ? fmtPct(r.chg) : <span className="text-[var(--text-muted)]">—</span>}</span>
                {sc && <><ScoreAudit score={sc} /><span className={`text-xs font-semibold tabular-nums ${sc.signal === 'BUY' ? 'text-[var(--bull)]' : sc.signal === 'SELL' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'}`}>{sc.signal} · {sc.confidence}%</span></>}
                <button onClick={() => toggleWatch(r.symbol)} className="ml-auto text-xs uppercase tracking-wider text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]">remover</button>
              </div>
            );
          })}
        </div>
      </MSection>
      <AssetSearch />
    </div>
  );
}
