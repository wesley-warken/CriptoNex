import { fmtPrice } from '@/lib/format';

/**
 * presentation/format — formatação mínima da tela (tipografia, não decisão).
 * Números sempre com tabular-nums no JSX; aqui só o texto.
 */

/** +21.8% / -3.2% / — (uma casa, sinal explícito no positivo). */
export function signedPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function price(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return fmtPrice(v);
}

/** HH:mm de um timestamp (hora local). */
export function shortTime(ts: number | null): string {
  if (ts == null) return '—';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const SETUP_SHORT: Record<string, string> = {
  'trend-continuation': 'Tendência',
  pullback: 'Pullback',
  breakout: 'Rompimento',
  momentum: 'Momentum',
  reversal: 'Reversão',
  watch: 'Observação',
};

export function setupShort(kind: string): string {
  return SETUP_SHORT[kind] ?? kind;
}
