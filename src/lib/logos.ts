import domains from '@/data/company-domains.json';

const MAP = domains as Record<string, string>;

/**
 * URL do favicon da empresa (Google, grátis) ou null.
 * Só tickers com domínio curado — resto usa avatar-letra.
 */
export function companyLogo(symbol: string): string | null {
  const upper = symbol.trim().toUpperCase();
  const direct = MAP[upper];
  if (direct) return `https://www.google.com/s2/favicons?domain=${direct}&sz=128`;
  const base = upper.split(/[.=/-]/)[0];
  const mapped = MAP[base];
  if (mapped) return `https://www.google.com/s2/favicons?domain=${mapped}&sz=128`;
  return null;
}

/** Iniciais para o avatar-letra de fallback (primeiras 2 letras). */
export function avatarLetters(symbol: string): string {
  const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (clean.slice(0, 2) || '?');
}
