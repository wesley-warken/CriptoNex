import { useMemo } from 'react';
export function Sparkline({ data, width = 120, height = 36 }: { data: number[]; width?: number; height?: number }) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (data.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`).join(' ');
  }, [data, width, height]);
  if (!data || data.length < 2) return <span className="text-xs text-muted">sem dados</span>;
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.6} />
    </svg>
  );
}
