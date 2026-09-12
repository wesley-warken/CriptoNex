import { describe, it, expect } from 'vitest';
import {
  verifyWedge, exitDirection, wedgeBreakStats, diffWedgeStates,
  WEDGE_APEX_CAP,
} from '@/engine/wedges';

// Mesma cauda verificada do patterns.test (SEM a vela em formação).
function descClosed(): number[] {
  const closes: number[] = [];
  for (let i = 0; i < 40; i++) closes.push(140 - 0.42 * i + (i % 2 ? 0.2 : -0.2));
  closes.push(122.8, 122.6, 122.7, 122.9, 124, 122.5, 121, 119, 120, 120.5,
    122.3, 121, 121.5, 117.9, 119, 119.5, 120.6, 119.8, 119.2, 116.8,
    118, 117.5, 118.9, 118, 117.5, 115.7, 116.5, 116, 116.2);
  return closes;
}

describe('wedges (selo binário)', () => {
  it('verifica 7/7 na descendente, formando, com ápice dentro do teto', () => {
    const r = verifyWedge(descClosed(), undefined, 'desc');
    expect(r.verified).toBe(true);
    expect(r.gates).toHaveLength(7);
    expect(r.gates.every((g) => g.pass)).toBe(true);
    expect(r.state).toBe('forming');
    expect(r.apexBars).toBeGreaterThan(0);
    expect(r.apexBars).toBeLessThanOrEqual(WEDGE_APEX_CAP);
    expect(r.quality).toBeGreaterThan(0);
    expect(r.touchesHigh).toBeGreaterThanOrEqual(2);
    expect(r.touchesLow).toBeGreaterThanOrEqual(2);
  });
  it('estado confirmado acima da superior / invalidado abaixo da inferior', () => {
    const base = descClosed();
    const up = [...base.slice(0, -1), 120]; // acima da superior (~117)
    expect(verifyWedge(up, undefined, 'desc').state).toBe('confirmed');
    // invalidação: anda dentro do canal por 3 velas (pivôs congelam) e fecha
    // abaixo da inferior (~114.4) sem criar pivô novo
    const down = [...base, 116.3, 116.1, 115.9, 114.3];
    const r = verifyWedge(down, undefined, 'desc');
    expect(r.verified).toBe(true);
    expect(r.state).toBe('invalidated');
  });
  it('ascendente verifica no espelho com viés oposto', () => {
    const mirror = descClosed().map((c) => 240 - c);
    const r = verifyWedge(mirror, undefined, 'asc');
    expect(r.verified).toBe(true);
    expect(r.state).toBe('forming');
    // tipo trocado não verifica
    expect(verifyWedge(mirror, undefined, 'desc').verified).toBe(false);
  });
  it('canal paralelo reprova (ápice fora do teto / sem convergência)', () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(140 - 0.42 * i);
    closes.push(122.8, 122.6, 122.7, 122.9, 124, 122.5, 121, 119, 120, 120.5,
      122, 121, 121.5, 117, 119, 119.5, 120, 119.8, 119.2, 115,
      117.9, 117.5, 118, 117.9, 117.5, 113, 116.5, 116, 116.2);
    const r = verifyWedge(closes, undefined, 'desc');
    expect(r.verified).toBe(false);
    expect(r.gates.some((g) => !g.pass)).toBe(true);
  });
  it('série curta reprova na porta de dados', () => {
    const r = verifyWedge([100, 101, 102], undefined, 'desc');
    expect(r.verified).toBe(false);
    expect(r.gates[0].id).toBe('data');
  });
  it('exitDirection acha a saída do canal', () => {
    const hist = descClosed();
    const res = verifyWedge(hist, undefined, 'desc');
    expect(res.verified).toBe(true);
    // sobe além da superior nas próximas barras
    const fwdUp = [...hist, 118, 119, 120];
    expect(exitDirection(fwdUp, hist.length, res, 'desc')).toBe('up');
    // cai abaixo da inferior
    const fwdDown = [...hist, 115, 114, 113];
    expect(exitDirection(fwdDown, hist.length, res, 'desc')).toBe('down');
    // anda de lado dentro do canal
    const fwdFlat = [...hist, 116.3, 116.4, 116.2];
    expect(exitDirection(fwdFlat, hist.length, res, 'desc', 3)).toBeNull();
  });
  it('wedgeBreakStats: nulo sem histórico suficiente', () => {
    expect(wedgeBreakStats(Array(120).fill(100), 'desc')).toBeNull();
  });
  it('diffWedgeStates: emite, confirma e revoga', () => {
    const evts = diffWedgeStates([], [{ symbol: 'BTC', kind: 'desc', state: 'forming', price: 100 }]);
    expect(evts).toHaveLength(1);
    expect(evts[0].event).toBe('emitted');
    const conf = diffWedgeStates(
      [{ symbol: 'BTC', kind: 'desc', state: 'forming' }],
      [{ symbol: 'BTC', kind: 'desc', state: 'confirmed', price: 110 }],
    );
    expect(conf).toHaveLength(1);
    expect(conf[0].event).toBe('confirmed');
    const rev = diffWedgeStates([{ symbol: 'BTC', kind: 'desc', state: 'confirmed' }], []);
    expect(rev).toHaveLength(1);
    expect(rev[0].event).toBe('revoked');
    // sem mudança = sem evento
    expect(diffWedgeStates(
      [{ symbol: 'BTC', kind: 'desc', state: 'forming' }],
      [{ symbol: 'BTC', kind: 'desc', state: 'forming', price: 100 }],
    )).toEqual([]);
  });
});
