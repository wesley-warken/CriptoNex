import { useEffect, useRef } from 'react';
import { createChart, type BusinessDay, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import { brasiliaBusinessDay, formatCrosshairTime, shiftToBrasilia } from '@/lib/format';

export interface PriceLine {
  price: number;
  title: string;
  color: string;
}

export function CandleChart({ candles, height = 420, lines = [], dailyOrAbove = true }: { candles: Candle[]; height?: number; lines?: PriceLine[]; dailyOrAbove?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const fittedRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const lastFullLoadRef = useRef(0);
  const lastFmtRef = useRef<boolean | null>(null);

  // Monta quando a div existe E há dados (troca de ativo/timeframe remonta via key no pai).
  // Refs zeradas aqui: no remount (ex.: StrictMode), o efeito de dados abaixo
  // precisa refazer setData()+fit em vez de update() numa série vazia (virava 1 vela).
  const ready = candles.length > 0;
  useEffect(() => {
    if (!ref.current || !ready) return;
    lastTimeRef.current = null;
    fittedRef.current = false;
    lastFullLoadRef.current = 0;
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const chart = createChart(ref.current, {
      height,
      width: ref.current.clientWidth || 800,
      layout: { background: { color: 'transparent' }, textColor: css('--muted') || '#94a3b8' },
      grid: { vertLines: { color: 'rgba(148,163,184,0.12)' }, horzLines: { color: 'rgba(148,163,184,0.12)' } },
      timeScale: { timeVisible: true },
      localization: { locale: 'pt-BR', timeFormatter: (t: BusinessDay | UTCTimestamp) => formatCrosshairTime(t) },
    });
    chartRef.current = chart;
    seriesRef.current = chart.addCandlestickSeries({ upColor: '#34d399', downColor: '#fb7185', wickUpColor: '#34d399', wickDownColor: '#fb7185', borderVisible: false });
    const onResize = () => chart.applyOptions({ width: ref.current?.clientWidth ?? 800 });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.remove(); chartRef.current = null; seriesRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Atualiza dados sem reconstruir (preserva zoom/scroll/crosshair no tempo real).
  // Tick no candle aberto usa update() (barato); candle novo ou troca usa setData().
  // Barras são saneadas (ordenadas, sem duplicadas/inválidas) — a lib quebra com dado ruim.
  const lineKey = JSON.stringify(lines.map((l) => [l.price, l.title]));
  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart) return;
    const seen = new Set<number>();
    // Diário/semanal: só a data de Brasília (sem "21:00:00"); intradiário: data+hora
    const toTime = (ms: number) => (dailyOrAbove ? (brasiliaBusinessDay(ms) as never) : (Math.floor(shiftToBrasilia(ms) / 1000) as never));
    const clean = candles
      .filter((c) => c.close > 0 && [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v)))
      .sort((a, b) => a.time - b.time)
      .filter((c) => {
        if (seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
      });
    if (!clean.length) return;
    const mapped = clean.map((c) => ({ time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
    const lastMs = clean[clean.length - 1].time;
    // Troca de formato (data <-> data+hora) exige setData cheio: tipos mistos quebram a série
    const fmtChanged = lastFmtRef.current !== null && lastFmtRef.current !== dailyOrAbove;
    lastFmtRef.current = dailyOrAbove;
    try {
      if (!fmtChanged && lastTimeRef.current !== null && lastMs === lastTimeRef.current) {
        s.update(mapped[mapped.length - 1]);
      } else {
        s.setData(mapped);
        lastTimeRef.current = lastMs;
        lastFullLoadRef.current = Date.now();
      }
    } catch {
      try {
        s.setData(mapped);
        lastTimeRef.current = lastMs;
        lastFullLoadRef.current = Date.now();
      } catch {
        /* dado irrecuperável: mantém o anterior */
      }
    }
    for (const l of linesRef.current) {
      try { s.removePriceLine(l); } catch { /* já removida */ }
    }
    linesRef.current = [];
    for (const l of lines) {
      try {
        linesRef.current.push(s.createPriceLine({ price: l.price, title: l.title, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
      } catch {
        /* linha fora da escala */
      }
    }
    if (!fittedRef.current && candles.length) {
      chart.timeScale().fitContent();
      fittedRef.current = true;
    }
    // Auto-cura: se o viewport colapsou para poucas barras logo após carga
    // cheia (com dados de sobra), reenquadra. Zoom manual posterior é respeitado.
    if (Date.now() - lastFullLoadRef.current < 5000 && mapped.length > 10) {
      try {
        const r = chart.timeScale().getVisibleLogicalRange();
        if (r && r.to - r.from < 5) {
          chart.timeScale().fitContent();
          console.debug('[chart] viewport colapsado — reenquadrado', { bars: mapped.length });
        }
      } catch {
        /* ignora */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, lineKey, dailyOrAbove]);

  if (!candles.length) return <div className="panel p-8 text-center text-sm text-muted">Sem candles para este ativo/timeframe.</div>;
  return <div ref={ref} className="w-full" />;
}
