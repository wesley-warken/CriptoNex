import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { useLookup } from '@/components/analysis/AssetSearch';
import { yahooChart } from '@/services/lookup';
import { fearGreed } from '@/services/providers/sentiment';
import { binanceKlines } from '@/services/providers/binance';
import { summarize, totals, type Operation, type OpSide } from '@/lib/portfolio';
import { getFxRates, convert, fmtMoney, type Fiat, type FxRates } from '@/services/fx';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { Sparkline } from '@/components/charts/Sparkline';
import { fmtPct } from '@/lib/format';
import { MStats } from '@/components/minimal/MStats';
import { MSection } from '@/components/minimal/MSection';
import { MEmpty } from '@/components/minimal/MEmpty';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const isB3Like = (s: string) => (/^[A-Z]{4}[346]$/.test(s) && !s.includes('.')) || s.endsWith('.SA');
const nativeCcy = (s: string): Fiat => (isB3Like(s) ? 'BRL' : 'USD');
const DEFAULT_FX: FxRates = { USDBRL: 5, EURUSD: 1.08, GBPUSD: 1.27, ts: 0 };
const PIE_COLORS = ['#0284c7', '#0d9488', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#64748b'];

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
    <div className="space-y-8">
      {/* Barra de Filtros e Controles */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border)] pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={fWallet}
            onChange={(e) => setFWallet(e.target.value)}
            className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 font-medium text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
          >
            <option value="ALL">Todas as carteiras</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <select
            value={fKind}
            onChange={(e) => setFKind(e.target.value as typeof fKind)}
            className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 font-medium text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
          >
            <option value="ALL">Crypto + Ações</option>
            <option value="crypto">Apenas Crypto</option>
            <option value="stock">Apenas Ações</option>
          </select>

          <input
            value={fText}
            onChange={(e) => setFText(e.target.value)}
            placeholder="Filtrar por ativo…"
            className="w-40 border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
          />

          <select
            value={displayCcy}
            onChange={(e) => set({ currency: e.target.value })}
            className="border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
            title="Moeda de exibição"
          >
            <option value="USD">USD ($)</option>
            <option value="BRL">BRL (R$)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Método de Rentabilidade */}
          <div className="inline-flex items-center gap-3" title="Método de cálculo do lucro">
            {(['standard', 'investor'] as const).map((mm) => (
              <button
                key={mm}
                onClick={() => set({ portfolioMethod: mm })}
                className={
                  mm === method
                    ? 'text-xs font-semibold text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]'
                    : 'text-xs font-medium text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'
                }
              >
                {mm === 'standard' ? 'Padrão' : 'Investidor'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowWallets((s) => !s)}
            className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-medium tabular-nums text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] hover:border-[var(--brand)] active:scale-[0.98]"
          >
            Carteiras ({wallets.length})
          </button>
        </div>
      </div>

      {showWallets && (
        <MSection
          title="Gestão de carteiras"
          right={<span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">Isolamento de saldos e operações</span>}
        >
          <div className="divide-y divide-[var(--border)]">
            {wallets.map((w) => {
              const wr = summarize(opsUsd, pricesUsd, w.id);
              const wt = totals(wr, method);
              return (
                <div key={w.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-semibold text-[var(--text-primary)]">{w.name}</strong>
                    <button
                      onClick={() => setFWallet(w.id)}
                      className="font-mono text-xs font-semibold text-[var(--brand)] transition-colors duration-150 ease-out hover:underline active:scale-[0.98]"
                    >
                      [filtrar]
                    </button>
                    {w.id !== 'main' && (
                      <button
                        onClick={() => removeWallet(w.id)}
                        className="ml-auto text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]"
                        title="Excluir (operações voltam p/ Principal)"
                      >
                        excluir
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{M(wt.current)}</span>
                    <span className={wt.headline >= 0 ? 'text-xs font-semibold tabular-nums text-[var(--bull)]' : 'text-xs font-semibold tabular-nums text-[var(--bear)]'}>
                      {fmtPct(wt.headlinePct)}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      defaultValue={w.name}
                      id={`wn-${w.id}`}
                      className="w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
                    />
                    {w.id !== 'main' && (
                      <button
                        onClick={() => {
                          const el = document.getElementById(`wn-${w.id}`) as HTMLInputElement | null;
                          if (el?.value.trim()) renameWallet(w.id, el.value.trim());
                        }}
                        className="border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--brand)] active:scale-[0.98]"
                      >
                        Salvar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={newWallet}
              onChange={(e) => setNewWallet(e.target.value)}
              placeholder="Nova carteira (ex: Reserva, Swing Trade)…"
              className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
            />
            <button
              onClick={() => { if (newWallet.trim()) { addWallet(newWallet.trim()); setNewWallet(''); } }}
              className="border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-1.5 font-mono text-xs font-semibold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--brand)] active:scale-[0.98]"
            >
              + Criar carteira
            </button>
          </div>
        </MSection>
      )}

      {/* KPI Strip */}
      <MStats
        items={[
          { label: 'Patrimônio atual', value: M(t.current), sub: 'valor a mercado' },
          { label: 'Capital investido', value: M(t.invested), sub: 'posições em aberto' },
          {
            label: method === 'standard' ? 'Lucro total' : 'Lucro em aberto',
            value: M(t.headline),
            sub: `(${t.headline >= 0 ? '+' : ''}${fmtPct(t.headlinePct)}) · ${method === 'standard' ? 'inclui realizados' : 'método investidor'}`,
            tone: t.headline >= 0 ? 'up' : 'down',
          },
          {
            label: 'Lucro realizado',
            value: M(t.realized),
            sub: 'vendas encerradas',
            tone: t.realized >= 0 ? 'up' : 'down',
          },
          {
            label: 'Fear e greed',
            value: fg != null ? String(fg) : '—',
            sub: 'sentimento global',
          },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <MSection
          title="Distribuição por ativo"
          right={<span className="text-xs tabular-nums text-[var(--text-muted)]">{alloc.length} ativos</span>}
        >
          {!alloc.length ? <MEmpty title="Sem posições" hint="Sem posições em aberto no momento." /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={alloc.map((r) => ({ name: r.symbol, value: r.marketValue }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={85}
                  label
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                >
                  {alloc.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [M(Number(v)), 'Valor']}
                  contentStyle={{
                    backgroundColor: 'var(--surface-1)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </MSection>

        <MSection
          title="Contribuição no lucro"
          right={<span className="text-xs tabular-nums text-[var(--text-muted)]">top {Math.min(10, rows.length)}</span>}
        >
          {!rows.length ? <MEmpty title="Sem operações" hint="Sem operações no filtro atual." /> : (
            <div className="space-y-2 py-1">
              {rows.slice(0, 10).map((r) => {
                const max = Math.max(...rows.map((x) => Math.abs(x.totalPnl)), 1e-9);
                return (
                  <div key={r.symbol} className="flex items-center gap-2 text-xs">
                    <Link
                      to={r.kind === 'crypto' ? `/monitor?symbol=${r.symbol}` : `/stocks?symbol=${encodeURIComponent(r.symbol)}`}
                      className="w-16 font-mono font-semibold tabular-nums text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] active:scale-[0.98]"
                    >
                      {r.symbol}
                    </Link>
                    <div className="h-1 flex-1 bg-[var(--surface-2)]">
                      <div
                        className={r.totalPnl >= 0 ? 'h-full bg-[var(--bull)]' : 'h-full bg-[var(--bear)]'}
                        style={{ width: `${Math.min(100, (Math.abs(r.totalPnl) / max) * 100)}%` }}
                      />
                    </div>
                    <span className={r.totalPnl >= 0 ? 'w-24 text-right font-mono text-xs font-semibold tabular-nums text-[var(--bull)]' : 'w-24 text-right font-mono text-xs font-semibold tabular-nums text-[var(--bear)]'}>
                      {M(r.totalPnl)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </MSection>
      </div>

      <MSection
        title="Rentabilidade por ativo · 7d · 30d · 365d"
        right={<span className="text-xs tabular-nums text-[var(--text-muted)]">{rows.length} posições</span>}
      >
        {!rows.length ? <MEmpty title="Nenhuma posição" hint="Nenhuma posição cadastrada." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2 pr-2.5 font-medium">Ativo</th>
                  <th className="p-2.5 text-right font-medium">Qtd</th>
                  <th className="p-2.5 text-right font-medium">Preço médio</th>
                  <th className="p-2.5 text-right font-medium">Preço atual</th>
                  <th className="p-2.5 text-right font-medium">7 dias</th>
                  <th className="p-2.5 text-right font-medium">30 dias</th>
                  <th className="p-2.5 text-right font-medium">365 dias</th>
                  <th className="p-2.5 font-medium">Histórico</th>
                  <th className="p-2.5 text-right font-medium">P&amp;L total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => {
                  const p = perf[r.symbol];
                  const liveNative = pricesUsd[r.symbol] != null ? convert(pricesUsd[r.symbol], 'USD', displayCcy, fx) : null;
                  const cell = (v: number | null | undefined) => (
                    <td className={(v ?? 0) >= 0 ? 'p-2.5 text-right font-mono font-medium tabular-nums text-[var(--bull)]' : 'p-2.5 text-right font-mono font-medium tabular-nums text-[var(--bear)]'}>
                      {v == null ? '—' : fmtPct(v)}
                    </td>
                  );
                  return (
                    <tr key={r.symbol} className="transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
                      <td className="py-2 pr-2.5 font-mono font-semibold text-[var(--text-primary)]">{r.symbol}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.quantity}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{fmtMoney(convert(r.avgCost, 'USD', displayCcy, fx), displayCcy)}</td>
                      <td className="p-2.5 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">{liveNative != null ? fmtMoney(liveNative, displayCcy) : '—'}</td>
                      {cell(p?.d7)}{cell(p?.d30)}{cell(p?.d365)}
                      <td className="p-2.5">{p?.spark ? <Sparkline data={p.spark} width={110} /> : <span className="text-xs text-[var(--text-muted)]">—</span>}</td>
                      <td className={r.totalPnl >= 0 ? 'p-2.5 text-right font-mono font-semibold tabular-nums text-[var(--bull)]' : 'p-2.5 text-right font-mono font-semibold tabular-nums text-[var(--bear)]'}>
                        {M(r.totalPnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </MSection>

      <MSection
        title="Posições em carteira"
        right={<span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{rows.length} posições consolidadas</span>}
      >
        {!rows.length && <MEmpty title="Nada por aqui" hint="Cadastre a primeira operação abaixo." />}
        <div className="divide-y divide-[var(--border)]">
          {rows.map((r) => {
            const ops = operations.filter((o) => o.symbol === r.symbol && (fWallet === 'ALL' || o.walletId === fWallet)).sort((a, b) => b.date.localeCompare(a.date));
            const open = expanded === r.symbol;
            return (
              <div key={r.symbol} className="py-2.5">
                <button onClick={() => setExpanded(open ? null : r.symbol)} className="flex w-full flex-wrap items-center gap-2.5 p-1 text-left text-xs transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.98]">
                  {open
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />}
                  <strong className="w-20 font-mono text-sm font-semibold text-[var(--text-primary)]">{r.symbol}</strong>
                  <span className={r.totalPnl >= 0 ? 'font-mono text-xs font-semibold tabular-nums text-[var(--bull)]' : 'font-mono text-xs font-semibold tabular-nums text-[var(--bear)]'}>
                    {fmtPct(r.returnPct)}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {r.quantity} un. · PM {fmtMoney(convert(r.avgCost, 'USD', displayCcy, fx), displayCcy)}
                  </span>
                  <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                    P&amp;L: <span className={r.totalPnl >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}>{M(r.totalPnl)}</span>
                    {r.realized ? <span className="ml-1 text-xs font-normal tabular-nums text-[var(--text-muted)]">(realiz. {M(r.realized)})</span> : ''}
                  </span>
                </button>
                {open && (
                  <div className="ml-7 mt-2 divide-y divide-[var(--border)] pl-2">
                    {ops.map((o) => (
                      <div key={o.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                        <span className={o.side === 'buy' ? 'text-xs font-semibold text-[var(--bull)]' : 'text-xs font-semibold text-[var(--bear)]'}>
                          {o.side === 'buy' ? 'APORTE' : 'RETIRADA'}
                        </span>
                        <span className="font-mono tabular-nums text-[var(--text-muted)]">{o.date}</span>
                        <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                          {o.quantity} × {fmtMoney(convert(o.price, nativeCcy(o.symbol), displayCcy, fx), displayCcy)}
                        </span>
                        <span className="font-medium text-[var(--text-muted)]">· {walletName(o.walletId)}{o.note ? ` (${o.note})` : ''}</span>
                        <span className="ml-auto flex gap-3">
                          <button
                            onClick={() => startEdit(o)}
                            className="text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
                          >
                            editar
                          </button>
                          <button
                            onClick={() => removeOperation(o.id)}
                            className="text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]"
                          >
                            excluir
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </MSection>


      <MSection title={editingId ? 'Editar operação' : 'Nova operação (aporte / retirada)'}>
        <div className="relative mb-2">
          <input
            value={lookupQ}
            onChange={(e) => setLookupQ(e.target.value)}
            placeholder="Buscar ativo p/ preencher (BTC, PETR4.SA, TSM…)"
            className="w-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
          />
          {lookupQ.trim().length >= 2 && lookup.results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full divide-y divide-[var(--border)] overflow-auto border border-[var(--border)] bg-[var(--surface-1)] shadow-lg">
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
                  className="block w-full truncate px-3 py-2 text-left text-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]"
                >
                  <strong className="font-semibold text-[var(--text-primary)]">{rr.symbol}</strong> <span className="text-xs text-[var(--text-muted)]">{rr.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {pendingOp && (
          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[var(--border)] py-2 text-sm">
            <span className="text-[var(--text-primary)]">
              Vindo de <strong className="font-semibold text-[var(--text-primary)]">Oportunidades</strong>: <strong className="font-semibold tabular-nums text-[var(--brand)]">{pendingOp.symbol}</strong> · <span className="tabular-nums">tier {pendingOp.tier} · score {pendingOp.score}</span>
              {pendingOp.rr != null ? <span className="tabular-nums"> · R:R {pendingOp.rr.toFixed(1)}</span> : ''}
              {pendingOp.confFull ? ' · confluência total' : ''}
            </span>
            <span className="text-xs text-[var(--text-muted)]">— o contexto será gravado na operação ao salvar.</span>
            <button onClick={() => setPendingOp(null)} className="ml-auto text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]">dispensar</button>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-8">
          <div className="flex overflow-hidden border border-[var(--border)] text-sm">
            {(['buy', 'sell'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={s === side ? 'flex-1 py-1.5 font-semibold text-[var(--brand)] bg-[var(--surface-2)] transition-colors duration-150 ease-out active:scale-[0.98]' : 'flex-1 py-1.5 text-[var(--text-muted)] bg-[var(--surface-1)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'}
              >
                {s === 'buy' ? 'Aporte' : 'Retirada'}
              </button>
            ))}
          </div>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]">
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"><option value="crypto">crypto</option><option value="stock">ação</option></select>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Símbolo" className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço unit." type="number" step="any" className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" />
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qtd (auto: valor÷preço)" type="number" step="any" className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" />
          <input value={qty && price ? String((Number(qty) * Number(price)).toFixed(2)) : ''} onChange={(e) => { const pn = Number(price); if (pn > 0) setQty(String(Number(e.target.value) / pn)); }} placeholder="Valor total" type="number" step="any" className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" title="Digite o valor: a quantidade é calculada" />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="flex-1 border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" />
          <button onClick={save} className="bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.98]">{editingId ? 'Salvar edição' : side === 'buy' ? 'Salvar aporte' : 'Salvar retirada'}</button>
          {editingId && <button onClick={() => { setEditingId(null); setQty(''); setPrice(''); setNote(''); }} className="border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]">Cancelar</button>}
          <button onClick={() => { const blob = new Blob([JSON.stringify(operations, null, 2)], { type: 'application/json' }); const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = 'operacoes.json'; aEl.click(); }} className="border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]">Exportar JSON</button>
          <button onClick={() => { const csv = 'wallet,symbol,kind,side,quantity,price,date,note\n' + operations.map((p) => `${walletName(p.walletId)},${p.symbol},${p.kind},${p.side},${p.quantity},${p.price},${p.date},${(p.note ?? '').replace(/,/g, ' ')}`).join('\n'); const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); aEl.download = 'operacoes.csv'; aEl.click(); }} className="border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]">CSV</button>
        </div>
        {qty && price && <div className="mt-1 font-mono text-xs tabular-nums text-[var(--text-muted)]">= {qty} un. × {price} ({side === 'buy' ? 'entrada' : 'saída'} em {nativeCcy(symbol)})</div>}
      </MSection>
    </div>
  );
}
