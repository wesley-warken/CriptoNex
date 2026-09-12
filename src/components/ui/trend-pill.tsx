import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TrendStatus = 'Alta Forte' | 'Alta' | 'Neutro' | 'Baixa' | 'Baixa Forte';
export type Tone = 'bull' | 'bear' | 'neutral' | 'warn' | 'brand';

export interface PillProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
  className?: string;
  title?: string;
}

/**
 * Pill / Badge semântico do terminal financeiro.
 * Fundo a 12% de opacidade + texto a 100% + dot opcional.
 * Consistente e idêntico em todas as 19 telas.
 */
export function Pill({
  children,
  tone = 'neutral',
  dot = false,
  size = 'xs',
  pulse = false,
  className,
  title,
}: PillProps) {
  const toneClasses: Record<Tone, { bg: string; text: string; dot: string }> = {
    bull: {
      bg: 'bg-[var(--bull-bg)]',
      text: 'text-[var(--bull-text)]',
      dot: 'bg-[var(--bull)]',
    },
    bear: {
      bg: 'bg-[var(--bear-bg)]',
      text: 'text-[var(--bear-text)]',
      dot: 'bg-[var(--bear)]',
    },
    neutral: {
      bg: 'bg-[var(--neutral-bg)]',
      text: 'text-[var(--neutral-text)]',
      dot: 'bg-[var(--neutral)]',
    },
    warn: {
      bg: 'bg-[var(--warn-bg)]',
      text: 'text-[var(--warn-text)]',
      dot: 'bg-[var(--warn)]',
    },
    brand: {
      bg: 'bg-[var(--brand-muted)]',
      text: 'text-[var(--brand)]',
      dot: 'bg-[var(--brand)]',
    },
  };

  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[11px] font-semibold tracking-wide gap-1.5',
    sm: 'px-2.5 py-0.5 text-xs font-semibold tracking-wide gap-1.5',
    md: 'px-3 py-1 text-xs font-bold tracking-wide gap-2',
  };

  const currentTone = toneClasses[tone] || toneClasses.neutral;

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded-full select-none whitespace-nowrap transition-colors duration-150',
        currentTone.bg,
        currentTone.text,
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                currentTone.dot
              )}
            />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', currentTone.dot)} />
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}

export interface TrendPillProps {
  status: TrendStatus | string;
  showDot?: boolean;
  pulse?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * TrendPill: O coração do Radar e de todo indicador de tendência do sistema.
 * 'Alta Forte' | 'Alta' | 'Neutro' | 'Baixa' | 'Baixa Forte'
 */
export function TrendPill({
  status,
  showDot,
  pulse = false,
  size = 'xs',
  className,
}: TrendPillProps) {
  const norm = (status || '').trim().toLowerCase();

  let tone: Tone = 'neutral';
  let label = status;
  let autoDot = false;

  if (norm.includes('forte') && (norm.includes('alta') || norm.includes('bull'))) {
    tone = 'bull';
    label = 'Alta Forte';
    autoDot = true;
  } else if (norm.includes('alta') || norm.includes('bull')) {
    tone = 'bull';
    label = 'Alta';
  } else if (norm.includes('forte') && (norm.includes('baixa') || norm.includes('bear'))) {
    tone = 'bear';
    label = 'Baixa Forte';
    autoDot = true;
  } else if (norm.includes('baixa') || norm.includes('bear')) {
    tone = 'bear';
    label = 'Baixa';
  } else {
    tone = 'neutral';
    label = 'Neutro';
  }

  const hasDot = showDot !== undefined ? showDot : autoDot;

  return (
    <Pill
      tone={tone}
      dot={hasDot}
      pulse={pulse && autoDot}
      size={size}
      className={className}
      title={`Tendência: ${label}`}
    >
      {label}
    </Pill>
  );
}

/**
 * Pílula para estado de RSI com zonas Sobrecomprado (>70), Sobrevendido (<30) e Neutro.
 */
export function RsiPill({ rsi, size = 'xs' }: { rsi: number | null | undefined; size?: 'xs' | 'sm' }) {
  if (rsi === null || rsi === undefined || Number.isNaN(rsi)) {
    return <span className="text-text-muted text-xs">—</span>;
  }

  let tone: Tone = 'neutral';
  let label = `${rsi.toFixed(1)}`;

  if (rsi >= 70) {
    tone = 'bear'; // Sobrecomprado em topo
  } else if (rsi <= 30) {
    tone = 'bull'; // Sobrevendido em fundo
  }

  return (
    <Pill tone={tone} size={size} className="font-mono-tabular">
      <span className="opacity-70 mr-1 text-[10px]">RSI</span>
      {label}
    </Pill>
  );
}

/**
 * Pílula para alinhamento de Médias Móveis (SMA/EMA).
 */
export function AlignmentPill({ alignment }: { alignment: 'bullish' | 'bearish' | 'mixed' | string }) {
  const norm = alignment.toLowerCase();
  if (norm === 'bullish' || norm === 'alta') {
    return <Pill tone="bull" dot size="xs">SMA Bull</Pill>;
  }
  if (norm === 'bearish' || norm === 'baixa') {
    return <Pill tone="bear" dot size="xs">SMA Bear</Pill>;
  }
  return <Pill tone="neutral" size="xs">SMA Misto</Pill>;
}
