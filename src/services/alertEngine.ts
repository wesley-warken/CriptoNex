import type { PriceAlert } from '@/stores/useStore';

/** Puro e testável: o alerta dispara quando o preço cruza a condição. */
export function shouldTrigger(alert: PriceAlert, price: number | null | undefined): boolean {
  if (!alert.active || price == null || Number.isNaN(price)) return false;
  return alert.condition === 'above' ? price >= alert.price : price <= alert.price;
}
