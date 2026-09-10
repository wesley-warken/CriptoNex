import { useEffect, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { yahooChart } from '@/services/lookup';
import { Panel, PanelTitle, Badge, Skeleton, ErrorBox } from '@/components/ui/kit';
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
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel>
        <PanelTitle>Market Regime</PanelTitle>
        {rows.map(([k, v]) => <div key={k} className="flex justify-between border-b border-[var(--border)] py-2 text-sm"><span className="text-muted">{k}</span><strong>{v}</strong></div>)}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-muted">REGIME</span>
          <Badge tone={tone}>{r.label}</Badge>
          <span className="tabular text-sm">Confiança {r.confidence}%</span>
        </div>
        <p className="mt-3 text-sm text-muted">O regime influencia a interpretação dos sinais: em RISK-OFF, sinais BUY exigem confirmação extra; em RISK-ON, sinais SELL pedem cautela redobrada. Leitura probabilística, nunca garantia.</p>
      </Panel>
      <Panel>
        <PanelTitle>Como ler</PanelTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><strong>STRONG RISK-ON:</strong> amplitude e momentum alinhados — ambiente mais favorável a risco.</li>
          <li><strong>RISK-ON:</strong> viés positivo, com pontos de atenção.</li>
          <li><strong>NEUTRAL:</strong> sem dominância — seletividade máxima.</li>
          <li><strong>RISK-OFF:</strong> amplitude fraca — preservação de capital.</li>
          <li><strong>STRONG RISK-OFF:</strong> estresse amplo — reduzir exposição e exigir confirmação.</li>
        </ul>
      </Panel>
      <Panel>
        <PanelTitle>Validadores externos (ouro e dólar)</PanelTitle>
        {validators.length === 0 && <div className="text-sm text-muted">Carregando…</div>}
        {validators.map((v) => {
          const b = trendBadge(v.trend30d);
          return (
            <div key={v.symbol} className="border-b border-[var(--border)] py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{v.label} <span className="font-mono text-xs">{v.symbol}</span></span>
                <span className="flex items-center gap-2">
                  <Badge tone={b.tone}>{b.text}</Badge>
                  <strong className="tabular">{v.price != null ? fmtNum(v.price) : '—'}</strong>{' '}
                  <span className="tabular" style={{ color: (v.chg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{v.chg != null ? fmtPct(v.chg) : ''}</span>
                </span>
              </div>
              {v.spark.length > 1 && <div className="mt-1"><Sparkline data={v.spark} width={220} height={36} /></div>}
            </div>
          );
        })}
        <p className="mt-2 text-xs text-muted">Ouro em alta forte sugere migração de ativos de risco para segurança — confirma viés defensivo. Dólar forte costuma pressionar criptos. Validadores, não sinais.</p>
      </Panel>
    </div>
  );
}
