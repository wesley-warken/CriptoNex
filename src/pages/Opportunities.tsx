import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { useUniverseCrypto, useUniverseStocks } from '@/services/universeHooks';
import { scanner, scoreStockSymbols, orderB3Queue, orderUsQueue, type ScanSnapshot, type StockScanItem } from '@/services/scanner';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { isActiveCoin, type UniverseCoin } from '@/services/universeTypes';
import type { OpportunityScore } from '@/types';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox, Empty } from '@/components/ui/kit';
import { ScoreAudit } from '@/components/analysis/ScoreAudit';
import { rankOpportunities, topCategories } from '@/engine/ranking';

type Segment = 'ALL' | 'CRYPTO' | 'B3' | 'US' | 'MINE';

const yahooOf = (symbol: string): string => {
  if (symbol.includes('.') || symbol.includes('=') || symbol.startsWith('^')) return symbol;
  if (/^[A-Z]{4}[346]$/.test(symbol)) return `${symbol}.SA`;
  return symbol;
};

export function Opportunities() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const a = useAnalysis(m.data, m.candles);
  const u = useUniverseCrypto();
  const su = useUniverseStocks();
  const customAssets = useStore((s) => s.customAssets);
  const watchlist = useStore((s) => s.watchlist);
  const positions = useStore((s) => s.operations);
  const [scan, setScan] = useState<ScanSnapshot | null>(null);
  const [segment, setSegment] = useState<Segment>('ALL');
  const [exchange, setExchange] = useState('ALL');
  const [minScore, setMinScore] = useState(60);
  const [minConf, setMinConf] = useState(0);
  const [signal, setSignal] = useState<'ALL' | 'BUY' | 'SELL' | 'NEUTRAL'>('ALL');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<OpportunityScore[]>([]);
  const [mineLoading, setMineLoading] = useState(false);

  useEffect(() => {
    const l = (s: ScanSnapshot) => setScan(s);
    scanner.listeners.add(l);
    void scanner.boot().then(() => setScan(scanner.snap()));
    return () => {
      scanner.listeners.delete(l);
    };
  }, []);

  // Base crypto: universo ativo por market cap
  const base: UniverseCoin[] = useMemo(
    () => u.coins.filter(isActiveCoin).sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0)),
    [u.coins],
  );
  useEffect(() => {
    if (base.length >= 50) void scanner.start(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.length > 0]);

  // Filas de ações (ordenadas no scanner: B3 líquidas e EUA megacaps primeiro)
  const b3Queue: StockScanItem[] = useMemo(() => orderB3Queue(su.b3), [su.b3]);
  const usQueue: StockScanItem[] = useMemo(() => orderUsQueue(su.us), [su.us]);

  // Fila única intercalada: megacaps EUA primeiro, depois B3 e EUA em blocos
  // alternados — os dois segmentos preenchem juntos desde o início.
  const allStocks = useMemo(() => {
    const mega = usQueue.slice(0, 30);
    const megaSet = new Set(mega.map((r) => r.symbol));
    const restUs = usQueue.filter((r) => !megaSet.has(r.symbol));
    const out: StockScanItem[] = [...mega];
    const CH = 50;
    const rounds = Math.max(Math.ceil(b3Queue.length / CH), Math.ceil(restUs.length / CH));
    for (let r = 0; r < rounds; r++) {
      out.push(...b3Queue.slice(r * CH, r * CH + CH), ...restUs.slice(r * CH, r * CH + CH));
    }
    return out;
  }, [b3Queue, usQueue]);
  useEffect(() => {
    if (b3Queue.length >= 50 && usQueue.length >= 100) void scanner.startStocks(allStocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b3Queue.length > 0, usQueue.length > 0]);

  // Meus ativos: watchlist + custom + portfolio, pontuados sob demanda
  const mineSyms = useMemo(() => {
    const set = new Set<string>();
    for (const s of watchlist) set.add(s);
    for (const c of customAssets) set.add(c.symbol);
    for (const p of positions) set.add(p.symbol);
    return [...set];
  }, [watchlist, customAssets, positions]);

  useEffect(() => {
    if (segment !== 'MINE' && segment !== 'ALL') return;
    let alive = true;
    (async () => {
      setMineLoading(true);
      try {
        const knownCrypto = new Set([...CRYPTO_ASSETS.map((x) => x.symbol), ...m.data.map((d) => d.symbol), ...a.scores.map((o) => o.symbol)]);
        const out: OpportunityScore[] = [];
        for (const o of a.scores) if (mineSyms.includes(o.symbol)) out.push(o);
        for (const o of scan?.results ?? []) if (mineSyms.includes(o.symbol) && !out.some((x) => x.symbol === o.symbol)) out.push(o);
        for (const o of scan?.stockResults ?? []) if (mineSyms.includes(o.symbol) && !out.some((x) => x.symbol === o.symbol)) out.push(o);
        const missing = mineSyms.filter((s) => !knownCrypto.has(s) && !out.some((x) => x.symbol === s));
        if (missing.length) {
          const fresh = await scoreStockSymbols(missing.slice(0, 60).map((s) => ({ symbol: s, yahoo: yahooOf(s), exchange: '', name: s })));
          for (const o of fresh) if (!out.some((x) => x.symbol === o.symbol)) out.push(o);
        }
        if (alive) setMine(out);
      } finally {
        if (alive) setMineLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, mineSyms.join(','), scan?.withScore, scan?.stock?.withScore]);

  const exchanges = useMemo(() => [...new Set(usQueue.map((r) => r.exchange))].sort(), [usQueue]);

  const cryptoAll: OpportunityScore[] = useMemo(() => {
    const engine = new Map(a.scores.map((o) => [o.symbol, o]));
    const out: OpportunityScore[] = [...a.scores];
    for (const o of scan?.results ?? []) if (!engine.has(o.symbol)) out.push(o);
    return out;
  }, [a.scores, scan]);
  const stocksAll: OpportunityScore[] = useMemo(() => [...(scan?.stockResults ?? [])], [scan]);
  const b3Set = useMemo(() => new Set(b3Queue.map((b) => b.symbol)), [b3Queue]);
  const usSet = useMemo(() => new Set(usQueue.map((r) => r.symbol)), [usQueue]);
  const b3All = useMemo(() => stocksAll.filter((o) => b3Set.has(o.symbol)), [stocksAll, b3Set]);
  const usAll = useMemo(
    () => stocksAll.filter((o) => usSet.has(o.symbol) && (exchange === 'ALL' ? true : usQueue.find((r) => r.symbol === o.symbol)?.exchange === exchange)),
    [stocksAll, usSet, usQueue, exchange],
  );

  const pool: OpportunityScore[] = useMemo(() => {
    if (segment === 'CRYPTO') return cryptoAll;
    if (segment === 'B3') return b3All;
    if (segment === 'US') return usAll;
    if (segment === 'MINE') return mine;
    const seen = new Map(cryptoAll.map((o) => [o.symbol, o]));
    for (const o of stocksAll) if (!seen.has(o.symbol)) seen.set(o.symbol, o);
    for (const o of mine) if (!seen.has(o.symbol)) seen.set(o.symbol, o);
    return [...seen.values()];
  }, [segment, cryptoAll, stocksAll, b3All, usAll, mine]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? pool.filter((o) => o.symbol.toLowerCase().includes(needle)) : pool),
    [pool, needle],
  );
  const ranked = rankOpportunities(filtered, { minScore, minConfidence: minConf, signal });
  const cats = topCategories(filtered.length ? filtered : a.scores);

  const pct = scan && scan.total ? Math.round((scan.scanned / scan.total) * 100) : 0;
  const spct = scan && scan.stock.total ? Math.round((scan.stock.scanned / scan.stock.total) * 100) : 0;
  const segLabel: Record<Segment, string> = { ALL: 'Todas', CRYPTO: 'Crypto', B3: 'B3', US: 'EUA', MINE: 'Meus ativos' };
  const segCount: Record<Segment, number> = { ALL: cryptoAll.length + stocksAll.length, CRYPTO: cryptoAll.length, B3: b3All.length, US: usAll.length, MINE: mine.length };

  // ETA da varredura ativa (taxa observada)
  const t0 = useRef(0);
  const anyRunning = !!scan?.running || !!scan?.stock.running;
  useEffect(() => {
    if (anyRunning && !t0.current) t0.current = Date.now();
    if (!anyRunning) t0.current = 0;
  }, [anyRunning]);
  const eta = useMemo(() => {
    if (!scan || !t0.current) return '';
    const active = segment === 'B3' || segment === 'US' ? scan.stock : scan;
    const remaining = active.total - active.scanned;
    if (remaining <= 0 || !active.running) return '';
    const elapsedMin = Math.max((Date.now() - t0.current) / 60000, 1 / 60);
    const rate = active.scanned / elapsedMin;
    if (rate <= 0) return '';
    const mins = Math.ceil(remaining / rate);
    return mins < 1 ? 'menos de 1 min restante' : `≈ ${mins} min restantes (${Math.round(rate)}/min)`;
  }, [scan, segment]);

  if (m.loading && !pool.length) return <Skeleton className="h-96" />;
  if (m.error && !m.data.length && !pool.length) return <ErrorBox message={m.error} onRetry={() => { m.reload(); void scanner.start(base); }} />;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelTitle
          right={
            <span className="flex items-center gap-2 text-xs normal-case">
              {segment === 'B3' || segment === 'US' || segment === 'ALL' ? (
                scan && (scan.stock.total > 0 || scan.stock.running) ? (
                  <span>ações: {scan.stock.withScore.toLocaleString('pt-BR')} pontuadas ({spct}%)</span>
                ) : null
              ) : null}
              {(segment === 'CRYPTO' || segment === 'ALL') && scan && (
                <span>crypto: {scan.withScore.toLocaleString('pt-BR')} pontuadas ({pct}%)</span>
              )}
              {scan?.running ? (
                <button onClick={() => scanner.pause()} className="rounded border border-[var(--border)] px-2 py-0.5">Pausar</button>
              ) : (
                <button onClick={() => { void scanner.start(base); void scanner.startStocks(allStocks); }} className="rounded border border-[var(--border)] px-2 py-0.5">
                  Escanear
                </button>
              )}
            </span>
          }
        >
          Filtros de oportunidade
        </PanelTitle>
        {scan && (scan.running || scan.stock.running) && (
          <div className="mb-2 h-1.5 overflow-hidden rounded bg-[var(--surface-2)]">
            <div className="h-1.5 rounded bg-[var(--accent)] transition-all" style={{ width: `${segment === 'B3' || segment === 'US' ? spct : pct}%` }} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {(Object.keys(segLabel) as Segment[]).map((s) => (
              <button key={s} onClick={() => setSegment(s)} className={s === segment ? 'bg-[var(--accent)] px-3 py-1.5 font-bold text-black' : 'px-3 py-1.5 text-muted'}>
                {segLabel[s]} <span className="tabular text-xs opacity-80">({segCount[s].toLocaleString('pt-BR')})</span>
              </button>
            ))}
          </div>
          {segment === 'US' && (
            <label>Bolsa <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1"><option value="ALL">Todas</option>{exchanges.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          )}
          <label>Buscar <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="símbolo…" className="w-28 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" /></label>
          <label>Score ≥ <input type="number" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" /></label>
          <label>Confiança ≥ <input type="number" value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" />%</label>
          <label>Sinal <select value={signal} onChange={(e) => setSignal(e.target.value as typeof signal)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1"><option value="ALL">Todos</option><option value="BUY">BUY</option><option value="SELL">SELL</option><option value="NEUTRAL">NEUTRAL</option></select></label>
          <span className="text-muted">Regime atual: {a.regime.label}</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          {segment === 'MINE' && mineLoading ? 'Pontuando seus ativos…' : `Ranking sobre ${pool.length.toLocaleString('pt-BR')} ativos pontuados no segmento ${segLabel[segment]}.`}
          {' '}{segment === 'CRYPTO' || segment === 'ALL' ? 'Scores parciais de crypto (sem volume/OHLC) mostram DQ ≤ 50 — abra a auditoria do score para ver.' : 'Ações usam candles completos do Yahoo (OHLC + volume).'}
          {eta && <span> Varredura em andamento: {eta}.</span>}
        </div>
      </Panel>
      <Panel>
        <PanelTitle>Ranking — {ranked.length.toLocaleString('pt-BR')} ativos</PanelTitle>
        {!ranked.length && <Empty title="Nada no filtro" hint="Baixe o Score mínimo, troque o segmento ou aguarde a varredura." />}
        <div className="max-h-[60vh] overflow-auto">
          {ranked.slice(0, 400).map((o, i) => (
            <div key={o.symbol} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-2 text-sm">
                <span className="tabular w-10 text-muted">#{i + 1}</span>
                <Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="w-20 truncate font-bold hover:underline">{o.symbol}</Link>
                <ScoreAudit score={o} />
                <span className="text-xs text-muted">{o.classification} · conf {o.confidence}% · DQ {o.dataQuality}%</span>
                <Badge tone={o.signal === 'BUY' ? 'up' : o.signal === 'SELL' ? 'down' : 'warn'}>{o.signal}</Badge>
                {o.dataQuality < 55 && <Badge tone="warn">⚠ parcial</Badge>}
              </div>
            ))}
          {ranked.length > 400 && <div className="py-2 text-center text-xs text-muted">Mostrando top 400 de {ranked.length.toLocaleString('pt-BR')} — refine os filtros.</div>}
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(cats).map(([k, v]) => (
          <Panel key={k}><PanelTitle>{k}</PanelTitle>{v.map((o) => <div key={o.symbol} className="flex justify-between py-1 text-sm"><Link to={`/monitor?symbol=${encodeURIComponent(o.symbol)}`} className="font-semibold hover:underline">{o.symbol}</Link><span className="tabular">{o.score}</span></div>)}</Panel>
        ))}
      </div>
    </div>
  );
}
