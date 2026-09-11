export function fmtUSD(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(digits)}`;
}
export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}
export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

/**
 * Preço com precisão adaptativa: ≥1 → 2 casas; 0,01–1 → 4 casas;
 * abaixo disso, zeros à esquerda + 4 significativos (ex.: SHIB $0.00001234
 * em vez de $0.00). Moedas minúsculas finalmente aparecem.
 */
export function fmtPrice(n: number | null | undefined): string {
  const s = fmtPriceNum(n);
  return s === '—' ? s : `$${s}`;
}

export function fmtPriceNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return fmtUSD(n).replace('$', '');
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(4);
  if (abs === 0) return '0.00';
  const digits = Math.min(Math.floor(-Math.log10(abs)) + 4, 12);
  return String(parseFloat(n.toFixed(digits)));
}
export function timeAgo(ts: number | null): string {
  if (!ts) return 'sem dados';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'agora mesmo';
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}
export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

/** Offset fixo de Brasília: UTC-3, sem horário de verão desde 2019. */
export const BRASILIA_OFFSET_MIN = 180;

/**
 * Desloca um timestamp para que um eixo que renderiza em UTC
 * (lightweight-charts v4 usa getUTCHours) exiba o horário de Brasília.
 * Ordem e espaçamento preservados.
 */
export function shiftToBrasilia(ts: number): number {
  return ts - BRASILIA_OFFSET_MIN * 60_000;
}

/** Data de Brasília {year, month, day} para eixos diários (sem hora). */
export function brasiliaBusinessDay(ts: number): { year: number; month: number; day: number } {
  const d = new Date(shiftToBrasilia(ts));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const MESES_PT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Rótulo do crosshair do gráfico: BusinessDay → só data ("09 jun. '26");
 * timestamp numérico (já deslocado p/ parede BRT) → data + hora.
 */
export function formatCrosshairTime(t: unknown): string {
  if (typeof t === 'number') {
    const d = new Date(t * 1000);
    return `${pad2(d.getUTCDate())} ${MESES_PT[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
  const b = t as { year: number; month: number; day: number };
  return `${pad2(b.day)} ${MESES_PT[b.month - 1]} '${String(b.year).slice(2)}`;
}
