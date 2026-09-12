import { useMemo, useState } from 'react';
import { companyLogo } from '@/lib/logos';
import { cryptoFallbackLetters, cryptoLogoSources, looksLikeCrypto } from '@/lib/cryptoLogos';
import { cn } from '@/lib/utils';

interface CoinLogoProps {
  symbol: string;
  /** URL oficial (ex.: UniverseCoin.image do CoinGecko). */
  image?: string | null;
  size?: number;
  className?: string;
}

/**
 * Logo universal de cripto — toda moeda do site passa por aqui.
 * Cascata: CoinGecko (image) → CDN CoinCap → favicon da empresa (ação) → avatar-letra.
 * Nunca quebra: se todas as URLs falharem, exibe avatar com iniciais.
 */
export function CoinLogo({ symbol, image, size = 22, className }: CoinLogoProps) {
  const sources = useMemo(() => {
    const base = cryptoLogoSources(symbol, image);
    // Ação (B3/US): tenta favicon curado como último recurso antes da letra.
    if (!looksLikeCrypto(symbol)) {
      const fav = companyLogo(symbol);
      if (fav && !base.includes(fav)) base.push(fav);
    }
    return base;
  }, [symbol, image]);
  const [idx, setIdx] = useState(0);
  const letters = cryptoFallbackLetters(symbol);

  if (idx < sources.length) {
    return (
      <img
        src={sources[idx]}
        alt={symbol}
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        onError={() => setIdx((i) => i + 1)}
        className={cn('shrink-0 rounded-full bg-[var(--surface-2)] object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      title={symbol}
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] font-bold text-[var(--text-secondary)]',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
    >
      {letters}
    </span>
  );
}
