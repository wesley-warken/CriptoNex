import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { coinHistory } from '@/services/history';
import { detectPatterns } from '@/engine/patterns';
import { cycleReading, type CycleZone } from '@/engine/cycle';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MEmpty } from '@/components/minimal/MEmpty';
import { Fullscreen } from '@/components/charts/Fullscreen';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { snapshot, calcEMA } from '@/engine/indicators';

function volRatio10(kl: { volume: number }[]): number | null {
  if (kl.length < 11) return null;
  const avg = kl.slice(-11, -1).reduce((s, k) => s + k.volume, 0) / 10;
  if (!avg) return null;
  return kl[kl.length - 1].volume / avg;
}

function emaCross(closes: number[], fast = 9, slow = 26): 'bullish' | 'bearish' | null {
  if (closes.length < slow + 2) return null;
  const f = calcEMA(closes, fast);
  const s = calcEMA(closes, slow);
  const n = Math.min(f.length, s.length);
  if (n < 2) return null;
  const now = f[n - 1] - s[n - 1];
  const prev = f[n - 2] - s[n - 2];
  if (prev <= 0 && now > 0) return 'bullish';
  if (prev >= 0 && now < 0) return 'bearish';
  return null;
}

type RangeKey = '6m' | '1y' | 'all';
const RANGES: { k: RangeKey; label: string; days: number }[] = [
  { k: '6m', label: '6 meses', days: 180 },
  { k: '1y', label: '1 ano', days: 365 },
  { k: 'all', label: 'Tudo', days: 1095 },
];

const ZONE_COLOR: Record<CycleZone, string> = {
  'acumulacao': '#9aa7b4',
  'neutra': '#9aa7b4',
  'euforia': '#f59e0b',
  'topo-risco': '#f59e0b',
};

export function TopHunter() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const a = useAnalysis(m.data, m.candles);
  const [asset, setAsset] = useState('BTC');
  const [range, setRange] = useState<RangeKey>('1y');
  const [closes, setCloses] = useState<number[]>([]);
  const [cycleLoading, setCycleLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setCycleLoading(true);
      try {
        const meta = CRYPTO_ASSETS.find((x) => x.symbol === asset);
        const id = meta?.coingeckoId ?? asset.toLowerCase();
        const all = await coinHistory(id);
        if (alive) setCloses(all);
      } catch {
        if (alive) setCloses([]);
      } finally {
        if (alive) setCycleLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [asset]);

  const days = RANGES.find((r) => r.k === range)?.days ?? 365;
  const series = useMemo(() => {
    const now = Date.now();
    const win = closes.slice(-days);
    if (win.length < 10) return [];
    const hi = Math.max(...win);
    const lo = Math.min(...win);
    return win.map((c, i) => ({
      t: new Date(now - (win.length - 1 - i) * 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      price: c,
      pct: hi <= lo ? 50 : Math.round(((c - lo) / (hi - lo)) * 100),
    }));
  }, [closes, days]);
  const reading = useMemo(() => {
    if (!closes.length) return null;
    const now = Date.now();
    const win = closes.slice(-days);
    const kl = win.map((c, i) => ({ time: now - (win.length - 1 - i) * 86400000, open: c, high: c, low: c, close: c, volume: 0 }));
    return cycleReading(kl, RANGES.find((r) => r.k === range)?.label ?? '');
  }, [closes, days, range]);
  const hot = (reading?.pct ?? 0) >= 70;

  const patterns = useMemo(
    () =>
      m.data.slice(0, 25).map((d) => {
        const kl = m.candles[d.symbol] ?? [];
        const pats = kl.length ? detectPatterns(kl) : [];
        const top = pats[0] ?? null;
        const sc = a.bySym.get(d.symbol);
        return { d, top, pats, signal: sc?.signal ?? null };
      }),
    [m.data, m.candles, a.bySym],
  );

  if (m.loading) return <Skeleton className="h-72" />;
  if (m.error && !m.data.length) return <ErrorBox message={m.error} onRetry={m.reload} />;

  return (
    <div className="space-y-3">
      <Fullscreen title="Caçador de topos e fundos — posição no ciclo">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <select value={asset} onChange={(e) => setAsset(e.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 font-semibold text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]">
            {CRYPTO_ASSETS.map((x) => <option key={x.symbol} value={x.symbol}>{x.symbol} — {x.name}</option>)}
          </select>
          <div className="flex gap-4 text-xs">
            {RANGES.map((r) => <button key={r.k} onClick={() => setRange(r.k)} className={r.k === range ? 'font-semibold tabular-nums text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]' : 'tabular-nums text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'}>{r.label}</button>)}
          </div>
          {reading && (
            <span className="ml-auto flex items-baseline gap-2">
              <span className={`text-2xl font-semibold tabular-nums ${hot ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'}`}>{reading.pct}%</span>
              <span className={`text-xs font-semibold uppercase tracking-wider ${reading.zone === 'topo-risco' || reading.zone === 'euforia' ? 'text-[var(--bear)]' : reading.zone === 'acumulacao' ? 'text-[var(--bull)]' : 'text-[var(--text-secondary)]'}`}>
                {reading.zone === 'topo-risco' ? 'risco de topo' : reading.zone === 'euforia' ? 'euforia' : reading.zone === 'acumulacao' ? 'possível fundo' : 'neutro'}
              </span>
            </span>
          )}
        </div>
        {cycleLoading ? <Skeleton className="h-64" /> : series.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series}>
              <XAxis dataKey="t" fontSize={10} minTickGap={40} />
              <YAxis fontSize={10} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip formatter={(v, name) => (name === 'pct' ? [`${v}%`, 'posição no range'] : [v, name])} labelFormatter={(l) => `Dia ${l}`} />
              <Area type="monotone" dataKey="pct" stroke={hot ? 'var(--bear)' : 'var(--brand)'} fill={hot ? 'var(--bear)' : 'var(--brand)'} fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <MEmpty title="Sem histórico suficiente" hint="Sem histórico suficiente para este ativo/período." />
        )}
        {reading && <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs leading-5 text-[var(--text-muted)]">{reading.note} Leitura probabilística com acertos e erros no passado — o mercado é soberano.</p>}
      </Fullscreen>

      <MSection title="Padrões, sentimento e estágio · top 25">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]"><th className="p-2">Moeda</th><th className="p-2">Atualizado</th><th className="p-2">Sentimento</th><th className="p-2">Estágio</th><th className="p-2">Padrão gráfico</th><th className="p-2 text-right">Análise</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {patterns.map(({ d, top, signal }) => (
                <tr key={d.symbol} className="transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]">
                  <td className="p-2 font-semibold text-[var(--text-primary)]">{d.symbol} <span className="text-xs font-normal text-[var(--text-muted)]">{d.name}</span></td>
                  <td className="p-2 text-xs tabular-nums text-[var(--text-muted)]">{(() => { const kl = m.candles[d.symbol] ?? []; const t = kl.length ? kl[kl.length - 1].time : null; return t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; })()}</td>
                  <td className="p-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${!top ? (signal === 'BUY' ? 'text-[var(--bull)]' : signal === 'SELL' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]') : top.sentiment === 'Bullish' ? 'text-[var(--bull)]' : top.sentiment === 'Bearish' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'}`}>
                      {!top ? (signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutro') : top.sentiment === 'Bullish' ? 'Bullish' : top.sentiment === 'Bearish' ? 'Bearish' : 'Neutro'}
                    </span>
                  </td>
                  <td className="p-2 text-[var(--text-secondary)]">{top?.stage ?? '—'}</td>
                  <td className="p-2 tabular-nums text-[var(--text-secondary)]">{top ? `${top.pattern} (${top.confidence}%)` : <span className="text-[var(--text-muted)]">sem padrão claro</span>}</td>
                  <td className="p-2 text-right"><Link to={`/monitor?symbol=${d.symbol}`} className="text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--brand)] active:scale-[0.98]">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MSection>

      <div className="grid gap-3 md:grid-cols-2">
        {m.data.map((d) => {
          const kl = m.candles[d.symbol] ?? [];
          if (!kl.length) return null;
          const s = snapshot(kl);
          const closes = kl.map((k) => k.close);
          const hi52 = Math.max(...closes);
          const lo52 = Math.min(...closes);
          const last = closes[closes.length - 1];
          const nearHigh = last >= hi52 * 0.97;
          const nearLow = last <= lo52 * 1.03;
          const volSpike = (s.volumeRatio ?? 0) >= 2;
          const vol10 = volRatio10(kl);
          const cross9x26 = emaCross(closes, 9, 26);
          const events: string[] = [];
          if (nearHigh) events.push('Próximo da máxima do período');
          if (nearLow) events.push('Próximo da mínima do período — possível fundo');
          if (volSpike) events.push(`Volume spike ${(s.volumeRatio ?? 0).toFixed(1)}× média 20d`);
          if (vol10 != null && vol10 >= 2) events.push(`Barra atual ${(vol10).toFixed(2)}× a média das últimas 10 barras`);
          if (cross9x26 === 'bullish') events.push('EMA9 cruzou ACIMA da EMA26');
          if (cross9x26 === 'bearish') events.push('EMA9 cruzou ABAIXO da EMA26');
          if (s.supertrend === 'BULLISH') events.push('Supertrend bullish');
          if (s.rsi != null && s.rsi < 30) events.push(`Sobrevenda (RSI ${s.rsi.toFixed(1)})`);
          if (s.rsi != null && s.rsi > 70) events.push(`Sobrecompra (RSI ${s.rsi.toFixed(1)})`);
          if (!events.length) return null;
          const score = a.bySym.get(d.symbol);
          return (
            <div key={d.symbol} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={`/monitor?symbol=${d.symbol}`} className="text-sm font-semibold tabular-nums text-[var(--text-primary)] transition-colors duration-150 ease-out hover:text-[var(--brand)] active:scale-[0.98]">{d.symbol}</Link>
                {score && (
                  <span className={`text-xs font-semibold uppercase tracking-wider ${score.signal === 'BUY' ? 'text-[var(--bull)]' : score.signal === 'SELL' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'}`}>
                    {score.signal}
                  </span>
                )}
              </div>
              {events.map((e) => <div key={e} className="py-0.5 text-sm text-[var(--text-secondary)]">{e}</div>)}
              {score && <div className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">Score {score.score} · conf {score.confidence}% · linguagem probabilística: confirmação por preço/volume ainda necessária.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
