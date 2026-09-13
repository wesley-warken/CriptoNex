import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, type PriceAlert } from '@/stores/useStore';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines, binancePrices, type BinanceInterval } from '@/services/providers/binance';
import { useUniverseCrypto } from '@/services/universeHooks';
import { describeCondition, evaluateScan, type AlertCondition, type CondIndicator, type CondOp, type CustomScan } from '@/engine/scanConditions';
import { normalizeAlertSymbol, resolveAlertSymbol, UNIVERSE_EMPTY } from '@/services/alertEngine';
import { Panel, PanelTitle } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MStats, MDot } from '@/components/minimal/MStats';
import { MEmpty } from '@/components/minimal/MEmpty';
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
  const customScans = useStore((s) => s.customScans);
  const [symbol, setSymbol] = useState('BTC');
  const [kind, setKind] = useState<'crypto' | 'stock'>('crypto');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const u = useUniverseCrypto();

  const active = alerts.filter((a) => a.active);
  const history = alerts.filter((a) => !a.active);

  const create = async () => {
    const p = Number(price);
    setFormError(null);
    if (!symbol.trim() || !(p > 0)) {
      setFormError('Informe o símbolo e um preço alvo maior que zero.');
      return;
    }
    let sym: string;
    const r = resolveAlertSymbol(kind, symbol, u.coins);
    if (!r.ok) {
      // Universo ainda vazio: valida o par direto na Binance antes de desistir.
      if (kind === 'crypto' && r.reason === UNIVERSE_EMPTY) {
        const cand = normalizeAlertSymbol(symbol);
        setChecking(true);
        try {
          const px = await binancePrices([`${cand}USDT`]);
          if (px[`${cand}USDT`] == null) {
            setFormError(`Cripto "${cand}" não encontrada na Binance. Confira o símbolo.`);
            return;
          }
          sym = cand;
        } catch {
          setFormError('Sem conexão para validar o símbolo. Tente de novo.');
          return;
        } finally {
          setChecking(false);
        }
      } else {
        setFormError(r.reason);
        return;
      }
    } else {
      sym = r.symbol;
    }
    if (alerts.some((a) => a.active && a.kind === kind && a.symbol === sym && a.condition === condition && a.price === p)) {
      setFormError('Já existe um alerta ativo igual a esse.');
      return;
    }
    const a: PriceAlert = {
      id: `${Date.now()}`,
      symbol: sym!,
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
    <div key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
      <Link
        to={a.kind === 'crypto' ? `/monitor?symbol=${a.symbol}` : `/stocks?symbol=${encodeURIComponent(a.symbol)}`}
        className="w-20 truncate font-bold text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] hover:underline active:scale-[0.98]"
      >
        {a.symbol}
      </Link>

      <MDot tone={a.triggeredAt ? 'flat' : a.active ? 'up' : 'flat'}>
        {a.triggeredAt ? 'disparado' : a.active ? 'ativo' : 'pausado'}
      </MDot>

      <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
        {a.kind === 'crypto' ? 'CRYPTO' : 'AÇÃO'}
      </span>

      <span className="text-right tabular-nums text-[var(--text-primary)]">
        <span className="mr-1 text-[var(--text-muted)]">{a.condition === 'above' ? '≥' : '≤'}</span>
        {fmtNum(a.price)}
      </span>

      {a.triggeredAt ? (
        <span className="text-xs tabular-nums text-[var(--text-muted)]">
          em {new Date(a.triggeredAt).toLocaleString('pt-BR')}
        </span>
      ) : (
        <span className="text-xs tabular-nums text-[var(--text-muted)]">—</span>
      )}

      <span className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => toggleAlert(a.id)}
          className="px-2 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
        >
          {a.active ? 'Pausar' : 'Reativar'}
        </button>
        <button
          onClick={() => removeAlert(a.id)}
          className="px-2 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]"
        >
          Excluir
        </button>
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Faixa de stats */}
      <MStats
        items={[
          { label: 'Total de alertas', value: String(alerts.length), sub: 'cadastrados' },
          { label: 'Monitorando agora', value: String(active.length), sub: 'ativos', tone: 'up' },
          { label: 'Disparados', value: String(alerts.filter((x) => x.triggeredAt).length), sub: 'no histórico', tone: 'muted' },
          { label: 'Varreduras multi-ativo', value: String(customScans.length), sub: 'customizadas', tone: 'muted' },
        ]}
      />

      {/* Novo Alerta (cluster de controles) */}
      <Panel>
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
          <PanelTitle>Novo Alerta de Preço</PanelTitle>
          <span className="text-xs text-[var(--text-muted)]">Disparo local com áudio e toast</span>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-5">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
          >
            <option value="crypto">Cripto (Binance)</option>
            <option value="stock">Ação (B3 / EUA)</option>
          </select>
          <input
            value={symbol}
            onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setFormError(null); }}
            placeholder="Símbolo (BTC, PETR4…)"
            className={`border bg-[var(--surface-1)] px-3 py-2 font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] ${formError ? 'border-[var(--bear)]' : 'border-[var(--border)]'}`}
          />
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as typeof condition)}
            className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
          >
            <option value="above">Acima de (≥)</option>
            <option value="below">Abaixo de (≤)</option>
          </select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Preço alvo"
            type="number"
            step="any"
            className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-right font-bold tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
          />
          <button
            onClick={() => void create()}
            disabled={checking}
            className="bg-[var(--brand)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-opacity duration-150 ease-out hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {checking ? 'Validando…' : '+ Criar Alerta'}
          </button>
        </div>
        {formError && (
          <p className="mt-2 text-xs font-semibold text-[var(--bear)]">{formError}</p>
        )}
        <p className="mt-2.5 text-xs text-[var(--text-muted)]">
          Avaliação automática a cada ciclo de dados. Disparo único com sinal sonoro; reative a qualquer momento para novo ciclo.
        </p>
      </Panel>

      {/* Lista de Alertas Ativos */}
      <MSection
        title={`Alertas ativos (${active.length})`}
        right={<span className="text-xs text-[var(--text-muted)]">Monitoramento em segundo plano</span>}
      >
        <div className="divide-y divide-[var(--border)]">
          {active.length === 0 && <MEmpty title="Nenhum alerta ativo" hint="Crie acima: ex. BTC ≥ 100000." />}
          {active.map(row)}
        </div>
      </MSection>

      {/* Lista de Alertas Pausados / Disparados */}
      {history.length > 0 && (
        <MSection
          title={`Histórico de alertas (${history.length})`}
          right={<span className="text-xs text-[var(--text-muted)]">Pausados ou disparados</span>}
        >
          <div className="divide-y divide-[var(--border)]">
            {history.map(row)}
          </div>
        </MSection>
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
      <div className="grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-3">
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Nome do alerta*<input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: SOBREVENDIDO 4H RSI" className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]" /></label>
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Ícone
          <div className="mt-1 flex gap-1">{ICONS.map((ic) => <button key={ic} onClick={() => setIcon(ic)} className={ic === icon ? 'border border-[var(--brand)] px-1.5 py-0.5 text-sm text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]' : 'border border-[var(--border)] px-1.5 py-0.5 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'}>{ic}</button>)}</div>
        </label>
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Cor do alerta
          <div className="mt-1 flex gap-1">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className="h-6 w-8 border border-[var(--border)] transition-transform duration-150 ease-out active:scale-[0.98]" style={{ background: c, outline: c === color ? '2px solid var(--brand)' : 'none' }} />)}</div>
        </label>
      </div>
      <label className="mt-2 block text-xs uppercase tracking-wider text-[var(--text-muted)]">Descrição<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex: criptos com RSI 4h em sobrevenda" className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]" rows={2} /></label>

      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Adicionar condição</div>
        <div className="grid gap-2 text-sm text-[var(--text-secondary)] md:grid-cols-4">
          <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Indicador
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
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]"
            >
              {INDICATORS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
            </select>
          </label>
          {(ind === 'RSI' || ind === 'TREND' || ind === 'MACD') && (
            <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Predefinição
              <select value={preset} onChange={(e) => applyPreset(e.target.value)} className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]">
                {ind === 'RSI' && <><option value="oversold">Sobrevendido (&lt;30)</option><option value="overbought">Sobrecomprado (&gt;70)</option><option value="range">Faixa customizada</option></>}
                {ind === 'TREND' && <><option value="bull">Alta</option><option value="bear">Baixa</option></>}
                {ind === 'MACD' && <><option value="pos">Positivo</option><option value="neg">Negativo</option></>}
              </select>
            </label>
          )}
          {ind !== 'MARKETCAP' && (ind === 'TREND' || ind === 'SUPERTREND' || ind === 'MACD' ? null : (
            <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Timeframe
              <select value={tf} onChange={(e) => setTf(e.target.value as BinanceInterval)} className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]">
                {TFS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          ))}
          {(ind === 'RSI' || ind === 'EMA' || ind === 'VOLUME' || ind === 'MARKETCAP') && (
            <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Operação
              <select value={op} onChange={(e) => setOp(e.target.value as CondOp)} className="mt-1 w-full border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]">
                <option value="above">Maior que</option>
                <option value="below">Menor que</option>
                <option value="between">Entre</option>
                <option value="eq">Igual</option>
              </select>
            </label>
          )}
        </div>
        {(ind === 'RSI' || ind === 'EMA' || ind === 'VOLUME' || ind === 'MARKETCAP') && (
          <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input value={v1} onChange={(e) => setV1(e.target.value)} type="number" step="any" placeholder={ind === 'MARKETCAP' ? 'ex: 200000000' : 'ex: 30'} className="w-36 border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-right tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]" />
            {op === 'between' && <><span className="text-[var(--text-muted)]">e</span><input value={v2} onChange={(e) => setV2(e.target.value)} type="number" step="any" placeholder="ex: 25" className="w-36 border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-right tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]" /></>}
            {ind === 'MARKETCAP' && <span className="text-xs text-[var(--text-muted)]">USD (ex: 200000000 = $200M)</span>}
            {ind === 'VOLUME' && <span className="text-xs text-[var(--text-muted)]">× a média (ex: 2)</span>}
          </div>
        )}
        <button onClick={include} className="mt-2 w-full border border-[var(--border)] bg-[var(--surface-2)] py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--brand)] active:scale-[0.98]">Incluir condição</button>
        {conds.length > 0 && (
          <div className="mt-2 divide-y divide-[var(--border)]">
            {conds.map((c) => (
              <div key={c.id} className="flex items-center gap-2 py-1.5 text-sm text-[var(--text-secondary)]">
                <span>{describeCondition(c)}</span>
                <button onClick={() => setConds((prev) => prev.filter((x) => x.id !== c.id))} className="ml-auto text-xs uppercase tracking-wider text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]">remover</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={save} disabled={!name.trim() || !conds.length} className="mt-2 bg-[var(--brand)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-opacity duration-150 ease-out hover:opacity-90 active:scale-[0.98] disabled:opacity-40">Salvar varredura</button>

      {customScans.length > 0 && (
        <div className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {customScans.map((s) => (
            <div key={s.id} className="py-3 transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="text-sm text-[var(--text-primary)]">{s.icon}</span>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-bold text-[var(--text-primary)]">{s.name}</strong>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                </div>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">{s.conditions.map(describeCondition).join('  +  ')}</span>
                <span className="ml-auto flex gap-1.5">
                  <button
                    onClick={() => void run(s)}
                    disabled={runningId === s.id}
                    className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--brand)] active:scale-[0.98] disabled:opacity-50"
                  >
                    {runningId === s.id ? 'Avaliando…' : 'Avaliar agora'}
                  </button>
                  <button
                    onClick={() => removeScan(s.id)}
                    className="border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--bear)] active:scale-[0.98]"
                  >
                    Excluir
                  </button>
                </span>
              </div>
              {runningId === s.id && <div className="mt-1.5 animate-pulse text-xs tabular-nums text-[var(--text-secondary)]">{progress}</div>}
              {matches[s.id] && runningId !== s.id && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2">
                  <span className="text-xs text-[var(--text-muted)]">Ativos correspondentes:</span>
                  {matches[s.id].length === 0 && <span className="text-xs text-[var(--text-muted)]">Nenhum ativo atende às condições agora.</span>}
                  {matches[s.id].map((sym) => (
                    <Link
                      key={sym}
                      to={`/monitor?symbol=${sym}`}
                      className="border border-[var(--border)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--brand)] active:scale-[0.98]"
                    >
                      {sym}
                    </Link>
                  ))}
                </div>
              )}
              {s.description && <div className="mt-1.5 text-xs text-[var(--text-muted)]">{s.description}</div>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
