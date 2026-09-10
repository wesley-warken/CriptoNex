import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { useUniverseStocks } from '@/services/universeHooks';
import { useBubbleFeed } from '@/services/bubbles';
import { useStore } from '@/stores/useStore';
import { useBrapiQuotes } from '@/services/stockQuotes';
import { yahooChart } from '@/services/lookup';
import { US_MEGACAPS } from '@/services/scanner';
import type { BubbleCoin } from '@/services/bubbles';
import { Panel, PanelTitle, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { fmtPct, fmtNum } from '@/lib/format';
import { companyLogo, avatarLetters } from '@/lib/logos';

type Seg = 'CRYPTO' | 'EUA' | 'BRASIL';
type TF = '1H' | '1D' | '1S' | '1M' | '1A';
type ColorMode = 'VAR' | 'SIZE';
type SizeMode = 'MCAP' | 'PERF';

interface Bubble {
  key: string;
  label: string;
  sub: string;
  size: number;
  change: number | null;
  price: number | null;
  image?: string;
  symbol: string;
}

interface StockAgg {
  symbol: string;
  name: string;
  price: number | null;
  c1d: number | null;
  c7d: number | null;
  c30d: number | null;
  c1y: number | null;
  moneyVol: number | null;
  mcap: number | null;
  logo?: string | null;
}

function BubbleAvatar({ image, label, size }: { image?: string | null; label: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed && size > 18) {
    return (
      <img
        src={image} alt="" loading="lazy" className="rounded-full bg-black/40"
        style={{ width: size * 0.52, height: size * 0.52 }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold"
      style={{ width: size * 0.52, height: size * 0.52, fontSize: size * 0.24, background: 'rgba(255,255,255,0.12)', color: '#fff' }}
    >
      {avatarLetters(label)}
    </span>
  );
}

async function mapPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

function useStockBubbles(seg: Seg) {
  const su = useUniverseStocks();
  const customAssets = useStore((s) => s.customAssets);
  const watchlist = useStore((s) => s.watchlist);
  const [rows, setRows] = useState<StockAgg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const b3syms = useMemo(
    () => (seg === 'BRASIL' ? [...su.b3].sort((x, y) => (x.symbol.length <= 6 ? 0 : 1) - (y.symbol.length <= 6 ? 0 : 1) || x.symbol.localeCompare(y.symbol)).slice(0, 150).map((b) => b.symbol) : []),
    [seg, su.b3],
  );
  const [stockProg, setStockProg] = useState({ done: 0, total: 0 });
  const brapi = useBrapiQuotes(b3syms);
  const b3Names = useMemo(() => Object.fromEntries(su.b3.map((b) => [b.symbol, b.name])), [su.b3]);
  const [extraBR, setExtraBR] = useState<Record<string, Partial<StockAgg>>>({});
  const enrichedRef = useRef(new Set<string>());

  const rowsBR = useMemo<StockAgg[]>(
    () => {
      const liquid = (s: string) => (/^[A-Z]{4}[346]$/.test(s) ? 0 : s.length <= 6 && /^[A-Z0-9]+$/.test(s) ? 1 : 2);
      return b3syms
        .filter((s) => brapi.map.has(s))
        .map((s) => {
          const q = brapi.map.get(s)!;
          return { symbol: s, name: q.name ?? b3Names[s] ?? s, price: q.price, c1d: q.change, c7d: null, c30d: null, c1y: null, moneyVol: null, mcap: q.marketCap ?? null, logo: companyLogo(s), ...(extraBR[s] ?? {}) };
        })
        .sort((x, y) => liquid(x.symbol) - liquid(y.symbol) || x.symbol.localeCompare(y.symbol));
    },
    [b3syms, brapi.map, b3Names, extraBR],
  );

  useEffect(() => {
    if (seg !== 'BRASIL') {
      enrichedRef.current.clear();
      return;
    }
    let alive = true;
    (async () => {
      const top = rowsBR.filter((r) => !enrichedRef.current.has(r.symbol));
      if (!top.length) return;
      const extra = await mapPool(top, 6, async (r) => {
        try {
          const h = await yahooChart(`${r.symbol}.SA`, '1y', '1d');
          const c = h.candles.map((k) => k.close);
          const vols = h.candles.map((k) => k.volume);
          if (c.length < 8) return null;
          const last = c[c.length - 1];
          const at = (n: number) => (c.length > n ? ((last / c[c.length - 1 - n] - 1) * 100) : null);
          const avgV = vols.length ? vols.slice(-30).reduce((x, y) => x + y, 0) / Math.min(30, vols.length) : null;
          return { symbol: r.symbol, c7d: at(7), c30d: at(30), c1y: at(365), moneyVol: avgV != null && last ? last * avgV : null };
        } catch {
          return null;
        }
      });
      if (!alive) return;
      const patch: Record<string, Partial<StockAgg>> = {};
      for (const e of extra) if (e) { patch[e.symbol] = e; enrichedRef.current.add(e.symbol); }
      if (Object.keys(patch).length) setExtraBR((prev) => ({ ...prev, ...patch }));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, b3syms.join(',')]);

  useEffect(() => {
    if (seg !== 'EUA') return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const mine = [...customAssets.filter((c) => c.kind === 'stock').map((c) => c.symbol), ...watchlist.filter((s) => !/^[A-Z]{4}[346]$/.test(s) && (s.includes('.') || US_MEGACAPS.includes(s)))];
          // Top ~300: megacaps + achados + restante da lista em ordem (com progresso)
          const rest = su.us.map((r) => r.symbol).filter((s) => !US_MEGACAPS.includes(s) && !mine.includes(s));
          const syms = [...new Set([...US_MEGACAPS, ...mine, ...rest])].slice(0, 300);
          setStockProg({ done: 0, total: syms.length });
          const acc: StockAgg[] = [];
          for (let i = 0; i < syms.length; i += 6) {
            if (!alive) return;
            const batch = await Promise.all(syms.slice(i, i + 6).map(async (s): Promise<StockAgg | null> => {
            try {
              const [mo, yr] = await Promise.all([yahooChart(s, '1mo', '1d'), yahooChart(s, '1y', '1wk')]);
              const c = mo.candles.map((k) => k.close);
              const w = yr.candles.map((k) => k.close);
              if (!c.length) return null;
              const last = c[c.length - 1];
              const at = (arr: number[], n: number) => (arr.length > n ? ((last / arr[arr.length - 1 - n] - 1) * 100) : null);
              const vols = mo.candles.map((k) => k.volume);
              const avgV = vols.length ? vols.reduce((x, y) => x + y, 0) / vols.length : null;
              return {
                symbol: s, name: s, price: last,
                c1d: mo.changePct ?? at(c, 1), c7d: at(c, 7), c30d: c.length > 1 ? ((last / c[0] - 1) * 100) : null,
                c1y: w.length > 1 ? ((w[w.length - 1] / w[0] - 1) * 100) : null,
                moneyVol: avgV != null ? last * avgV : null, mcap: null, logo: companyLogo(s),
              };
            } catch {
              return null;
            }
          }));
            for (const b of batch) if (b) acc.push(b);
            if (alive) {
              setRows([...acc]);
              setStockProg({ done: Math.min(i + 6, syms.length), total: syms.length });
            }
          }
          if (alive && !acc.length) setError('Nenhuma cotação EUA retornou (Yahoo instável). Tente de novo em instantes.');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Falha');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, su.b3.length > 0, su.us.length > 0]);

  // BRASIL usa as cotações do hook (Brapi em lote + fallback Yahoo)
  useEffect(() => {
    if (seg === 'BRASIL') {
      setError(null);
      setLoading(rowsBR.length === 0 && (brapi.loading || brapi.pending > 0));
      setRows(rowsBR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, rowsBR]);

  return { rows, loading, error, progress: stockProg };
}

const TFS: TF[] = ['1H', '1D', '1S', '1M', '1A'];

export function Bubbles() {
  const feed = useBubbleFeed();
  const nav = useNavigate();
  const [seg, setSeg] = useState<Seg>('CRYPTO');
  const [tf, setTf] = useState<TF>('1D');
  const [rank, setRank] = useState('0');
  const [colorMode, setColorMode] = useState<ColorMode>('VAR');
  const [sizeMode, setSizeMode] = useState<SizeMode>('PERF');
  const [q, setQ] = useState('');
  const stocks = useStockBubbles(seg);

  const cryptoBubbles: Bubble[] = useMemo(() => {
    const list = [...feed.coins].filter((c) => (c.mcap ?? 0) > 0).sort((x, y) => (y.mcap ?? 0) - (x.mcap ?? 0));
    const needle = q.trim().toLowerCase();
    const filt = needle ? list.filter((c) => c.symbol.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle)) : list.slice(Number(rank), Number(rank) + 100);
    const chg = (c: BubbleCoin) => (tf === '1H' ? c.c1h : tf === '1D' ? c.c24 : tf === '1S' ? c.c7d : tf === '1M' ? c.c30d : c.c1y);
    const withSize = filt.slice(0, 100).map((c) => ({ c, v: Math.abs(chg(c) ?? 0) }));
    const maxV = Math.max(...withSize.map((x) => x.v), 0.01);
    return withSize.map(({ c, v }) => ({
      key: c.id, label: c.symbol, sub: `${fmtPct(chg(c) ?? 0)}`,
      size: sizeMode === 'PERF' ? 1 + Math.sqrt(v / maxV) * 999 : Math.max(c.mcap ?? 0, 1),
      change: chg(c), price: c.price, image: c.image, symbol: c.symbol,
    }));
  }, [feed.coins, tf, rank, q, sizeMode]);

  const stockBubbles: Bubble[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle ? stocks.rows.filter((r) => r.symbol.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)) : stocks.rows.slice(Number(rank), Number(rank) + 100);
    const chg = (r: StockAgg) => (tf === '1D' ? r.c1d : tf === '1S' ? r.c7d : tf === '1M' ? r.c30d : tf === '1A' ? r.c1y : r.c1d);
    const withSize = rows.slice(0, 100).map((r) => ({ r, v: Math.abs(chg(r) ?? 0) }));
    const maxV = Math.max(...withSize.map((x) => x.v), 0.01);
    const maxFallback = Math.max(...withSize.map((x) => x.r.moneyVol ?? x.r.mcap ?? 0), 1);
    return withSize.map(({ r, v }) => ({
      key: r.symbol, label: r.symbol.length > 8 ? r.symbol.slice(0, 8) : r.symbol,
      size: sizeMode === 'PERF'
        ? (v > 0 ? 1 + Math.sqrt(v / maxV) * 999 : 1 + Math.sqrt((r.moneyVol ?? r.mcap ?? 0) / maxFallback) * 999)
        : Math.max(r.moneyVol ?? r.mcap ?? 1, 1),
      change: chg(r), price: r.price, symbol: r.symbol, image: r.logo ?? undefined,
    })).map((b) => ({ ...b, sub: fmtPct(b.change ?? 0) }));
  }, [stocks.rows, tf, rank, q, sizeMode]);

  const bubbles = seg === 'CRYPTO' ? cryptoBubbles : stockBubbles;
  const packed = useMemo(() => {
    if (!bubbles.length) return [];
    const root = d3.hierarchy({ children: bubbles } as unknown as { children: Bubble[] }).sum((d) => (d as unknown as Bubble).size);
    const pack = d3.pack<Bubble>().size([1000, 620]).padding(4);
    const p = pack(root as unknown as d3.HierarchyCircularNode<Bubble>);
    return (p.leaves() as unknown as { x: number; y: number; r: number; data: Bubble }[]).map((l) => ({ ...l }));
  }, [bubbles]);

  const maxSize = Math.max(...bubbles.map((b) => b.size), 1);
  const baseColor = (b: Bubble) => ((b.change ?? 0) >= 0 ? '52,211,153' : '251,113,133');
  const colorOf = (b: Bubble) => {
    if (colorMode === 'SIZE') {
      const t = Math.log10(b.size + 1) / Math.log10(maxSize + 1);
      return `rgba(34,211,238,${0.25 + t * 0.6})`;
    }
    const v = b.change ?? 0;
    return `rgba(${baseColor(b)},${0.3 + Math.min(0.55, Math.abs(v) / 14)})`;
  };
  const glowOf = (b: Bubble) => {
    if (colorMode === 'SIZE') return '0 0 22px rgba(34,211,238,0.35)';
    const v = Math.min(0.65, Math.abs(b.change ?? 0) / 12);
    return `0 0 ${18 + v * 30}px rgba(${baseColor(b)},${0.35 + v * 0.5})`;
  };

  const loading = seg === 'CRYPTO' ? feed.loading && !feed.coins.length : stocks.loading && !stocks.rows.length;
  const err = seg === 'CRYPTO' ? (feed.error && !feed.coins.length ? feed.error : null) : stocks.error;
  if (loading) return <Skeleton className="h-96" />;
  if (err) return <ErrorBox message={err} onRetry={() => (seg === 'CRYPTO' ? feed.reload() : window.location.reload())} />;
  const feedBadge = seg === 'CRYPTO' && feed.coins.length > 0 && (
    <span className="text-xs normal-case text-muted">
      fonte: {feed.source === 'gecko' ? 'CoinGecko' : feed.source === 'paprika' ? 'CoinPaprika' : 'CoinLore'}
      {feed.stale ? ' · cache' : ''} · {feed.coins.length.toLocaleString('pt-BR')} moedas
    </span>
  );

  const sizeLabel = seg === 'CRYPTO'
    ? (sizeMode === 'PERF' ? `valorização ${tf}` : 'market cap')
    : (sizeMode === 'PERF' ? `valorização ${tf}` : 'volume financeiro 24h');
  return (
    <Fullscreen title={`Bubbles — quanto maior, maior a valorização · cor = ${tf}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        {(['CRYPTO', 'EUA', 'BRASIL'] as Seg[]).map((s) => (
          <button key={s} onClick={() => setSeg(s)} className={s === seg ? 'rounded bg-[var(--accent)] px-3 py-1 font-bold text-black' : 'rounded border border-[var(--border)] px-3 py-1 text-muted'}>
            {s === 'CRYPTO' ? 'Crypto' : s === 'EUA' ? 'EUA' : 'Brasil'}
          </button>
        ))}
        <select value={rank} onChange={(e) => setRank(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
          <option value="0">Top 100</option>
          <option value="100">101–200</option>
          <option value="200">201–300</option>
        </select>
        {TFS.filter((t) => seg === 'CRYPTO' || t !== '1H').map((t) => (
          <button key={t} onClick={() => setTf(t)} className={t === tf ? 'rounded bg-[var(--accent)] px-2 py-1 font-bold text-black' : 'rounded border border-[var(--border)] px-2 py-1 text-muted'}>{t === '1S' ? '1S' : t}</button>
        ))}
        <div className="flex overflow-hidden rounded border border-[var(--border)]">
          {(['VAR', 'SIZE'] as ColorMode[]).map((cm) => (
            <button key={cm} onClick={() => setColorMode(cm)} className={cm === colorMode ? 'bg-[var(--accent)] px-2 py-1 font-bold text-black' : 'px-2 py-1 text-muted'}>
              {cm === 'VAR' ? 'Variação' : seg === 'CRYPTO' ? 'Market Cap' : 'Volume'}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded border border-[var(--border)]" title="Tamanho da bolha">
          {(['MCAP', 'PERF'] as SizeMode[]).map((sm) => (
            <button key={sm} onClick={() => setSizeMode(sm)} className={sm === sizeMode ? 'bg-[var(--accent)] px-2 py-1 font-bold text-black' : 'px-2 py-1 text-muted'}>
              {sm === 'PERF' ? '📈 Valorização' : '⚖️ Tamanho'}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ativo…" className="ml-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1" />
        {feedBadge}
        {seg !== 'CRYPTO' && stocks.progress.total > 0 && stocks.rows.length < stocks.progress.total && (
          <span className="text-xs text-muted">carregando {stocks.rows.length}/{stocks.progress.total}…</span>
        )}
      </div>
      {!bubbles.length && <Empty title="Sem bolhas" hint="Aguarde carregar ou ajuste a busca." />}
      <div className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio: '1000 / 620', background: '#04070c' }}>
        {packed.map((l) => (
          <button
            key={l.data.key}
            title={`${l.data.label} · ${l.data.price != null ? fmtNum(l.data.price) : ''} · ${l.data.sub}`}
            onClick={() => nav(`/monitor?symbol=${encodeURIComponent(l.data.symbol)}`)}
            className="absolute flex flex-col items-center justify-center overflow-hidden rounded-full transition hover:scale-105"
            style={{
              left: `${(l.x / 1000) * 100}%`, top: `${(l.y / 620) * 100}%`,
              width: `${(l.r * 2 / 1000) * 100}%`, height: `${(l.r * 2 / 620) * 100}%`,
              background: `radial-gradient(circle at 50% 35%, ${colorOf(l.data)} 0%, rgba(4,7,12,0.55) 78%)`,
              boxShadow: `${glowOf(l.data)}, inset 0 0 ${Math.max(6, l.r / 4)}px rgba(0,0,0,0.55)`,
              border: `1px solid rgba(${baseColor(l.data)},0.5)`,
              color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            }}
          >
            {l.r > 14 ? (
              <BubbleAvatar image={l.data.image} label={l.data.label} size={l.r} />
            ) : null}
            <span className="font-bold leading-none" style={{ fontSize: Math.max(9, Math.min(30, l.r / 2.6)) }}>{l.data.label}</span>
            {l.r > 15 && <span className="tabular font-bold leading-tight" style={{ fontSize: Math.max(8, Math.min(22, l.r / 3.1)) }}>{l.data.sub}</span>}
          </button>
        ))}
      </div>
      <Panel><PanelTitle>Legenda</PanelTitle><div className="text-xs text-muted">Tamanho = {sizeLabel} · verde = alta no período, vermelho = queda · clique abre a análise no Monitor.</div></Panel>
    </Fullscreen>
  );
}
