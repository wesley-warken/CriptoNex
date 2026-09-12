import { describe, it, expect } from 'vitest';
import { detectPatterns } from '@/engine/patterns';
import type { Candle } from '@/types';

const mk = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ time: i * 86400000, open: i ? closes[i - 1] : c, high: c * 1.002, low: c * 0.998, close: c, volume: 1000 }));
const mkHL = (closes: number[], highs: number[], lows: number[]): Candle[] =>
  closes.map((c, i) => ({ time: i * 86400000, open: i ? closes[i - 1] : c, high: highs[i], low: lows[i], close: c, volume: 1000 }));
const names = (kl: Candle[]) => detectPatterns(kl).map((p) => p.pattern);

describe('padrões gráficos', () => {
  it('Canal de Baixa em declínio constante', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 200 * Math.pow(0.995, i));
    expect(names(mk(closes))).toContain('Canal de Baixa');
  });
  it('Canal de Alta em rampa constante', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 * Math.pow(1.005, i));
    expect(names(mk(closes))).toContain('Canal de Alta');
  });
  it('Cunha Descendente VERIFICADA 7/7 (topos/fundos + convergência + ápice)', () => {
    // Cauda idx 40..69: topos 124/122.3/120.6/118.9 (44/50/56/62) e fundos
    // 119/117.9/116.8/115.7 (47/53/59/65); último fechado dentro do canal.
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(140 - 0.42 * i + (i % 2 ? 0.2 : -0.2));
    closes.push(122.8, 122.6, 122.7, 122.9, 124, 122.5, 121, 119, 120, 120.5,
      122.3, 121, 121.5, 117.9, 119, 119.5, 120.6, 119.8, 119.2, 116.8,
      118, 117.5, 118.9, 118, 117.5, 115.7, 116.5, 116, 116.2, 116.4);
    const found = detectPatterns(mk(closes));
    const p = found.find((x) => x.pattern === 'Cunha Descendente Verificada');
    expect(p).toBeDefined();
    expect(p!.sentiment).toBe('Bullish');
    expect(p!.stage).toBe('Emergente');
    expect(p!.detail).toContain('7/7');
  });
  it('Cunha Ascendente VERIFICADA no espelho (viés baixista)', () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(140 - 0.42 * i + (i % 2 ? 0.2 : -0.2));
    closes.push(122.8, 122.6, 122.7, 122.9, 124, 122.5, 121, 119, 120, 120.5,
      122.3, 121, 121.5, 117.9, 119, 119.5, 120.6, 119.8, 119.2, 116.8,
      118, 117.5, 118.9, 118, 117.5, 115.7, 116.5, 116, 116.2, 116.4);
    const mirror = closes.map((c) => 240 - c);
    const found = detectPatterns(mk(mirror));
    const p = found.find((x) => x.pattern === 'Cunha Ascendente Verificada');
    expect(p).toBeDefined();
    expect(p!.sentiment).toBe('Bearish');
    expect(p!.detail).toContain('7/7');
  });
  it('canal paralelo NÃO ganha selo (sem convergência = sem cunha)', () => {
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(140 - 0.42 * i + (i % 2 ? 0.2 : -0.2));
    closes.push(122.8, 122.6, 122.7, 122.9, 124, 122.5, 121, 119, 120, 120.5,
      122, 121, 121.5, 117, 119, 119.5, 120, 119.8, 119.2, 115,
      117.9, 117.5, 118, 117.9, 117.5, 113, 116.5, 116, 116.2, 116.4);
    const found = names(mk(closes));
    expect(found).not.toContain('Cunha Descendente Verificada');
    expect(found).not.toContain('Cunha Ascendente Verificada');
  });
  it('Sobrevendido no Suporte após mergulho', () => {
    const closes: number[] = [];
    for (let i = 0; i < 50; i++) closes.push(100 + i * 0.2);
    for (let i = 0; i < 12; i++) closes.push(110 - (i + 1) * 1.4);
    closes.push(closes[closes.length - 1], closes[closes.length - 1]);
    expect(names(mk(closes))).toContain('Sobrevendido no Suporte');
  });
  it('Aproximando-se da Resistência após pullback leve', () => {
    const closes: number[] = [];
    for (let i = 0; i < 57; i++) closes.push(100 + i * 0.3);
    for (let i = 0; i < 3; i++) closes.push(closes[closes.length - 1] * 0.99);
    expect(names(mk(closes))).toContain('Aproximando-se da Resistência');
  });
  it('Aproximando-se do Suporte após repique leve', () => {
    const closes: number[] = [];
    for (let i = 0; i < 57; i++) closes.push(200 - i * 0.4);
    for (let i = 0; i < 3; i++) closes.push(closes[closes.length - 1] * 1.01);
    expect(names(mk(closes))).toContain('Aproximando-se do Suporte');
  });
  it('série curta retorna vazio sem quebrar', () => {
    expect(detectPatterns(mk([100, 101, 102]))).toEqual([]);
  });
  it('Resistência virou Suporte após romper e segurar (pavio defende)', () => {
    const closes: number[] = []; const highs: number[] = []; const lows: number[] = [];
    for (let i = 0; i < 65; i++) { closes.push(100); highs.push(101); lows.push(98); }
    closes.push(106, 106, 102, 101.5, 101.3);
    highs.push(106.5, 106.4, 102.5, 101.8, 101.6);
    lows.push(105, 105.2, 101.2, 100.9, 100.8);
    const p = detectPatterns(mkHL(closes, highs, lows)).find((x) => x.pattern === 'Resistência virou Suporte');
    expect(p).toBeDefined();
    expect(p!.sentiment).toBe('Bullish');
    expect(p!.stage).toBe('Confirmado');
  });
  it('Suporte virou Resistência após perder e rejeitar (pavio rejeita)', () => {
    const closes: number[] = []; const highs: number[] = []; const lows: number[] = [];
    for (let i = 0; i < 65; i++) { closes.push(100); highs.push(102); lows.push(99); }
    closes.push(94, 94, 98, 98.5, 98.7);
    highs.push(94.5, 94.4, 98.6, 98.9, 99.2);
    lows.push(93.8, 93.9, 97.5, 98, 98.3);
    const p = detectPatterns(mkHL(closes, highs, lows)).find((x) => x.pattern === 'Suporte virou Resistência');
    expect(p).toBeDefined();
    expect(p!.sentiment).toBe('Bearish');
    expect(p!.stage).toBe('Confirmado');
  });
  it('sem polaridade em série travada (sem range, sem rompimento)', () => {
    const found = names(mk(Array(70).fill(100)));
    expect(found).not.toContain('Resistência virou Suporte');
    expect(found).not.toContain('Suporte virou Resistência');
  });
});
