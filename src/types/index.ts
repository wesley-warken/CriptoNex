export type Timeframe = '1h' | '4h' | '1d' | '1w';
export type Signal = 'BUY' | 'SELL' | 'NEUTRAL';
export type RegimeLabel = 'STRONG RISK-ON' | 'RISK-ON' | 'NEUTRAL' | 'RISK-OFF' | 'STRONG RISK-OFF';
export type TrendLabel = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Quote {
  symbol: string;
  price: number;
  change1h?: number | null;
  change24h?: number | null;
  change7d?: number | null;
  volume24h?: number | null;
  marketCap?: number | null;
  timestamp: number;
}
export interface Asset {
  id: string;
  symbol: string;
  name: string;
  kind: 'crypto' | 'stock';
  sector?: string;
  binanceSymbol?: string;
  coingeckoId?: string;
}
export interface MarketData extends Quote {
  name: string;
  sparkline7d?: number[];
  sparkline30d?: number[];
}
export interface IndicatorSnapshot {
  rsi?: number | null;
  macdHist?: number | null;
  macdSignal?: 'BUY' | 'SELL' | 'NEUTRAL';
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  ema12?: number | null;
  ema26?: number | null;
  supertrend?: 'BULLISH' | 'BEARISH' | null;
  adx?: number | null;
  atr?: number | null;
  stochK?: number | null;
  stochD?: number | null;
  bbUpper?: number | null;
  bbLower?: number | null;
  bbMid?: number | null;
  volumeRatio?: number | null;
}
export interface TechnicalSignal {
  indicator: string;
  signal: Signal;
  weight: number;
  detail: string;
}
export interface OpportunityScore {
  symbol: string;
  score: number;
  classification: string;
  confidence: number;
  dataQuality: number;
  timeframeAlignment: number;
  signal: Signal;
  breakdown: { label: string; earned: number; max: number }[];
  why: string[];
  risks: string[];
}
export interface MarketRegime {
  label: RegimeLabel;
  confidence: number;
  btcTrend: TrendLabel;
  breadth: number;
  dominanceFalling: boolean;
  momentum: 'STRONG' | 'MODERATE' | 'WEAK';
  volumeExpanding: boolean;
  volatility: 'LOW' | 'MODERATE' | 'HIGH';
}
export interface SentimentData {
  fearGreed: number | null;
  fearGreedLabel: string;
  history: { time: number; value: number }[];
  trending: { symbol: string; name: string }[];
}
export interface PortfolioPosition {
  id: string;
  kind: 'crypto' | 'stock';
  symbol: string;
  quantity: number;
  avgPrice: number;
  date: string;
  note?: string;
}
