import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';
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
  if (!favs.length) return <MEmpty title="Sem favoritos" hint="Favorite ativos no Radar ou adicione pela busca abaixo." />;

  const destOf = (s: string) => `/monitor?symbol=${encodeURIComponent(s)}`;

  return (
    <div className="space-y-3">
      <MSection title={`Favoritos — ordenação manual (${favs.length})`}>
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
                  className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-1 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
                >
                  <span className="w-6 tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                  <Link to={destOf(s)} className="w-24 truncate font-bold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline active:scale-[0.98]">{s}</Link>
                  <span className="tabular-nums text-[var(--text-primary)]">{price != null ? (d ? fmtUSD(price) : fmtNum(price)) : <span className="text-[var(--text-muted)]">—</span>}</span>
                  <span className={`tabular-nums font-medium ${(chg ?? 0) >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>{chg != null ? fmtPct(chg) : <span className="text-[var(--text-muted)]">—</span>}</span>
                  {sc && <><ScoreAudit score={sc} /><span className={`text-xs font-semibold ${sc.signal === 'BUY' ? 'text-[var(--bull)]' : sc.signal === 'SELL' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'}`}>{sc.signal}</span><span className="text-xs text-[var(--text-muted)]">{a.regime.label}</span></>}
                  <span className="ml-auto flex items-center gap-1">
                    <button aria-label="Mover para cima" disabled={i === 0} onClick={() => { const n = [...favs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; reorderFav(n); }} className="p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98] disabled:opacity-40"><ChevronUp className="h-4 w-4" /></button>
                    <button aria-label="Mover para baixo" disabled={i === favs.length - 1} onClick={() => { const n = [...favs]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; reorderFav(n); }} className="p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98] disabled:opacity-40"><ChevronDown className="h-4 w-4" /></button>
                    <button aria-label="Remover dos favoritos" aria-pressed="true" onClick={() => toggleFav(s)} className="p-1 text-amber-500 transition-colors duration-150 ease-out active:scale-[0.98]"><Star className="h-4 w-4" fill="currentColor" aria-hidden="true" /></button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </MSection>
      <AssetSearch />
    </div>
  );
}
