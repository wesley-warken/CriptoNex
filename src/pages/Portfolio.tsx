import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { useLookup } from '@/components/analysis/AssetSearch';
import { yahooChart } from '@/services/lookup';
import { fearGreed } from '@/services/providers/sentiment';
import { binanceKlines } from '@/services/providers/binance';
import { summarize, totals, type Operation, type OpSide } from '@/lib/portfolio';
import { getFxRates, convert, fmtMoney, type Fiat, type FxRates } from '@/services/fx';
import { Panel, PanelTitle, Skeleton, ErrorBox, Empty, Badge } from '@/components/ui/kit';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { Sparkline } from '@/components/charts/Sparkline';
import { fmtPct } from '@/lib/format';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const isB3Like = (s: string) => (/^[A-Z]{4}[346]$/.test(s) && !s.includes('.')) || s.endsWith('.SA');
const nativeCcy = (s: string): Fiat => (isB3Like(s) ? 'BRL' : 'USD');
const DEFAULT_FX: FxRates = { USDBRL: 5, EURUSD: 1.08, GBPUSD: 1.27, ts: 0 };

export function Portfolio() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const operations = useStore((s) => s.operations);
  const wallets = useStore((s) => s.wallets);
  const method = useStore((s) => s.portfolioMethod);
  const set = useStore((s) => s.set);
  const displayCcy = (useStore((s) => s.currency) as Fiat) || 'USD';
  const addOperation = useStore((s) => s.addOperation);
  const updateOperation = useStore((s) => s.updateOperation);
  const removeOperation = useStore((s) => s.removeOperation);
  const addWallet = useStore((s) => s.addWallet);
  const renameWallet = useStore((s) => s.renameWallet);
  const removeWallet = useStore((s) => s.removeWallet);
  const pendingOp = useStore((s) => s.pendingOp);
  const setPendingOp = useStore((s) => s.setPendingOp);

  // ---- filtros ----
  const [fWallet, setFWallet] = useState('ALL');
  const [fKind, setFKind] = useState<'ALL' | 'crypto' | 'stock'>('ALL');
  const [fText, setFText] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showWallets, setShowWallets] = useState(false);
  const [newWallet, setNewWallet] = useState('');

  // ---- form ----
  const [side, setSide] = useState<OpSide>('buy');
  const [walletId, setWalletId] = useState('main');
  const [kind, setKind] = useState<'crypto' | 'stock'>('crypto');
  const [symbol, setSymbol] = useState('BTC');
  const [price, setPrice] = useState('60000');
  const [qty, setQty] = useState('0.1');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lookupQ, setLookupQ] = useState('');
  const lookup = useLookup(lookupQ);

  // ---- fx ----
  const [fx, setFx] = useState<FxRates>(DEFAULT_FX);
  useEffect(() => {
    let alive = true;
    getFxRates().then((r) => alive && setFx(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const money = (usd: number) => fmtMoney(convert(usd, 'USD', displayCcy, fx), displayCcy);

  // ---- preços ao vivo (normalizados p/ USD) ----
  const stockSyms = useMemo(() => [...new Set(operations.filter((o) => o.kind === 'stock').map((o) => o.symbol))], [operations]);
  const b3Syms = useMemo(() => stockSyms.filter((s) => isB3Like(s)), [stockSyms]);
  const yhSyms = useMemo(() => stockSyms.filter((s) => !isB3Like(s)), [stockSyms, b3Syms]);
  const brapi = useBrapiQuotes(b3Syms);
  const yh = useYahooQuotes(yhSyms);
  const pricesUsd = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of m.data) map[d.symbol] = d.price;
    for (const [s, q] of brapi.map) if (q.price != null) map[s] = convert(q.price, 'BRL', 'USD', fx);
    for (const [s, q] of yh.map) {
      if (q.price == null) continue;
      const cur = q.currency?.toUpperCase() ?? 'USD';
      map[s] = cur === 'GBp' || cur === 'GBX' ? convert(q.price / 100, 'GBP', 'USD', fx) : cur === 'BRL' ? convert(q.price, 'BRL', 'USD', fx) : cur === 'EUR' ? convert(q.price, 'EUR', 'USD', fx) : cur === 'GBP' ? convert(q.price, 'GBP', 'USD', fx) : q.price;
    }
    return map;
  }, [m.data, brapi.map, yh.map, fx]);

  // engine trabalha em USD: converte custo das operações (moeda nativa → USD)
  const opsUsd = useMemo(
    () => operations.map((o) => ({ ...o, price: convert(o.price, nativeCcy(o.symbol), 'USD', fx) })),
    [operations, fx],
  );
  const rows = useMemo(() => {
    const needle = fText.trim().toLowerCase();
    return summarize(opsUsd, pricesUsd, fWallet).filter((r) => (fKind === 'ALL' ? true : r.kind === fKind) && (!needle || r.symbol.toLowerCase().includes(needle)));
  }, [opsUsd, pricesUsd, fWallet, fKind, fText]);
  const t = totals(rows, method);
  const walletName = (id: string) => wallets.find((w) => w.id === id)?.name ?? '—';

  // ---- rentabilidade por ativo (7/30/365d) ----
  const [perf, setPerf] = useState<Record<string, { d7: number | null; d30: number | null; d365: number | null; spark: number[] }>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const syms = [...new Set(operations.map((o) => o.symbol))].slice(0, 12);
      const out: typeof perf = {};
      await Promise.all(
        syms.map(async (s) => {
          try {
            let closes: number[] = [];
            if (/^[A-Z0-9]+$/.test(s) && !s.includes('.') && !isB3Like(s)) {
              try {
                closes = (await binanceKlines(`${s}USDT`, '1d', 400)).map((k) => k.close);
              } catch {
                closes = [];
              }
            }
            if (!closes.length) {
              const ysym = isB3Like(s) && !s.includes('.') ? `${s}.SA` : s;
              closes = (await yahooChart(ysym, '2y', '1d')).candles.map((k) => k.close);
            }
            if (closes.length > 8) {
              const last = closes[closes.length - 1];
              const at = (n: number) => (closes.length > n ? ((last / closes[closes.length - 1 - n] - 1) * 100) : null);
              out[s] = { d7: at(7), d30: at(30), d365: at(365), spark: closes.slice(-60) };
            }
          } catch {
            /* sem histórico: linha fica com — */
          }
        }),
      );
      if (alive) setPerf(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations.map((o) => o.symbol).join(',')]);

  // ---- fear & greed contexto ----
  const [fg, setFg] = useState<number | null>(null);
  useEffect(() => {
    fearGreed(2).then((r) => setFg(r.current)).catch(() => {});
  }, []);

  // Pré-preenchimento vindo da aba Oportunidades ("operar" na linha).
  useEffect(() => {
    if (pendingOp) {
      setSymbol(pendingOp.symbol);
      setKind(pendingOp.kind);
      setSide('buy');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (m.loading && !m.data.length) return <Skeleton className="h-72" />;
  if (m.error && !m.data.length) return <ErrorBox message={m.error} onRetry={m.reload} />;

  const M = (usd: number) => money(usd);
  const alloc = rows.filter((r) => r.marketValue > 0);

  const save = () => {
    const qn = Number(qty);
    const pn = Number(price);
    if (!symbol.trim() || !(qn > 0) || !(pn >= 0)) return;
    if (editingId) {
      updateOperation(editingId, { walletId, kind, symbol: symbol.trim().toUpperCase(), side, quantity: qn, price: pn, date, note });
      setEditingId(null);
    } else {
      const sym = symbol.trim().toUpperCase();
      const meta =
        pendingOp && pendingOp.symbol === sym
          ? { entryTier: pendingOp.tier, entryScore: pendingOp.score, entryRR: pendingOp.rr, entryStretch: pendingOp.stretch, entryConfFull: pendingOp.confFull }
          : {};
      const o: Operation = { id: `${Date.now()}`, walletId, kind, symbol: sym, side, quantity: qn, price: pn, date, note, ...meta };
      addOperation(o);
      if (pendingOp && pendingOp.symbol === sym) setPendingOp(null);
    }
    setQty('');
    setPrice('');
    setNote('');
  };
  const startEdit = (o: Operation) => {
    setEditingId(o.id);
    setWalletId(o.walletId);
    setKind(o.kind);
    setSymbol(o.symbol);
    setSide(o.side);
    setQty(String(o.quantity));
    setPrice(String(o.price));
    setDate(o.date);
    setNote(o.note ?? '');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={fWallet} onChange={(e) => setFWallet(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <option value="ALL">Todas as carteiras</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={fKind} onChange={(e) => setFKind(e.target.value as typeof fKind)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
          <option value="ALL">Crypto + ações</option>
          <option value="crypto">Crypto</option>
          <option value="stock">Ações</option>
        </select>
        <input value={fText} onChange={(e) => setFText(e.target.value)} placeholder="Filtrar ativo…" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5" />
        <select value={displayCcy} onChange={(e) => set({ currency: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5" title="Moeda de exibição">
          <option value="USD">USD</option>
          <option value="BRL">BRL</option>
          <option value="EUR">EUR</option>
        </select>
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]" title="Método de cálculo do lucro">
          {(['standard', 'investor'] as const).map((mm) => (
            <button key={mm} onClick={() => set({ portfolioMethod: mm })} className={mm === method ? 'bg-[var(--accent)] px-3 py-1.5 font-bold text-black' : 'px-3 py-1.5 text-muted'}>
              {mm === 'standard' ? 'Método Padrão' : 'Método Investidor'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowWallets((s) => !s)} className="rounded-lg border border-[var(--border)] px-3 py-1.5">Carteiras ({wallets.length})</button>
      </div>

      {showWallets && (
        <Panel>
          <PanelTitle>Carteiras</PanelTitle>
          <div className="grid gap-2 md:grid-cols-3">
            {wallets.map((w) => {
              const wr = summarize(opsUsd, pricesUsd, w.id);
              const wt = totals(wr, method);
              return (
                <div key={w.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center gap-2">
                    <strong>{w.name}</strong>
                    <button onClick={() => setFWallet(w.id)} className="text-xs text-[var(--accent)]">filtrar</button>
                    {w.id !== 'main' && <button onClick={() => removeWallet(w.id)} className="ml-auto text-xs text-muted" title="Excluir (operações voltam p/ Principal)">excluir</button>}
                  </div>
                  <div className="tabular mt-1 text-sm">{M(wt.current)} · <span style={{ color: wt.headline >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtPct(wt.headlinePct)}</span></div>
                  <div className="mt-1 flex gap-1">
                    <input defaultValue={w.name} id={`wn-${w.id}`} className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 py-0.5 text-xs" />
                    {w.id !== 'main' && <button onClick={() => { const el = document.getElementById(`wn-${w.id}`) as HTMLInputElement | null; if (el?.value.trim()) renameWallet(w.id, el.value.trim()); }} className="rounded border border-[var(--border)] px-2 text-xs">OK</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={newWallet} onChange={(e) => setNewWallet(e.target.value)} placeholder="Nova carteira (ex: Cliente 1)…" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
            <button onClick={() => { if (newWallet.trim()) { addWallet(newWallet.trim()); setNewWallet(''); } }} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-bold text-black">+ Criar</button>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <Panel><div className="text-xs text-muted">Patrimônio</div><div className="tabular text-xl font-bold">{M(t.current)}</div></Panel>
        <Panel><div className="text-xs text-muted">Investido (aberto)</div><div className="tabular text-xl font-bold">{M(t.invested)}</div></Panel>
        <Panel><div className="text-xs text-muted">{method === 'standard' ? 'Lucro total' : 'Lucro em aberto'}</div><div className="tabular text-xl font-bold" style={{ color: t.headline >= 0 ? 'var(--up)' : 'var(--down)' }}>{M(t.headline)} · {fmtPct(t.headlinePct)}</div></Panel>
        <Panel><div className="text-xs text-muted">Realizado</div><div className="tabular text-xl font-bold" style={{ color: t.realized >= 0 ? 'var(--up)' : 'var(--down)' }}>{M(t.realized)}</div></Panel>
        <Panel><div className="text-xs text-muted">Fear &amp; Greed</div><div className="tabular text-xl font-bold">{fg ?? '—'}</div><div className="text-xs text-muted">contexto de sentimento</div></Panel>
      </div>
      {method === 'investor' && <div className="text-xs text-muted">Método Investidor: o realizado sai do acompanhamento (lucro retirado não conta mais); o Padrão soma tudo.</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        <Fullscreen title="Distribuição por ativo">
          {!alloc.length ? <div className="text-sm text-muted">Sem posições em aberto.</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart><Pie data={alloc.map((r) => ({ name: r.symbol, value: r.marketValue }))} dataKey="value" nameKey="name" outerRadius={90} label>{alloc.map((_, i) => <Cell key={i} fill={['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'][i % 5]} />)}</Pie><Tooltip formatter={(v) => [M(Number(v)), 'valor']} /></PieChart>
            </ResponsiveContainer>
          )}
        </Fullscreen>
        <Fullscreen title="Contribuição no lucro">
          {!rows.length ? <div className="text-sm text-muted">Sem operações no filtro.</div> : (
            <div className="space-y-1.5">
              {rows.slice(0, 10).map((r) => {
                const max = Math.max(...rows.map((x) => Math.abs(x.totalPnl)), 1e-9);
                return (
                  <div key={r.symbol} className="flex items-center gap-2 text-sm">
                    <Link to={r.kind === 'crypto' ? `/monitor?symbol=${r.symbol}` : `/stocks?symbol=${encodeURIComponent(r.symbol)}`} className="w-20 font-bold hover:underline">{r.symbol}</Link>
                    <div className="h-2.5 flex-1 rounded bg-[var(--surface-2)]"><div className="h-2.5 rounded" style={{ width: `${Math.min(100, (Math.abs(r.totalPnl) / max) * 100)}%`, background: r.totalPnl >= 0 ? 'var(--up)' : 'var(--down)' }} /></div>
                    <span className="tabular w-28 text-right text-xs">{M(r.totalPnl)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Fullscreen>
      </div>

      <Fullscreen title="Análise de rentabilidade por ativo (7d · 30d · 365d)">
        {!rows.length ? <div className="text-sm text-muted">Sem posições.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="p-2">Ativo</th><th className="p-2">Qtd</th><th className="p-2">PM</th><th className="p-2">Preço</th><th className="p-2">7d</th><th className="p-2">30d</th><th className="p-2">365d</th><th className="p-2">Spark</th><th className="p-2">P&amp;L</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const p = perf[r.symbol];
                const liveNative = pricesUsd[r.symbol] != null ? convert(pricesUsd[r.symbol], 'USD', displayCcy, fx) : null;
                const cell = (v: number | null | undefined) => <td className="tabular p-2" style={{ color: (v ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{v == null ? '—' : fmtPct(v)}</td>;
                return (
                  <tr key={r.symbol} className="border-t border-[var(--border)]">
                    <td className="p-2 font-bold">{r.symbol}</td>
                    <td className="tabular p-2">{r.quantity}</td>
                    <td className="tabular p-2">{fmtMoney(convert(r.avgCost, 'USD', displayCcy, fx), displayCcy)}</td>
                    <td className="tabular p-2">{liveNative != null ? fmtMoney(liveNative, displayCcy) : '—'}</td>
                    {cell(p?.d7)}{cell(p?.d30)}{cell(p?.d365)}
                    <td className="p-2">{p?.spark ? <Sparkline data={p.spark} width={110} /> : <span className="text-xs text-muted">—</span>}</td>
                    <td className="tabular p-2" style={{ color: r.totalPnl >= 0 ? 'var(--up)' : 'var(--down)' }}>{M(r.totalPnl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Fullscreen>

      <Panel>
        <PanelTitle>Posições — clique para detalhar cada aporte</PanelTitle>
        {!rows.length && <Empty title="Nada por aqui" hint="Cadastre a primeira operação abaixo." />}
        {rows.map((r) => {
          const ops = operations.filter((o) => o.symbol === r.symbol && (fWallet === 'ALL' || o.walletId === fWallet)).sort((a, b) => b.date.localeCompare(a.date));
          const open = expanded === r.symbol;
          return (
            <div key={r.symbol} className="border-b border-[var(--border)] py-2">
              <button onClick={() => setExpanded(open ? null : r.symbol)} className="flex w-full flex-wrap items-center gap-2 text-left text-sm">
                <span className="text-muted">{open ? '▾' : '▸'}</span>
                <strong className="w-20">{r.symbol}</strong>
                <Badge tone={r.totalPnl >= 0 ? 'up' : 'down'}>{fmtPct(r.returnPct)}</Badge>
                <span className="tabular text-xs text-muted">{r.quantity} un. · PM {fmtMoney(convert(r.avgCost, 'USD', displayCcy, fx), displayCcy)}</span>
                <span className="tabular ml-auto text-xs">P&amp;L {M(r.totalPnl)} {r.realized ? `(realiz. ${M(r.realized)})` : ''}</span>
              </button>
              {open && (
                <div className="ml-6 mt-1 space-y-1">
                  {ops.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? 'aporte' : 'retirada'}</Badge>
                      <span className="tabular">{o.date}</span>
                      <span className="tabular">{o.quantity} × {fmtMoney(convert(o.price, nativeCcy(o.symbol), displayCcy, fx), displayCcy)}</span>
                      <span className="text-muted">{walletName(o.walletId)}{o.note ? ` · ${o.note}` : ''}</span>
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => startEdit(o)} className="rounded border border-[var(--border)] px-1.5">editar</button>
                        <button onClick={() => removeOperation(o.id)} className="rounded border border-[var(--border)] px-1.5">excluir</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Panel>

      <Panel>
        <PanelTitle>{editingId ? 'Editar operação' : 'Nova operação (aporte / retirada)'}</PanelTitle>
        <div className="relative mb-2">
          <input value={lookupQ} onChange={(e) => setLookupQ(e.target.value)} placeholder="Buscar ativo p/ preencher (BTC, PETR4.SA, TSM…)" className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          {lookupQ.trim().length >= 2 && lookup.results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
              {lookup.results.map((rr) => (
                <button
                  key={rr.symbol}
                  onClick={async () => {
                    setSymbol(rr.symbol);
                    setKind(rr.kind === 'crypto' ? 'crypto' : 'stock');
                    setNote(rr.name);
                    setLookupQ('');
                    try {
                      const qq = await yahooChart(rr.symbol, '5d', '1d');
                      if (qq.price != null) {
                        const cur = (qq.currency ?? 'USD').toUpperCase();
                        const native = cur === 'GBp' || cur === 'GBX' ? qq.price / 100 : qq.price;
                        setPrice(String(Number(native.toFixed(cur === 'BRL' ? 2 : cur === 'USD' && native < 10 ? 4 : 2))));
                      }
                    } catch {
                      /* mantém preço digitado */
                    }
                  }}
                  className="block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
                >
                  <strong>{rr.symbol}</strong> <span className="text-xs text-muted">{rr.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {pendingOp && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] px-3 py-2 text-sm">
            <span>
              Vindo de <strong>Oportunidades</strong>: <strong>{pendingOp.symbol}</strong> · tier {pendingOp.tier} · score {pendingOp.score}
              {pendingOp.rr != null ? ` · R:R ${pendingOp.rr.toFixed(1)}` : ''}
              {pendingOp.confFull ? ' · confluência total' : ''}
            </span>
            <span className="text-xs text-muted">— o contexto será gravado na operação ao salvar.</span>
            <button onClick={() => setPendingOp(null)} className="ml-auto text-xs text-muted hover:underline">dispensar</button>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-8">
          <div className="flex overflow-hidden rounded border border-[var(--border)] text-sm">            {(['buy', 'sell'] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)} className={s === side ? 'flex-1 bg-[var(--accent)] py-1.5 font-bold text-black' : 'flex-1 py-1.5 text-muted'}>{s === 'buy' ? 'Aporte' : 'Retirada'}</button>
            ))}
          </div>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm">
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"><option value="crypto">crypto</option><option value="stock">ação</option></select>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Símbolo" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço unit." type="number" step="any" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qtd (auto: valor÷preço)" type="number" step="any" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          <input value={qty && price ? String((Number(qty) * Number(price)).toFixed(2)) : ''} onChange={(e) => { const pn = Number(price); if (pn > 0) setQty(String(Number(e.target.value) / pn)); }} placeholder="Valor total" type="number" step="any" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" title="Digite o valor: a quantidade é calculada" />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
        </div>
        <div className="mt-2 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="flex-1 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          <button onClick={save} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black">{editingId ? 'Salvar edição' : side === 'buy' ? 'Salvar aporte' : 'Salvar retirada'}</button>
          {editingId && <button onClick={() => { setEditingId(null); setQty(''); setPrice(''); setNote(''); }} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Cancelar</button>}
          <button onClick={() => { const blob = new Blob([JSON.stringify(operations, null, 2)], { type: 'application/json' }); const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = 'operacoes.json'; aEl.click(); }} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Exportar JSON</button>
          <button onClick={() => { const csv = 'wallet,symbol,kind,side,quantity,price,date,note\n' + operations.map((p) => `${walletName(p.walletId)},${p.symbol},${p.kind},${p.side},${p.quantity},${p.price},${p.date},${(p.note ?? '').replace(/,/g, ' ')}`).join('\n'); const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); aEl.download = 'operacoes.csv'; aEl.click(); }} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">CSV</button>
        </div>
        {qty && price && <div className="mt-1 text-xs text-muted">= {qty} un. × {price} ({side === 'buy' ? 'entrada' : 'saída'} em {nativeCcy(symbol)})</div>}
      </Panel>
    </div>
  );
}
