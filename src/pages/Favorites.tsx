import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { useUniverseStocks } from '@/services/universeHooks';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { AssetSearch } from '@/components/analysis/AssetSearch';
import { fmtUSD, fmtPct, fmtNum } from '@/lib/format';

export function Favorites() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const a = useAnalysis(m.data, m.candles);
  const uni = useUniverseStocks();
  const favs = useStore((s) => s.favorites);
  const toggleFav = useStore((s) => s.toggleFav);
  const reorderFav = useStore((s) => s.reorderFav);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cryptoSyms = useMemo(() => new Set(m.data.map((d) => d.symbol)), [m.data]);
  const b3Syms = useMemo(
    () => favs.filter((s) => !cryptoSyms.has(s) && (uni.b3.some((b) => b.symbol === s) || (/^[A-Z]{4}[346]$/.test(s) && !s.includes('.') && !s.includes('=') && !s.startsWith('^')))),
    [favs, cryptoSyms, uni.b3],
  );
  const yhSyms = useMemo(() => favs.filter((s) => !cryptoSyms.has(s) && !b3Syms.includes(s)), [favs, cryptoSyms, b3Syms]);
  const brapi = useBrapiQuotes(b3Syms);
  const yh = useYahooQuotes(yhSyms);

  const virtualizer = useVirtualizer({ count: favs.length, getScrollElement: () => scrollRef.current, estimateSize: () => 46, overscan: 10 });

  if (m.loading && !m.data.length) return <Skeleton className="h-64" />;
  if (m.error && !m.data.length) return <ErrorBox message={m.error} onRetry={m.reload} />;
  if (!favs.length) return <Empty title="Sem favoritos" hint="Favorite ativos no Radar (★) ou adicione pela busca abaixo." />;

  const destOf = (s: string) => `/monitor?symbol=${encodeURIComponent(s)}`;

  return (
    <div className="space-y-3">
      <Panel>
        <PanelTitle>Favoritos — ordenação manual ({favs.length})</PanelTitle>
        <div ref={scrollRef} className="max-h-[64vh] overflow-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const s = favs[v.index];
              const i = v.index;
              const d = m.data.find((x) => x.symbol === s);
              const sc = a.bySym.get(s);
              const b = brapi.map.get(s);
              const y = yh.map.get(s);
              const price = d?.price ?? b?.price ?? y?.price ?? null;
              const chg = d?.change24h ?? b?.change ?? y?.changePct ?? null;
              return (
                <div
                  key={s}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${v.size}px`, transform: `translateY(${v.start}px)` }}
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-1 py-2 text-sm"
                >
                  <span className="tabular w-6 text-muted">{i + 1}</span>
                  <Link to={destOf(s)} className="w-24 truncate font-bold hover:underline">{s}</Link>
                  <span className="tabular">{price != null ? (d ? fmtUSD(price) : fmtNum(price)) : '…'}</span>
                  <span className="tabular" style={{ color: (chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{chg != null ? fmtPct(chg) : ''}</span>
                  {sc && <><ScoreAudit score={sc} /><Badge tone={sc.signal === 'BUY' ? 'up' : sc.signal === 'SELL' ? 'down' : 'warn'}>{sc.signal}</Badge><span className="text-xs text-muted">{a.regime.label}</span></>}
                  <span className="ml-auto flex gap-1">
                    <button disabled={i === 0} onClick={() => { const n = [...favs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; reorderFav(n); }} className="rounded border border-[var(--border)] px-2">↑</button>
                    <button disabled={i === favs.length - 1} onClick={() => { const n = [...favs]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; reorderFav(n); }} className="rounded border border-[var(--border)] px-2">↓</button>
                    <button onClick={() => toggleFav(s)} className="rounded border border-[var(--border)] px-2">★</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      <AssetSearch />
    </div>
  );
}
