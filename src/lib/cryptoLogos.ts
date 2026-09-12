/**
 * Logos de cripto — fontes públicas, sem chave (ver public-apis: CoinGecko / CoinCap / CoinPaprika / CoinLore).
 *
 * Prioridade:
 *  1. `image` do universo (CoinGecko `coins/markets` — já vem no app, oficial e atualizada).
 *  2. CDN CoinCap `assets.coincap.io` — `icons/{symbol}@2x.png` (grátis, sem auth, cobre top milhares).
 *  3. Avatar-letra determinístico (nunca quebra a UI).
 *
 * Uso: `cryptoLogoSources(symbol, image)` → lista ordenada p/ <CoinLogo/> tentar em cascata.
 */

/** Aliases conhecidos onde o ticker ≠ slug do CDN. */
const ALIAS: Record<string, string> = {
  WBTC: 'btc',
  STETH: 'eth',
  WETH: 'eth',
  WSTETH: 'eth',
  CBETH: 'eth',
  RETH: 'eth',
  MATIC: 'matic',
  POL: 'matic',
  IOTA: 'iota',
  MIOTA: 'iota',
  LUNA: 'luna',
  LUNC: 'luna',
  USTC: 'ustc',
  BCH: 'bch',
  BSV: 'bsv',
  XBT: 'btc',
};

function cleanSymbol(symbol: string): string {
  return (symbol ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Slug do CDN para um ticker (minúsculo). */
export function coincapSlug(symbol: string): string {
  const clean = cleanSymbol(symbol);
  if (!clean) return 'generic';
  return (ALIAS[clean] ?? clean).toLowerCase();
}

/** URL direta do CDN CoinCap para o ticker. */
export function coincapLogoUrl(symbol: string): string {
  return `https://assets.coincap.io/assets/icons/${coincapSlug(symbol)}@2x.png`;
}

/** Heurística: parece ticker de cripto (e não ação B3/US)? */
export function looksLikeCrypto(symbol: string): boolean {
  const s = (symbol ?? '').trim().toUpperCase();
  if (!s) return false;
  // Ações/índices/moedas: .SA, =, ^, -, /, dígitos+letras B3 (PETR4), forex (EURUSD=X)
  if (/[.=^/]/.test(s)) return false;
  if (/^[A-Z]{4}[346]$/.test(s.split('.')[0])) return false;
  if (s.length > 12) return false;
  return /^[A-Z0-9]{2,12}$/.test(s);
}

/**
 * Lista ordenada de URLs candidatas (sem o fallback-letra).
 * - image do CoinGecko primeiro (quando houver);
 * - CDN CoinCap em seguida (quando parecer cripto).
 */
export function cryptoLogoSources(symbol: string, image?: string | null): string[] {
  const out: string[] = [];
  const img = (image ?? '').trim();
  if (img) out.push(img);
  if (looksLikeCrypto(symbol)) {
    const cdn = coincapLogoUrl(symbol);
    if (!out.includes(cdn)) out.push(cdn);
  }
  return out;
}

/** Primeira URL disponível (ou null se só restar o avatar-letra). */
export function cryptoLogoUrl(symbol: string, image?: string | null): string | null {
  const src = cryptoLogoSources(symbol, image);
  return src.length ? src[0] : null;
}

/** 1–2 letras para o avatar de fallback. */
export function cryptoFallbackLetters(symbol: string): string {
  const clean = cleanSymbol(symbol);
  return (clean.slice(0, 2) || '?');
}
