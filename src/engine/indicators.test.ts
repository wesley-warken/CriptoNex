import { describe, expect, it } from 'vitest';
import {
  calcRSI, calcMACD, calcStoch, calcBB, calcADX, calcATR,
  calcSupertrend, rsiWithAvg, snapshot, detectDivergence,
} from './indicators';
import type { Candle } from '@/types';

function kl(n: number, fn: (i: number) => Partial<Candle> & { close: number }): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const p = fn(i);
    const wob = Math.sin(i / 3) * Math.abs(p.close) * 0.002;
    const c = p.close + wob;
    const spread = Math.abs(c) * 0.004 + 0.1;
    return {
      time: i * 86400000,
      open: p.open ?? c - 0.2,
      high: p.high ?? c + spread,
      low: p.low ?? c - spread,
      close: p.close,
      volume: p.volume ?? 1000,
    };
  });
}
const flat = (n: number, px = 50) => kl(n, () => ({ close: px }));
// MACD mede aceleração/convergência (não inclinação): série linear pura tem
// histograma → 0 (NEUTRAL correto). Alta/queda "perfeitas" aceleram até o
// fim (quadráticas) para haver convergência real de médias no último candle.
const up = (n: number) => kl(n, (i) => ({ close: 100 + i * 0.3 + i * i * 0.01 }));
const down = (n: number) => kl(n, (i) => ({ close: 300 - i * 0.3 - i * i * 0.01 }));

function finiteOrNull(v: number | null | undefined): boolean {
  return v == null || Number.isFinite(v);
}
function snapshotFinite(s: ReturnType<typeof snapshot>): void {
  for (const v of [s.rsi, s.macdHist, s.sma20, s.sma50, s.sma200, s.ema12, s.ema26, s.adx, s.atr, s.stochK, s.stochD, s.bbUpper, s.bbLower, s.bbMid, s.volumeRatio]) {
    expect(finiteOrNull(v as number | null)).toBe(true);
  }
}

describe('snapshot — séries sintéticas e extremas', () => {
  it('série constante: sem throw, tudo finito-ou-nulo', () => {
    snapshotFinite(snapshot(flat(220)));
  });
  it('NaN/Infinity não vazam como número: viram null', () => {
    const bad = up(100);
    bad[99] = { ...bad[99], close: NaN };
    const s = snapshot(bad);
    snapshotFinite(s);
    expect(s.rsi).toBeNull();
  });
  it('volume zerado: volumeRatio null, sem divisão por zero', () => {
    const z = kl(60, (i) => ({ close: 100 + i * 0.1, volume: 0 }));
    expect(snapshot(z).volumeRatio).toBeNull();
  });
  it('poucos candles: guards por indicador, sem throw', () => {
    const s = snapshot(up(10));
    expect(s.sma20).toBeNull();
    expect(s.macdHist).toBeNull();
    snapshotFinite(s);
    expect(snapshot([]).rsi).toBeNull();
  });
  it('alta perfeita: RSI alto, MACD comprado, estocástico topo', () => {
    const s = snapshot(up(220));
    expect(s.rsi).not.toBeNull();
    expect(s.rsi!).toBeGreaterThan(70);
    expect(s.macdSignal).toBe('BUY');
  });
  it('queda perfeita: RSI baixo, MACD vendido', () => {
    const s = snapshot(down(220));
    expect(s.rsi).not.toBeNull();
    expect(s.rsi!).toBeLessThan(30);
    expect(s.macdSignal).toBe('SELL');
  });
});

describe('calcSupertrend — sem viés altista padrão', () => {
  it('lateral que nunca rompe banda → null (neutro), não BULLISH', () => {
    // Oscilação ±0.5% em torno de 100: ATR(10)≈1, bandas a ±3 → sem rompimento.
    const side = kl(80, (i) => ({ close: 100 + (i % 2 === 0 ? 0.4 : -0.4) }));
    expect(calcSupertrend(side)).toBeNull();
  });
  it('tendências decididas continuam detectadas', () => {
    expect(calcSupertrend(up(80))).toBe('BULLISH');
    expect(calcSupertrend(down(80))).toBe('BEARISH');
  });
});

describe('calcMACD/calcStoch/calcBB/calcADX/calcATR — NaN vira null', () => {
  it('último candle com NaN não contamina', () => {
    const bad = up(100);
    bad[99] = { ...bad[99], close: NaN, high: NaN, low: NaN };
    expect(calcMACD(bad).hist).toBeNull();
    expect(calcStoch(bad).k).toBeNull();
    expect(calcBB(bad).upper).toBeNull();
    expect(calcADX(bad)).toBeNull();
    expect(calcATR(bad)).toBeNull();
  });
});

describe('detectDivergence — índices na janela correta', () => {
  it('divergência altista clássica: fundo mais baixo no preço, mais alto no RSI', () => {
    const p = Array.from({ length: 30 }, (_, i) => (i < 16 ? 100 - i : 92));
    p[29] = 80; // fundo mais baixo que o anterior (85)
    const r = Array.from({ length: 30 }, () => 40);
    r[5] = 30; // mínimo anterior do RSI
    r[27] = 45; // RSI no fundo atual, acima do mínimo
    const d = detectDivergence(p, r);
    expect(d.bullish).toBe(true);
    expect(d.bearish).toBe(false);
  });
  it('divergência baixista espelhada', () => {
    const p = Array.from({ length: 30 }, (_, i) => (i < 16 ? 100 + i : 108));
    p[29] = 120; // topo mais alto que o anterior (115)
    const r = Array.from({ length: 30 }, () => 60);
    r[5] = 70;
    r[27] = 55; // RSI no topo atual, abaixo do máximo
    const d = detectDivergence(p, r);
    expect(d.bearish).toBe(true);
    expect(d.bullish).toBe(false);
  });
  it('sem divergência: tudo falso', () => {
    const p = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 2);
    const r = Array.from({ length: 30 }, () => 55);
    const d = detectDivergence(p, r);
    expect(d.bullish).toBe(false);
    expect(d.bearish).toBe(false);
    expect(d.confidence).toBe(0);
  });
});

describe('RSI paridade TradingView (Wilder ta.rma)', () => {
  // Série determinística 200 pontos, sempre > 0 (warmup suficiente p/ convergir).
  const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 0.15 + Math.sin(i / 5) * 4 + (i % 7) * 0.3);
  const candles = closes.map((c, i) => ({ time: i * 3600000, open: c, high: c * 1.001, low: c * 0.999, close: c, volume: 1000 }));
  // Wilder RMA manual — mesma matemática do ta.rma do Pine (seed SMA + alpha 1/14).
  const wilderRSI = (xs: number[], period = 14): number => {
    const ch = xs.slice(1).map((c, i) => c - xs[i]);
    let up = ch.slice(0, period).filter((x) => x > 0).reduce((a, b) => a + b, 0) / period;
    let dn = -ch.slice(0, period).filter((x) => x < 0).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < ch.length; i++) {
      up = (up * (period - 1) + Math.max(ch[i], 0)) / period;
      dn = (dn * (period - 1) + Math.max(-ch[i], 0)) / period;
    }
    if (dn === 0) return 100;
    if (up === 0) return 0;
    return 100 - 100 / (1 + up / dn);
  };
  it('calcRSI equivale ao Wilder manual nos mesmos closes', () => {
    // Tolerância 0,01: a lib arredonda cada passo p/ 2 casas (toFixed(2)),
    // o TV também exibe 2 casas. O bug real era de DADO (10 pontos), não de fórmula.
    expect(Math.abs((calcRSI(candles) ?? NaN) - wilderRSI(closes))).toBeLessThan(0.01);
  });
  it('rsiWithAvg equivale à média dos últimos 14 RSIs manuais', () => {
    const got = rsiWithAvg(candles);
    const last14 = Array.from({ length: 14 }, (_, j) => wilderRSI(closes.slice(0, closes.length - 13 + j)));
    const expected = last14.reduce((a, b) => a + b, 0) / 14;
    expect(got.rsi).not.toBeNull();
    expect(Math.abs((got.avg ?? NaN) - expected)).toBeLessThan(0.01);
  });
});
