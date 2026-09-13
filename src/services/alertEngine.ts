import type { PriceAlert } from '@/stores/useStore';

/** Puro e testável: o alerta dispara quando o preço cruza a condição. */
export function shouldTrigger(alert: PriceAlert, price: number | null | undefined): boolean {
  if (!alert.active || price == null || Number.isNaN(price)) return false;
  return alert.condition === 'above' ? price >= alert.price : price <= alert.price;
}

/** Normaliza símbolo digitado (caixa alta, sem espaços). */
export function normalizeAlertSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export type AlertSymbolResolution =
  | { ok: true; symbol: string }
  | { ok: false; reason: string };

/**
 * Valida que o símbolo do alerta existe antes de cadastrar — cripto
 * inexistente gerava alerta morto que nunca disparava (bug crítico).
 * Cripto: match exato no universo (símbolo ou id, case-insensitive),
 * devolvendo o símbolo canônico. Sem universo carregado, retorna o
 * sentinela UNIVERSE_EMPTY para o chamador validar via Binance.
 * Ação: formato válido (até 12 chars, charset de ticker).
 */
export const UNIVERSE_EMPTY = 'UNIVERSE_EMPTY';

export function resolveAlertSymbol(
  kind: 'crypto' | 'stock',
  raw: string,
  coins: { id: string; symbol: string }[],
): AlertSymbolResolution {
  const s = normalizeAlertSymbol(raw);
  if (!s) return { ok: false, reason: 'Informe o símbolo (ex.: BTC).' };
  if (s.length > 20) return { ok: false, reason: 'Símbolo muito longo.' };
  if (kind === 'stock') {
    if (!/^[A-Z0-9.\-=^]{1,12}$/.test(s)) {
      return { ok: false, reason: 'Símbolo de ação inválido (ex.: PETR4, AAPL).' };
    }
    return { ok: true, symbol: s };
  }
  if (!coins.length) return { ok: false, reason: UNIVERSE_EMPTY };
  const found = coins.find((c) => c.symbol.toUpperCase() === s || c.id.toUpperCase() === s);
  if (!found) {
    return { ok: false, reason: `Cripto "${s}" não encontrada. Confira o símbolo (ex.: BTC, ETH, SOL).` };
  }
  return { ok: true, symbol: found.symbol };
}
