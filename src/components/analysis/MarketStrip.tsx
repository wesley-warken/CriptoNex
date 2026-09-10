import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fearGreed, fgLabel } from '@/services/providers/sentiment';
import { geckoGlobal } from '@/services/providers/coingecko';
import { yahooChart } from '@/services/lookup';
import { loadDominance } from '@/services/universe';
import { Panel, PanelTitle, Badge } from '@/components/ui/kit';
import { Sparkline } from '@/components/charts/Sparkline';
import { fmtNum } from '@/lib/format';

function Gauge({ value }: { value: number | null }) {
  const v = value ?? 0;
  const ang = (v / 100) * 180;
  const color = v >= 75 ? '#34d399' : v >= 55 ? '#a3e635' : v >= 45 ? '#fbbf24' : v >= 25 ? '#fb923c' : '#fb7185';
  const cx = 60;
  const cy = 58;
  const r = 48;
  const rad = (a: number) => (a * Math.PI) / 180;
  const px = cx + r * Math.cos(rad(180 - ang));
  const py = cy - r * Math.sin(rad(180 - ang));
  return (
    <svg width="110" height="62" viewBox="0 0 120 66">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--surface-2)" strokeWidth="10" strokeLinecap="round" />
      {value != null && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${px} ${py}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="19" fontWeight="bold" fontFamily="JetBrains Mono, monospace">{value ?? '—'}</text>
    </svg>
  );
}

function trendBadge(v: number | null, invert: boolean): { text: string; tone?: 'up' | 'down' | 'warn' } {
  if (v == null) return { text: '—' };
  const strong = v >= 5 ? 'Alta forte' : v <= -5 ? 'Baixa forte' : v >= 0 ? 'Alta leve' : 'Baixa leve';
  if (!invert) return { text: strong, tone: v >= 5 ? 'up' : v <= -5 ? 'down' : undefined };
  // invertido: alta do ativo é ruim para risco (ouro/dólar)
  return { text: strong, tone: v >= 5 ? 'down' : v <= -5 ? 'up' : undefined };
}

/**
 * Faixa de contexto macro: Medo & Ganância, Dominância BTC (amostra do
 * universo + oficial CoinGecko), Ouro e Dólar com sparkline e tendência.
 */
export function MarketStrip() {
  const [fg, setFg] = useState<number | null>(null);
  const [dom, setDom] = useState<number | null>(null);
  const [domHist, setDomHist] = useState<number[]>([]);
  const [gold, setGold] = useState<{ price: number | null; spark: number[]; chg30: number | null }>({ price: null, spark: [], chg30: null });
  const [usdx, setUsdx] = useState<{ chg30: number | null }>({ chg30: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = await fearGreed(2);
        if (alive) setFg(f.current);
      } catch {
        /* complementar */
      }
      try {
        const g = await geckoGlobal();
        if (alive) setDom(g.btcDominance);
      } catch {
        /* complementar */
      }
      try {
        const h = await loadDominance();
        if (alive && h.length > 1) setDomHist(h.map((p) => p.value));
      } catch {
        /* complementar */
      }
      try {
        const g = await yahooChart('GC=F', '1mo', '1d');
        const closes = g.candles.map((k) => k.close);
        if (alive && closes.length) {
          setGold({ price: g.price, spark: closes.slice(-30), chg30: ((closes[closes.length - 1] / closes[0] - 1) * 100) });
        }
      } catch {
        /* complementar */
      }
      try {
        const d = await yahooChart('DX-Y.NYB', '1mo', '1d');
        const closes = d.candles.map((k) => k.close);
        if (alive && closes.length > 1) setUsdx({ chg30: ((closes[closes.length - 1] / closes[0] - 1) * 100) });
      } catch {
        /* complementar */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const goldB = trendBadge(gold.chg30, true);
  const dxB = trendBadge(usdx.chg30, true);
  const dxTxt = usdx.chg30 == null ? 'Dólar' : usdx.chg30 <= -5 ? 'Dólar em baixa forte' : usdx.chg30 >= 5 ? 'Dólar em alta forte' : 'Dólar';

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Panel>
        <PanelTitle>Fear &amp; Greed</PanelTitle>
        <div className="flex items-center gap-2">
          <Gauge value={fg} />
          <div><div className="text-sm font-semibold">{fg != null ? fgLabel(fg) : '—'}</div><Link to="/social" className="text-xs text-[var(--accent)] hover:underline">ver histórico →</Link></div>
        </div>
      </Panel>
      <Panel>
        <PanelTitle>Dominância BTC</PanelTitle>
        <div className="tabular text-2xl font-bold">{dom != null ? `${dom.toFixed(2)}%` : '—'}</div>
        {domHist.length > 1 ? <Sparkline data={domHist} width={170} height={40} /> : <div className="text-xs text-muted">histórico da amostra em formação</div>}
        {dom != null && <div className="mt-1"><Badge tone={dom >= 58 ? 'warn' : undefined}>{dom >= 58 ? 'BTC dominando — sem altseason' : 'Dominância comportada'}</Badge></div>}
      </Panel>
      <Panel>
        <PanelTitle>Ouro (GC=F)</PanelTitle>
        <div className="tabular text-2xl font-bold" style={{ color: (gold.chg30 ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>{gold.price != null ? fmtNum(gold.price) : '—'}</div>
        <Sparkline data={gold.spark} width={170} height={40} />
        <div className="mt-1"><Badge tone={goldB.tone}>{gold.chg30 != null ? `${goldB.text} · ${gold.chg30 >= 0 ? '+' : ''}${gold.chg30.toFixed(1)}%/30d` : 'Ouro'}</Badge></div>
      </Panel>
      <Panel>
        <PanelTitle>Dólar (DXY)</PanelTitle>
        <div className="mt-1"><Badge tone={dxB.tone}>{dxTxt}{usdx.chg30 != null ? ` · ${usdx.chg30 >= 0 ? '+' : ''}${usdx.chg30.toFixed(1)}%/30d` : ''}</Badge></div>
        <div className="mt-2 text-xs text-muted">Dólar forte costuma pressionar criptos; dólar fraco alivia. Validador, não sinal. <Link to="/regime" className="text-[var(--accent)] hover:underline">detalhes →</Link></div>
      </Panel>
    </div>
  );
}
