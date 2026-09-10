import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { binancePrices } from '@/services/providers/binance';
import { useBrapiQuotes, useYahooQuotes } from '@/services/stockQuotes';
import { shouldTrigger } from '@/services/alertEngine';
import { beep } from '@/lib/alerts';

interface Fired {
  id: string;
  text: string;
}

/** Montado uma vez no Shell: avalia alertas ativos e dispara som + toast. */
export function AlertChecker() {
  const alerts = useStore((s) => s.alerts);
  const muted = useStore((s) => s.muted);
  const refreshSec = useStore((s) => s.refreshSec);
  const markTriggered = useStore((s) => s.markTriggered);
  const [fired, setFired] = useState<Fired[]>([]);
  const [tick, setTick] = useState(0);

  const active = useMemo(() => alerts.filter((a) => a.active), [alerts]);
  const cryptoSyms = useMemo(() => active.filter((a) => a.kind === 'crypto').map((a) => a.symbol), [active]);
  const stockSyms = useMemo(() => active.filter((a) => a.kind === 'stock').map((a) => a.symbol), [active]);
  const b3 = useBrapiQuotes(stockSyms.filter((s) => /^[A-Z]{4}[346]$/.test(s) && !s.includes('.')));
  const yh = useYahooQuotes(stockSyms.filter((s) => !(/^[A-Z]{4}[346]$/.test(s) && !s.includes('.'))));
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), Math.max(30, refreshSec) * 1000);
    return () => clearInterval(t);
  }, [refreshSec]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const pairs = [...new Set(cryptoSyms.map((s) => `${s.toUpperCase()}USDT`))];
      if (!pairs.length) {
        setCryptoPrices({});
        return;
      }
      try {
        const px = await binancePrices(pairs);
        if (alive) setCryptoPrices(px);
      } catch {
        /* mantém últimas */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoSyms.join(','), tick]);

  const prices = useMemo(() => {
    const map = new Map<string, number>();
    for (const [pair, px] of Object.entries(cryptoPrices)) map.set(pair.replace(/USDT$/, ''), px);
    for (const [s, q] of b3.map) if (q.price != null) map.set(s, q.price);
    for (const [s, q] of yh.map) if (q.price != null) map.set(s, q.price);
    return map;
  }, [cryptoPrices, b3.map, yh.map]);

  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of active) {
      const px = prices.get(a.symbol);
      if (shouldTrigger(a, px) && !firedRef.current.has(a.id)) {
        firedRef.current.add(a.id);
        beep(muted);
        markTriggered(a.id);
        const text = `${a.symbol} ${a.condition === 'above' ? '≥' : '≤'} ${a.price} (agora ${px})`;
        setFired((f) => [...f.slice(-2), { id: a.id, text }]);
        setTimeout(() => setFired((f) => f.filter((x) => x.id !== a.id)), 12000);
      }
    }
  }, [prices, active, muted, markTriggered]);

  if (!fired.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {fired.map((f) => (
        <div key={f.id} className="panel border-[var(--warn)] p-3 text-sm shadow-xl">
          <strong>🔔 Alerta disparado</strong>
          <div className="tabular">{f.text}</div>
        </div>
      ))}
    </div>
  );
}
