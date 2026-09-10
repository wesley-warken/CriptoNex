import { useEffect, useRef } from 'react';
import { createChart, type IChartApi } from 'lightweight-charts';
import type { Candle } from '@/types';

export interface PriceLine {
  price: number;
  title: string;
  color: string;
}

export function CandleChart({ candles, height = 420, lines = [] }: { candles: Candle[]; height?: number; lines?: PriceLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  useEffect(() => {
    if (!ref.current || !candles.length) return;
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const chart = createChart(ref.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: css('--muted') || '#94a3b8' },
      grid: { vertLines: { color: 'rgba(148,163,184,0.12)' }, horzLines: { color: 'rgba(148,163,184,0.12)' } },
      timeScale: { timeVisible: true },
    });
    chartRef.current = chart;
    const series = chart.addCandlestickSeries({ upColor: '#34d399', downColor: '#fb7185', wickUpColor: '#34d399', wickDownColor: '#fb7185', borderVisible: false });
    series.setData(candles.filter((c) => c.close > 0).map((c) => ({ time: Math.floor(c.time / 1000) as never, open: c.open, high: c.high, low: c.low, close: c.close })));
    for (const l of lines) {
      try {
        series.createPriceLine({ price: l.price, title: l.title, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      } catch {
        /* linha fora da escala */
      }
    }
    chart.timeScale().fitContent();
    const onResize = () => chart.applyOptions({ width: ref.current?.clientWidth ?? 800 });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.remove(); chartRef.current = null; };
  }, [candles, height, JSON.stringify(lines.map((l) => [l.price, l.title]))]);
  if (!candles.length) return <div className="panel p-8 text-center text-sm text-muted">Sem candles para este ativo/timeframe.</div>;
  return <div ref={ref} className="w-full" />;
}
