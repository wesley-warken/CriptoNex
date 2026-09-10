import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUniverseStocks } from '@/services/universeHooks';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { yahooChart } from '@/services/lookup';
import { snapshot } from '@/engine/indicators';
import { buildSignals } from '@/engine/signals';
import { scoreAsset } from '@/engine/scoring';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { CandleChart } from '@/components/charts/CandleChart';
import { AssetSearch } from '@/components/analysis/AssetSearch';
import { useStore } from '@/stores/useStore';
import type { Candle } from '@/types';
import type { StockEntry } from '@/services/universeTypes';
import { fmtNum, fmtPct } from '@/lib/format';

type Seg = 'B3' | 'EUA' | 'MEUS';
const ROW_H = 40;

function useDebounced<T>(v: T, ms = 300): T {
  const [v2, setV2] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setV2(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return v2;
}

export function Stocks() {
  const uni = useUniverseStocks();
  const sectors = useStore((s) => s.sectors);
  const set = useStore((s) => s.set);
  const customAssets = useStore((s) => s.customAssets);
  const removeCustomAsset = useStore((s) => s.removeCustomAsset);
  const addOperation = useStore((s) => s.addOperation);
  const [seg, setSeg] = useState<Seg>('B3');
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('ALL');
  const [exchange, setExchange] = useState('ALL');
  const [symbol, setSymbol] = useState('PETR4');
  const [count, setCount] = useState(400);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    const ps = params.get('symbol');
    if (!ps) return;
    const s = ps.toUpperCase();
    setSymbol(s);
    if (uni.b3.some((b) => b.symbol === s)) setSeg('B3');
    else if (uni.us.some((x) => x.symbol === s)) setSeg('EUA');
    else setSeg('MEUS');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const qd = useDebounced(q);

  const b3rows: StockEntry[] = useMemo(() => {
    const needle = qd.trim().toLowerCase();
    return uni.b3
      .filter((a) => (sector === 'ALL' ? true : (sectors[a.symbol] ?? a.sector ?? '') === sector))
      .filter((a) => (needle ? a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) : true));
  }, [uni.b3, qd, sector, sectors]);

  const usrows = useMemo(() => {
    const needle = qd.trim().toLowerCase();
    return uni.us
      .filter((a) => (exchange === 'ALL' ? true : a.exchange === exchange))
      .filter((a) => (needle ? a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) : true))
      .map((a) => ({ symbol: a.symbol, name: a.name, exchange: a.exchange, kind: 'stock' as const }));
  }, [uni.us, qd, exchange]);

  const myrows: StockEntry[] = useMemo(() => {
    const needle = qd.trim().toLowerCase();
    return customAssets.filter((a) => (needle ? a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) : true));
  }, [customAssets, qd]);

  const rows = seg === 'B3' ? b3rows : seg === 'EUA' ? usrows : myrows;
  const sectorsList = useMemo(() => [...new Set(uni.b3.map((a) => sectors[a.symbol] ?? a.sector ?? 'Outros'))].sort(), [uni.b3, sectors]);
  const exchanges = useMemo(() => [...new Set(uni.us.map((a) => a.exchange))].sort(), [uni.us]);

  useEffect(() => {
    setCount(400);
  }, [seg, qd, sector, exchange]);

  const shown = useMemo(() => rows.slice(0, count), [rows, count]);
  const virtualizer = useVirtualizer({ count: shown.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 10 });
  const vItems = virtualizer.getVirtualItems();
  const winSyms = useMemo(() => {
    if (!vItems.length) return [];
    const lo = Math.max(0, vItems[0].index - 4);
    const hi = Math.min(shown.length - 1, vItems[vItems.length - 1].index + 4);
    return shown.slice(lo, hi + 1).map((r) => r.symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vItems.map((v) => v.index).join(','), shown]);

  const isB3Sym = (s: string) => uni.b3.some((b) => b.symbol === s) || /[34]$/.test(s);
  const b3win = useMemo(() => winSyms.filter(isB3Sym), [winSyms, uni.b3]);
  const yhwin = useMemo(() => winSyms.filter((s) => !isB3Sym(s)), [winSyms, uni.b3]);
  const brapi = useBrapiQuotes(seg === 'B3' || seg === 'MEUS' ? b3win : []);
  const yh = useYahooQuotes(seg === 'EUA' || seg === 'MEUS' ? yhwin : []);

  const quoteOf = (s: string): { price: number | null; chg: number | null } => {
    const b = brapi.map.get(s);
    if (b) return { price: b.price, chg: b.change };
    const y = yh.map.get(s);
    if (y) return { price: y.price, chg: y.changePct };
    return { price: null, chg: null };
  };

  // Detalhe do ativo selecionado (análise preservada)
  const [candles, setCandles] = useState<Candle[]>([]);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      setDLoading(true);
      setDError(null);
      try {
        const ysym = isB3Sym(symbol) && !symbol.includes('.') ? `${symbol}.SA` : symbol;
        const qq = await yahooChart(ysym, '1y', '1d');
        if (alive) setCandles(qq.candles);
      } catch (e) {
        if (alive) setDError(e instanceof Error ? e.message : 'Fonte de ações indisponível. Tente de novo.');
      } finally {
        if (alive) setDLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);
  const snap = useMemo(() => (candles.length ? snapshot(candles) : null), [candles]);
  const sig = useMemo(() => (candles.length ? buildSignals(candles, snap ?? undefined) : null), [candles, snap]);
  const score = useMemo(() => (candles.length ? scoreAsset({ symbol, candles }) : null), [candles, symbol]);
  const last = candles.length ? candles[candles.length - 1].close : quoteOf(symbol).price;

  if (uni.loading && !uni.b3.length) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm">
          {(['B3', 'EUA', 'MEUS'] as Seg[]).map((s) => (
            <button key={s} onClick={() => setSeg(s)} className={s === seg ? 'bg-[var(--accent)] px-4 py-1.5 font-bold text-black' : 'px-4 py-1.5 text-muted'}>
              {s === 'MEUS' ? 'Meus ativos' : s}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={seg === 'EUA' ? 'Buscar 9 mil tickers EUA…' : 'Buscar por nome/símbolo…'} className="min-w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm" />
        {seg === 'B3' && (
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm">
            <option value="ALL">Todos os setores</option>
            {sectorsList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {seg === 'EUA' && (
          <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm">
            <option value="ALL">Todas as bolsas</option>
            {exchanges.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="text-xs text-muted">
          {seg === 'B3' && `${uni.b3.length.toLocaleString('pt-BR')} tickers B3 (lote Brapi)${brapi.pending > 0 ? ` · atualizando ${brapi.pending}…` : ''}`}
          {seg === 'EUA' && `${uni.us.length.toLocaleString('pt-BR')} tickers EUA (Nasdaq Trader)${yh.pending > 0 ? ` · atualizando ${yh.pending}…` : ''}`}
          {seg === 'MEUS' && `${myrows.length} ativos adicionados via busca`}
        </span>
      </div>

      {uni.error && <ErrorBox message={uni.error} onRetry={uni.reload} />}

      <div className="grid gap-3 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelTitle>
            {seg === 'B3' ? `B3 — ${rows.length.toLocaleString('pt-BR')}` : seg === 'EUA' ? `EUA — ${rows.length.toLocaleString('pt-BR')}` : `Meus ativos — ${rows.length}`}
          </PanelTitle>
          {seg === 'MEUS' && <div className="mb-2"><AssetSearch compact /></div>}
          {!rows.length ? (
            <Empty title={seg === 'MEUS' ? 'Nenhum ativo adicionado' : 'Nada encontrado'} hint={seg === 'MEUS' ? 'Use a busca acima (TSM, ^BVSP, GC=F…).' : 'Ajuste busca/filtros.'} />
          ) : (
            <>
              <div className="grid grid-cols-[7rem_1fr_6rem_6rem_7rem] gap-1 px-2 text-xs text-muted">
                <span className="font-semibold">Símbolo</span><span className="font-semibold">Nome</span><span className="font-semibold">Preço</span><span className="font-semibold">Var</span><span className="font-semibold">Ações</span>
              </div>
              <div
                ref={scrollRef}
                className="max-h-[52vh] overflow-auto"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) setCount((c) => (c < rows.length ? c + 400 : c));
                }}
              >
                <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {vItems.map((v) => {
                    const r = shown[v.index];
                    const qq = quoteOf(r.symbol);
                    return (
                      <div
                        key={r.symbol}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${v.size}px`, transform: `translateY(${v.start}px)` }}
                        className={`grid grid-cols-[7rem_1fr_6rem_6rem_7rem] items-center gap-1 border-t border-[var(--border)] px-2 text-sm hover:bg-[var(--surface-2)] ${r.symbol === symbol ? 'bg-[var(--surface-2)]' : ''}`}
                      >
                        <button onClick={() => setSymbol(r.symbol)} className="truncate text-left font-bold hover:underline" title="Analisar">{r.symbol}</button>
                        <span className="truncate text-xs text-muted">{r.name}</span>
                        <span className="tabular">{qq.price != null ? fmtNum(qq.price) : '—'}</span>
                        <span className="tabular" style={{ color: (qq.chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{qq.chg != null ? fmtPct(qq.chg) : '—'}</span>
                        <span className="flex gap-1 text-xs">
                          {seg === 'MEUS' && <button onClick={() => removeCustomAsset(r.symbol)} className="text-muted" title="Remover">✕</button>}
                          <button
                            onClick={() => addOperation({ id: `${Date.now()}`, walletId: 'main', kind: 'stock', symbol: r.symbol, side: 'buy', quantity: 1, price: qq.price ?? 0, date: new Date().toISOString().slice(0, 10), note: r.name })}
                            className="text-muted hover:text-[var(--accent)]"
                            title="Enviar ao portfolio (1 un.)"
                          >
                            → Port
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {count < rows.length && (
                <button onClick={() => setCount((c) => c + 400)} className="mt-2 w-full rounded-lg border border-[var(--border)] py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
                  Carregar mais 400 ({(rows.length - count).toLocaleString('pt-BR')} restantes)
                </button>
              )}
            </>
          )}
        </Panel>

        <div className="space-y-3 xl:col-span-2">
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-lg">{symbol}</strong>
              <span className="tabular">{last != null ? fmtNum(last) : '—'}</span>
              {score && <><ScoreAudit score={score} /><Badge tone={score.signal === 'BUY' ? 'up' : score.signal === 'SELL' ? 'down' : 'warn'}>{score.signal} · {score.confidence}%</Badge></>}
              <label className="ml-auto text-xs text-muted">
                Setor:{' '}
                <input value={sectors[symbol] ?? ''} onChange={(e) => set({ sectors: { ...sectors, [symbol]: e.target.value } })} className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 py-0.5" />
              </label>
            </div>
          </Panel>
          {dLoading && <Skeleton className="h-72" />}
          {dError && <ErrorBox message={dError} onRetry={() => setSymbol((s) => `${s}`)} />}
          {!dLoading && !dError && (
            <>
              <CandleChart candles={candles} height={300} />
              <Panel>
                <PanelTitle>Sinais</PanelTitle>
                {sig?.signals.map((s) => <div key={s.indicator} className="flex justify-between py-1 text-sm"><span className="text-muted">{s.indicator}</span><Badge tone={s.signal === 'BUY' ? 'up' : s.signal === 'SELL' ? 'down' : 'warn'}>{s.signal}</Badge></div>)}
              </Panel>
              <Panel>
                <PanelTitle>Por quê / riscos</PanelTitle>
                <ul className="list-disc pl-5 text-sm">{score?.why.map((w) => <li key={w}>{w}</li>)}</ul>
                <ul className="list-disc pl-5 text-sm text-muted">{score?.risks.map((w) => <li key={w}>{w}</li>)}</ul>
              </Panel>
            </>
          )}
        </div>
      </div>

      <AssetSearch />
    </div>
  );
}
