import { describe, it, expect } from 'vitest';
import { brasiliaBusinessDay, formatCrosshairTime, fmtPrice, shiftToBrasilia } from '@/lib/format';

function wallIn(tz: string | undefined, ts: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ts));
  const g = (t: string) => parts.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

describe('fuso de Brasília', () => {
  it('eixo em UTC exibe a parede de Brasília', () => {
    // 15:00Z = 12:00 em Brasília; a lib renderiza em UTC, então o valor
    // deslocado lido em UTC tem que dar a parede de Brasília
    const ts = Date.parse('2026-09-10T15:00:00Z');
    expect(wallIn('America/Sao_Paulo', ts)).toBe('2026-09-10 12:00');
    expect(wallIn('Etc/UTC', shiftToBrasilia(ts))).toBe('2026-09-10 12:00');
  });
  it('preserva ordem e espaçamento', () => {
    const a = shiftToBrasilia(1_000_000);
    const b = shiftToBrasilia(2_000_000);
    expect(b - a).toBe(1_000_000);
  });
  it('data de Brasília para eixo diário (vela UTC vira dia BRT)', () => {
    // 10/09 00:00Z abre em 09/09 21:00 BRT → eixo mostra 09/09
    expect(brasiliaBusinessDay(Date.parse('2026-09-10T00:00:00Z'))).toEqual({ year: 2026, month: 9, day: 9 });
    // 10/09 03:00Z = 10/09 00:00 BRT → eixo mostra 10/09
    expect(brasiliaBusinessDay(Date.parse('2026-09-10T03:00:00Z'))).toEqual({ year: 2026, month: 9, day: 10 });
  });
  it('crosshair: BusinessDay sem hora, timestamp com hora BRT', () => {
    expect(formatCrosshairTime({ year: 2026, month: 6, day: 9 })).toBe("09 jun. '26");
    // 15:00Z deslocado = 12:00 BRT
    expect(formatCrosshairTime(Math.floor(shiftToBrasilia(Date.parse('2026-09-10T15:00:00Z')) / 1000))).toBe("10 set. '26 12:00:00");
  });
  it('preço adaptativo: minúsculas aparecem', () => {
    expect(fmtPrice(76850.07)).toBe('$76.85K');
    expect(fmtPrice(99.8)).toBe('$99.80');
    expect(fmtPrice(0.5)).toBe('$0.5000');
    expect(fmtPrice(0.00001234)).toBe('$0.00001234');
    expect(fmtPrice(0.08563)).toBe('$0.0856');
    expect(fmtPrice(null)).toBe('—');
  });
});
