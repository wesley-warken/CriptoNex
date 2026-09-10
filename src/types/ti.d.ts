declare module 'technicalindicators' {
  export const SMA: { calculate(o: { period: number; values: number[] }): number[] };
  export const EMA: { calculate(o: { period: number; values: number[] }): number[] };
  export const RSI: { calculate(o: { period: number; values: number[] }): number[] };
  export const MACD: { calculate(o: { values: number[]; fastPeriod: number; slowPeriod: number; signalPeriod: number; SimpleMAOscillator: boolean; SimpleMASignal: boolean }): { histogram?: number }[] };
  export const Stochastic: { calculate(o: { high: number[]; low: number[]; close: number[]; period: number; signalPeriod: number }): { k?: number; d?: number }[] };
  export const BollingerBands: { calculate(o: { period: number; stdDev: number; values: number[] }): { upper?: number; middle?: number; lower?: number }[] };
  export const ADX: { calculate(o: { high: number[]; low: number[]; close: number[]; period: number }): { adx?: number }[] };
  export const ATR: { calculate(o: { high: number[]; low: number[]; close: number[]; period: number }): number[] };
}
