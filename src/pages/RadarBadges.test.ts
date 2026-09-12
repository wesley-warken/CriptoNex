import { describe, expect, it } from 'vitest';
import { trendBadge, shiftBadge } from './Radar';

describe('trendBadge — pills idênticas à referência', () => {
  it('nulo e neutro', () => {
    expect(trendBadge(null)).toBeNull();
    expect(trendBadge('Neutro')).toMatchObject({ bold: false, fg: 'var(--muted)' });
  });
  it('alta/baixa com forte em negrito e fundo sólido', () => {
    expect(trendBadge('Alta')).toMatchObject({ fg: 'var(--up)', bold: false });
    expect(trendBadge('Alta Forte')).toMatchObject({ fg: 'var(--up)', bold: true });
    expect(trendBadge('Baixa')).toMatchObject({ fg: 'var(--down)', bold: false });
    expect(trendBadge('Baixa Forte')).toMatchObject({ fg: 'var(--down)', bold: true });
    expect(trendBadge('Alta Forte')!.bg).toContain('32%');
    expect(trendBadge('Alta')!.bg).toContain('18%');
  });
});

describe('shiftBadge — transições "X para Y" / "Mantém"', () => {
  it('nulo', () => {
    expect(shiftBadge(null)).toBeNull();
  });
  it('mantém usa cinza', () => {
    expect(shiftBadge({ from: 'Baixa', to: 'Baixa', delta: 0 })).toMatchObject({
      text: 'Mantém Baixa',
      fg: 'var(--muted)',
    });
  });
  it('melhora em verde, piora em vermelho (shiftLabel minúsculo)', () => {
    expect(shiftBadge({ from: 'Baixa Forte', to: 'Baixa', delta: 1 })).toMatchObject({
      text: 'Baixa forte para Baixa',
      fg: 'var(--up)',
    });
    expect(shiftBadge({ from: 'Alta Forte', to: 'Neutro', delta: -2 })).toMatchObject({
      text: 'Alta forte para Neutro',
      fg: 'var(--down)',
    });
  });
});
