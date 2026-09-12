import { useEffect, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { yahooChart } from '@/services/lookup';
import { Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MDot } from '@/components/minimal/MStats';
import { MRow } from '@/components/minimal/MRow';
import { Sparkline } from '@/components/charts/Sparkline';
import { fmtNum, fmtPct } from '@/lib/format';

interface Validator {
  symbol: string;
  label: string;
  price: number | null;
  chg: number | null;
  spark: number[];
  trend30d: number | null;
}

function trendBadge(v: number | null): { text: string; tone?: 'up' | 'down' | 'warn' } {
  if (v == null) return { text: '—' };
  if (v >= 5) return { text: 'Alta forte', tone: 'up' };
  if (v <= -5) return { text: 'Baixa forte', tone: 'down' };
  if (v >= 0) return { text: 'Alta leve', tone: undefined };
  return { text: 'Baixa leve', tone: undefined };
}

export function RegimePage() {
  const m = useCryptoMarket(useStore((s) => s.refreshSec));
  const a = useAnalysis(m.data, m.candles);
  const [validators, setValidators] = useState<Validator[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const defs = [
        { symbol: 'GC=F', label: 'Ouro (fuga p/ segurança)' },
        { symbol: 'DX-Y.NYB', label: 'Dólar Index' },
      ];
      const out: Validator[] = [];
      for (const d of defs) {
        try {
          const q = await yahooChart(d.symbol, '1mo', '1d');
          const closes = q.candles.map((k) => k.close);
          const first = closes.length ? closes[0] : null;
          out.push({
            ...d,
            price: q.price,
            chg: q.changePct,
            spark: closes.slice(-30),
            trend30d: first && q.price ? ((q.price / first - 1) * 100) : null,
          });
        } catch {
          out.push({ ...d, price: null, chg: null, spark: [], trend30d: null });
        }
      }
      if (alive) setValidators(out);
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (m.loading) return <Skeleton className="h-72" />;
  if (m.error && !m.data.length) return <ErrorBox message={m.error} onRetry={m.reload} />;
  const r = a.regime;
  const tone = r.label.includes('RISK-ON') ? 'up' : r.label.includes('RISK-OFF') ? 'down' : 'warn';
  const rows: [string, string][] = [
    ['BTC Trend', r.btcTrend],
    ['Market Breadth', `${r.breadth}%`],
    ['BTC Dominance', r.dominanceFalling ? 'FALLING' : 'RISING / STABLE'],
    ['Momentum', r.momentum],
    ['Volume', r.volumeExpanding ? 'EXPANDING' : 'CONTRACTING'],
    ['Volatility', r.volatility],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MSection title="Market regime">
        <dl>
          {rows.map(([k, v]) => <MRow key={k} k={k} v={v} />)}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Regime</span>
          <MDot tone={tone === 'up' ? 'up' : tone === 'down' ? 'down' : 'flat'}>{r.label}</MDot>
          <span className="text-sm tabular-nums text-[var(--text-secondary)]">Confiança {r.confidence}%</span>
        </div>
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm leading-6 text-[var(--text-secondary)]">O regime influencia a interpretação dos sinais: em RISK-OFF, sinais BUY exigem confirmação extra; em RISK-ON, sinais SELL pedem cautela redobrada. Leitura probabilística, nunca garantia.</p>
      </MSection>
      <MSection title="Como ler">
        <ul className="space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
          <li><span className="font-semibold text-[var(--text-primary)]">STRONG RISK-ON:</span> amplitude e momentum alinhados — ambiente mais favorável a risco.</li>
          <li><span className="font-semibold text-[var(--text-primary)]">RISK-ON:</span> viés positivo, com pontos de atenção.</li>
          <li><span className="font-semibold text-[var(--text-primary)]">NEUTRAL:</span> sem dominância — seletividade máxima.</li>
          <li><span className="font-semibold text-[var(--text-primary)]">RISK-OFF:</span> amplitude fraca — preservação de capital.</li>
          <li><span className="font-semibold text-[var(--text-primary)]">STRONG RISK-OFF:</span> estresse amplo — reduzir exposição e exigir confirmação.</li>
        </ul>
      </MSection>
      <MSection title="Validadores externos · ouro e dólar">
        {validators.length === 0 && <div className="text-sm text-[var(--text-muted)]">Carregando…</div>}
        {validators.map((v) => {
          const b = trendBadge(v.trend30d);
          return (
            <div key={v.symbol} className="border-b border-[var(--border)] py-2 last:border-b-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--text-secondary)]">{v.label} <span className="text-xs tabular-nums text-[var(--text-muted)]">{v.symbol}</span></span>
                <span className="flex items-baseline gap-2 text-right">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${b.tone === 'up' ? 'text-[var(--bull)]' : b.tone === 'down' ? 'text-[var(--bear)]' : 'text-[var(--text-secondary)]'}`}>{b.text}</span>
                  <span className="font-semibold tabular-nums text-[var(--text-primary)]">{v.price != null ? fmtNum(v.price) : '—'}</span>{' '}
                  <span className={`tabular-nums font-medium ${(v.chg ?? 0) >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>{v.chg != null ? fmtPct(v.chg) : ''}</span>
                </span>
              </div>
              {v.spark.length > 1 && <div className="mt-1"><Sparkline data={v.spark} width={220} height={36} /></div>}
            </div>
          );
        })}
        <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs leading-5 text-[var(--text-muted)]">Ouro em alta forte sugere migração de ativos de risco para segurança — confirma viés defensivo. Dólar forte costuma pressionar criptos. Validadores, não sinais.</p>
      </MSection>
    </div>
  );
}
