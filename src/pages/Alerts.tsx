import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, type PriceAlert } from '@/stores/useStore';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines, type BinanceInterval } from '@/services/providers/binance';
import { useUniverseCrypto } from '@/services/universeHooks';
import { describeCondition, evaluateScan, type AlertCondition, type CondIndicator, type CondOp, type CustomScan } from '@/engine/scanConditions';
import { Panel, PanelTitle, Badge, Empty } from '@/components/ui/kit';
import { fmtNum } from '@/lib/format';

const INDICATORS: { v: CondIndicator; label: string }[] = [
  { v: 'RSI', label: 'RSI' },
  { v: 'TREND', label: 'Tendência' },
  { v: 'EMA', label: 'EMA (9×26)' },
  { v: 'MACD', label: 'MACD' },
  { v: 'SUPERTREND', label: 'Supertrend' },
  { v: 'VOLUME', label: 'Volume vs média' },
  { v: 'MARKETCAP', label: 'Market Cap' },
];
const TFS: BinanceInterval[] = ['1h', '4h', '1d', '1w'];
const klCache = new Map<string, { ts: number; candles: { [k: string]: import('@/types').Candle[] } }>();
const KL_TTL = 5 * 60 * 1000;

async function klinesCached(binanceSymbol: string, tf: BinanceInterval) {
  const now = Date.now();
  const hit = klCache.get(binanceSymbol);
  if (hit && now - hit.ts < KL_TTL && hit.candles[tf]) return hit.candles[tf];
  const kl = await binanceKlines(binanceSymbol, tf, 120);
  const prev = klCache.get(binanceSymbol);
  klCache.set(binanceSymbol, { ts: now, candles: { ...(prev?.candles ?? {}), [tf]: kl } });
  return kl;
}

export function Alerts() {
  const alerts = useStore((s) => s.alerts);
  const addAlert = useStore((s) => s.addAlert);
  const removeAlert = useStore((s) => s.removeAlert);
  const toggleAlert = useStore((s) => s.toggleAlert);
  const [symbol, setSymbol] = useState('BTC');
  const [kind, setKind] = useState<'crypto' | 'stock'>('crypto');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [price, setPrice] = useState('');

  const active = alerts.filter((a) => a.active);
  const history = alerts.filter((a) => !a.active);

  const create = () => {
    const p = Number(price);
    if (!symbol.trim() || !(p > 0)) return;
    const a: PriceAlert = {
      id: `${Date.now()}`,
      symbol: symbol.trim().toUpperCase(),
      kind,
      condition,
      price: p,
      active: true,
      createdAt: new Date().toISOString(),
      triggeredAt: null,
    };
    addAlert(a);
    setPrice('');
  };

  const row = (a: PriceAlert) => (
    <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-2 text-sm">
      <strong className="w-24 truncate">{a.symbol}</strong>
      <Badge tone={a.triggeredAt ? 'warn' : a.active ? 'accent' : undefined}>
        {a.triggeredAt ? 'disparado' : a.active ? 'ativo' : 'pausado'}
      </Badge>
      <span className="tabular text-muted">{a.condition === 'above' ? '≥' : '≤'} {fmtNum(a.price)}</span>
      {a.triggeredAt && <span className="text-xs text-muted">em {new Date(a.triggeredAt).toLocaleString('pt-BR')}</span>}
      <span className="ml-auto flex gap-1">
        <button onClick={() => toggleAlert(a.id)} className="rounded border border-[var(--border)] px-2 py-0.5 text-xs">{a.active ? 'Pausar' : 'Reativar'}</button>
        <button onClick={() => removeAlert(a.id)} className="rounded border border-[var(--border)] px-2 py-0.5 text-xs">Excluir</button>
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <Panel>
        <PanelTitle>Novo alerta de preço</PanelTitle>
        <div className="grid gap-2 md:grid-cols-5">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm">
            <option value="crypto">crypto</option>
            <option value="stock">ação</option>
          </select>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Símbolo (BTC, PETR4…)" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm">
            <option value="above">Acima de (≥)</option>
            <option value="below">Abaixo de (≤)</option>
          </select>
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço" type="number" step="any" className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm" />
          <button onClick={create} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black">Criar alerta</button>
        </div>
        <p className="mt-2 text-xs text-muted">Avaliação automática no intervalo de atualização. Disparo único com som (respeita o mute) e toast; reative para monitorar de novo.</p>
      </Panel>
      <Panel>
        <PanelTitle>Ativos — {active.length}</PanelTitle>
        {active.length === 0 && <Empty title="Nenhum alerta ativo" hint="Crie acima: ex. BTC ≥ 100000." />}
        {active.map(row)}
      </Panel>
      {history.length > 0 && (
        <Panel>
          <PanelTitle>Pausados / disparados — {history.length}</PanelTitle>
          {history.map(row)}
        </Panel>
      )}
      <ScanBuilder />
    </div>
  );
}

const ICONS = ['🔔', '🎯', '⚡', '✅', '🔥', '💧', '📈', '📉'];
const COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa'];

function ScanBuilder() {
  const customScans = useStore((s) => s.customScans);
  const addScan = useStore((s) => s.addScan);
  const removeScan = useStore((s) => s.removeScan);
  const u = useUniverseCrypto();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🔔');
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState('');
  const [conds, setConds] = useState<AlertCondition[]>([]);
  // nova condição
  const [ind, setInd] = useState<CondIndicator>('RSI');
  const [tf, setTf] = useState<BinanceInterval>('4h');
  const [preset, setPreset] = useState('oversold');
  const [op, setOp] = useState<CondOp>('between');
  const [v1, setV1] = useState('30');
  const [v2, setV2] = useState('25');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [matches, setMatches] = useState<Record<string, string[]>>({});

  const mcapOf = useMemo(() => Object.fromEntries(u.coins.map((c) => [c.symbol, c.marketCap])), [u.coins]);

  const applyPreset = (p: string) => {
    setPreset(p);
    if (ind === 'RSI') {
      if (p === 'oversold') { setOp('below'); setV1('30'); }
      else if (p === 'overbought') { setOp('above'); setV1('70'); }
      else if (p === 'range') { setOp('between'); setV1('30'); setV2('25'); }
    }
  };

  const include = () => {
    const c: AlertCondition = {
      id: `${Date.now()}`,
      indicator: ind,
      timeframe: ind === 'MARKETCAP' ? '1d' : tf,
      op: ind === 'TREND' || ind === 'SUPERTREND' || ind === 'MACD' ? 'eq' : op,
      v1: ind === 'TREND' || ind === 'SUPERTREND' ? (preset === 'bear' ? -1 : 1) : ind === 'MACD' ? (preset === 'neg' ? -1 : 1) : Number(v1) || 0,
      v2: op === 'between' ? Number(v2) || 0 : undefined,
    };
    setConds((prev) => [...prev, c]);
  };

  const save = () => {
    if (!name.trim() || !conds.length) return;
    addScan({ id: `${Date.now()}`, name: name.trim(), icon, color, description: description.trim(), conditions: conds, createdAt: new Date().toISOString() });
    setName('');
    setDescription('');
    setConds([]);
  };

  const run = async (scan: CustomScan) => {
    setRunningId(scan.id);
    setProgress('iniciando…');
    try {
      const assets = CRYPTO_ASSETS.filter((a) => a.binanceSymbol);
      const needed = [...new Set(scan.conditions.filter((c) => c.indicator !== 'MARKETCAP').map((c) => c.timeframe))];
      // Pré-carrega os timeframes com concorrência limitada (blocos de 5)
      const klByAsset = new Map<string, Record<string, import('@/types').Candle[]>>();
      let fetched = 0;
      for (let i = 0; i < assets.length; i += 5) {
        await Promise.all(
          assets.slice(i, i + 5).map(async (a) => {
            const byTf: Record<string, import('@/types').Candle[]> = {};
            for (const t of needed) {
              try {
                byTf[t] = await klinesCached(a.binanceSymbol!, t);
              } catch {
                return;
              }
            }
            klByAsset.set(a.symbol, byTf);
          }),
        );
        fetched += Math.min(5, assets.length - i);
        setProgress(`${fetched}/${assets.length} verificadas…`);
      }
      const hits: string[] = [];
      for (const a of assets) {
        const byTf = klByAsset.get(a.symbol);
        if (!byTf) continue;
        if (evaluateScan((t) => byTf[t] ?? [], mcapOf[a.symbol] ?? null, scan)) hits.push(a.symbol);
      }
      setMatches((prev) => ({ ...prev, [scan.id]: hits }));
      setProgress(hits.length ? `${hits.length} ativo(s) atendem agora` : 'nenhum ativo atende agora');
    } catch {
      setProgress('falha na avaliação — tente de novo');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Panel>
      <PanelTitle>Varreduras combinadas (filtros por indicadores)</PanelTitle>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-sm">Nome do alerta*<input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: SOBREVENDIDO 4H RSI" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" /></label>
        <label className="text-sm">Ícone
          <div className="mt-1 flex gap-1">{ICONS.map((ic) => <button key={ic} onClick={() => setIcon(ic)} className={ic === icon ? 'rounded bg-[var(--accent)] px-1.5 py-0.5' : 'rounded border border-[var(--border)] px-1.5 py-0.5'}>{ic}</button>)}</div>
        </label>
        <label className="text-sm">Cor do alerta
          <div className="mt-1 flex gap-1">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className="h-6 w-8 rounded border border-[var(--border)]" style={{ background: c, outline: c === color ? '2px solid white' : 'none' }} />)}</div>
        </label>
      </div>
      <label className="mt-2 block text-sm">Descrição<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex: criptos com RSI 4h em sobrevenda" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" rows={2} /></label>

      <div className="mt-3 rounded-lg border border-[var(--border)] p-3">
        <div className="mb-2 text-sm font-semibold">Adicionar condição</div>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-sm">Indicador
            <select
              value={ind}
              onChange={(e) => {
                const next = e.target.value as CondIndicator;
                setInd(next);
                if (next === 'MARKETCAP') {
                  setOp('above');
                  setV1('200000000');
                  setV2('');
                } else if (next === 'RSI') {
                  setOp('below');
                  setV1('30');
                }
              }}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"
            >
              {INDICATORS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
            </select>
          </label>
          {(ind === 'RSI' || ind === 'TREND' || ind === 'MACD') && (
            <label className="text-sm">Predefinição
              <select value={preset} onChange={(e) => applyPreset(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
                {ind === 'RSI' && <><option value="oversold">Sobrevendido (&lt;30)</option><option value="overbought">Sobrecomprado (&gt;70)</option><option value="range">Faixa customizada</option></>}
                {ind === 'TREND' && <><option value="bull">Alta</option><option value="bear">Baixa</option></>}
                {ind === 'MACD' && <><option value="pos">Positivo</option><option value="neg">Negativo</option></>}
              </select>
            </label>
          )}
          {ind !== 'MARKETCAP' && (ind === 'TREND' || ind === 'SUPERTREND' || ind === 'MACD' ? null : (
            <label className="text-sm">Timeframe
              <select value={tf} onChange={(e) => setTf(e.target.value as BinanceInterval)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
                {TFS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          ))}
          {(ind === 'RSI' || ind === 'EMA' || ind === 'VOLUME' || ind === 'MARKETCAP') && (
            <label className="text-sm">Operação
              <select value={op} onChange={(e) => setOp(e.target.value as CondOp)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
                <option value="above">Maior que</option>
                <option value="below">Menor que</option>
                <option value="between">Entre</option>
                <option value="eq">Igual</option>
              </select>
            </label>
          )}
        </div>
        {(ind === 'RSI' || ind === 'EMA' || ind === 'VOLUME' || ind === 'MARKETCAP') && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <input value={v1} onChange={(e) => setV1(e.target.value)} type="number" step="any" placeholder={ind === 'MARKETCAP' ? 'ex: 200000000' : 'ex: 30'} className="w-36 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" />
            {op === 'between' && <><span className="text-muted">e</span><input value={v2} onChange={(e) => setV2(e.target.value)} type="number" step="any" placeholder="ex: 25" className="w-36 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" /></>}
            {ind === 'MARKETCAP' && <span className="text-xs text-muted">USD (ex: 200000000 = $200M)</span>}
            {ind === 'VOLUME' && <span className="text-xs text-muted">× a média (ex: 2)</span>}
          </div>
        )}
        <button onClick={include} className="mt-2 w-full rounded-lg bg-[var(--accent)] py-2 text-sm font-bold text-black">Incluir condição</button>
        {conds.length > 0 && (
          <div className="mt-2 space-y-1">
            {conds.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded bg-[var(--surface-2)] px-2 py-1.5 text-sm">
                <span>{describeCondition(c)}</span>
                <button onClick={() => setConds((prev) => prev.filter((x) => x.id !== c.id))} className="ml-auto text-xs text-muted">remover</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={save} disabled={!name.trim() || !conds.length} className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black disabled:opacity-40">Salvar varredura</button>

      {customScans.length > 0 && (
        <div className="mt-3 space-y-2">
          {customScans.map((s) => (
            <div key={s.id} className="rounded-lg border border-[var(--border)] p-3" style={{ borderLeft: `4px solid ${s.color}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg">{s.icon}</span>
                <strong>{s.name}</strong>
                <span className="text-xs text-muted">{s.conditions.map(describeCondition).join('  +  ')}</span>
                <span className="ml-auto flex gap-1">
                  <button onClick={() => void run(s)} disabled={runningId === s.id} className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-bold text-black disabled:opacity-50">{runningId === s.id ? 'Avaliando…' : 'Avaliar agora'}</button>
                  <button onClick={() => removeScan(s.id)} className="rounded border border-[var(--border)] px-2 py-1 text-xs">excluir</button>
                </span>
              </div>
              {runningId === s.id && <div className="mt-1 text-xs text-muted">{progress}</div>}
              {matches[s.id] && runningId !== s.id && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {matches[s.id].length === 0 && <span className="text-xs text-muted">Nenhum ativo atende às condições agora.</span>}
                  {matches[s.id].map((sym) => <Link key={sym} to={`/monitor?symbol=${sym}`} className="rounded bg-[var(--surface-2)] px-2 py-1 text-xs font-bold hover:underline">{sym}</Link>)}
                </div>
              )}
              {s.description && <div className="mt-1 text-xs text-muted">{s.description}</div>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
