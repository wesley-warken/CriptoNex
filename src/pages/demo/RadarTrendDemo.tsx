import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Star,
  ExternalLink,
  TrendingUp,
  Volume2,
  Sliders,
  Play,
  Pause,
  Clock,
  Layers,
  Sparkles,
  Search,
  CheckCircle2,
  BarChart2,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/stores/useStore';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Pill, TrendPill, RsiPill, AlignmentPill, type TrendStatus } from '@/components/ui/trend-pill';
import { KpiCard } from '@/components/ui/kpi-card';
import { TerminalTabs, type TabItem } from '@/components/ui/terminal-tabs';
import { TerminalToolbar, type FilterChipItem } from '@/components/ui/terminal-toolbar';
import { Modal } from '@/components/ui/terminal-dialogs';
import { Button } from '@/components/ui/terminal-feedback';

export interface CryptoAssetItem {
  rank: number;
  symbol: string;
  name: string;
  pair: string;
  color: string;
  price: number;
  lastPrice?: number;
  priceFlash?: 'up' | 'down' | null;
  change1h: number;
  change24h: number;
  change7d: number;
  trend1h: TrendStatus;
  trend4h: TrendStatus;
  trend1d: TrendStatus;
  shiftState: string;
  rsi14: number;
  smaAlignment: 'bullish' | 'bearish' | 'mixed';
  volume24hUsd: number;
  marketCapUsd: number;
  high24h: number;
  low24h: number;
}

// 60+ Realistic crypto market data
const INITIAL_ASSETS: CryptoAssetItem[] = [
  { rank: 1, symbol: 'BTC', name: 'Bitcoin', pair: 'BTC/USDT', color: '#F7931A', price: 68420.50, change1h: 0.35, change24h: 3.42, change7d: 6.80, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta', shiftState: 'Pivot Rompido', rsi14: 64.2, smaAlignment: 'bullish', volume24hUsd: 34250000000, marketCapUsd: 1350000000000, high24h: 68900, low24h: 66100 },
  { rank: 2, symbol: 'ETH', name: 'Ethereum', pair: 'ETH/USDT', color: '#627EEA', price: 2640.20, change1h: -0.12, change24h: 1.85, change7d: 3.10, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Neutro', shiftState: 'Pullback SMA20', rsi14: 55.4, smaAlignment: 'bullish', volume24hUsd: 18400000000, marketCapUsd: 318000000000, high24h: 2680, low24h: 2580 },
  { rank: 3, symbol: 'SOL', name: 'Solana', pair: 'SOL/USDT', color: '#14F195', price: 178.90, change1h: 1.20, change24h: 7.60, change7d: 18.40, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta Forte', shiftState: 'Golden Cross', rsi14: 72.8, smaAlignment: 'bullish', volume24hUsd: 6800000000, marketCapUsd: 84000000000, high24h: 181.5, low24h: 165.2 },
  { rank: 4, symbol: 'BNB', name: 'BNB Chain', pair: 'BNB/USDT', color: '#F3BA2F', price: 594.30, change1h: 0.05, change24h: 0.90, change7d: 2.15, trend1h: 'Neutro', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Consolidação', rsi14: 52.1, smaAlignment: 'bullish', volume24hUsd: 1200000000, marketCapUsd: 88000000000, high24h: 602, low24h: 588 },
  { rank: 5, symbol: 'XRP', name: 'XRP Ledger', pair: 'XRP/USDT', color: '#23292F', price: 0.548, change1h: -0.40, change24h: -1.25, change7d: -3.40, trend1h: 'Baixa', trend4h: 'Baixa', trend1d: 'Baixa', shiftState: 'Breakdown Suporte', rsi14: 38.6, smaAlignment: 'bearish', volume24hUsd: 1450000000, marketCapUsd: 31000000000, high24h: 0.562, low24h: 0.541 },
  { rank: 6, symbol: 'DOGE', name: 'Dogecoin', pair: 'DOGE/USDT', color: '#C2A633', price: 0.142, change1h: 0.80, change24h: 5.10, change7d: 14.20, trend1h: 'Alta Forte', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Volume Anômalo', rsi14: 67.5, smaAlignment: 'bullish', volume24hUsd: 2100000000, marketCapUsd: 20700000000, high24h: 0.148, low24h: 0.134 },
  { rank: 7, symbol: 'ADA', name: 'Cardano', pair: 'ADA/USDT', color: '#0033AD', price: 0.358, change1h: -0.22, change24h: -0.45, change7d: 1.10, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Baixa', shiftState: 'Acúmulo', rsi14: 47.3, smaAlignment: 'mixed', volume24hUsd: 390000000, marketCapUsd: 12800000000, high24h: 0.366, low24h: 0.352 },
  { rank: 8, symbol: 'AVAX', name: 'Avalanche', pair: 'AVAX/USDT', color: '#E84142', price: 28.45, change1h: 0.65, change24h: 4.80, change7d: 12.30, trend1h: 'Alta Forte', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Pivot Rompido', rsi14: 63.9, smaAlignment: 'bullish', volume24hUsd: 580000000, marketCapUsd: 11500000000, high24h: 29.1, low24h: 26.9 },
  { rank: 9, symbol: 'SUI', name: 'Sui Network', pair: 'SUI/USDT', color: '#4DA2FF', price: 2.14, change1h: 2.10, change24h: 11.40, change7d: 31.80, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta Forte', shiftState: 'Nova Máxima', rsi14: 78.4, smaAlignment: 'bullish', volume24hUsd: 1750000000, marketCapUsd: 5900000000, high24h: 2.22, low24h: 1.88 },
  { rank: 10, symbol: 'NEAR', name: 'NEAR Protocol', pair: 'NEAR/USDT', color: '#000000', price: 5.12, change1h: 0.40, change24h: 3.80, change7d: 8.50, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Rompimento LTB', rsi14: 61.2, smaAlignment: 'bullish', volume24hUsd: 490000000, marketCapUsd: 6200000000, high24h: 5.25, low24h: 4.90 },
  { rank: 11, symbol: 'LINK', name: 'Chainlink', pair: 'LINK/USDT', color: '#375BD2', price: 12.18, change1h: 0.15, change24h: 2.10, change7d: 4.60, trend1h: 'Alta', trend4h: 'Neutro', trend1d: 'Neutro', shiftState: 'Reversão Base', rsi14: 53.8, smaAlignment: 'mixed', volume24hUsd: 320000000, marketCapUsd: 7400000000, high24h: 12.45, low24h: 11.85 },
  { rank: 12, symbol: 'TAO', name: 'Bittensor', pair: 'TAO/USDT', color: '#262626', price: 582.40, change1h: 1.45, change24h: 8.90, change7d: 24.10, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta Forte', shiftState: 'Demanda Institucional', rsi14: 74.5, smaAlignment: 'bullish', volume24hUsd: 440000000, marketCapUsd: 4300000000, high24h: 595, low24h: 530 },
  { rank: 13, symbol: 'SHIB', name: 'Shiba Inu', pair: 'SHIB/USDT', color: '#FFA409', price: 0.0000186, change1h: -0.30, change24h: 1.10, change7d: 3.50, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Neutro', shiftState: 'Consolidação', rsi14: 49.6, smaAlignment: 'mixed', volume24hUsd: 380000000, marketCapUsd: 10900000000, high24h: 0.0000192, low24h: 0.0000181 },
  { rank: 14, symbol: 'DOT', name: 'Polkadot', pair: 'DOT/USDT', color: '#E6007A', price: 4.32, change1h: -0.60, change24h: -1.80, change7d: -4.10, trend1h: 'Baixa', trend4h: 'Baixa', trend1d: 'Baixa Forte', shiftState: 'Fundo Perdido', rsi14: 34.2, smaAlignment: 'bearish', volume24hUsd: 210000000, marketCapUsd: 6100000000, high24h: 4.45, low24h: 4.28 },
  { rank: 15, symbol: 'PEPE', name: 'Pepe', pair: 'PEPE/USDT', color: '#55A947', price: 0.0000104, change1h: 1.80, change24h: 6.40, change7d: 15.80, trend1h: 'Alta Forte', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Pressão Compradora', rsi14: 68.1, smaAlignment: 'bullish', volume24hUsd: 1100000000, marketCapUsd: 4400000000, high24h: 0.0000109, low24h: 0.0000096 },
  { rank: 16, symbol: 'WIF', name: 'dogwifhat', pair: 'WIF/USDT', color: '#B57B4D', price: 2.65, change1h: 2.40, change24h: 9.80, change7d: 22.50, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta', shiftState: 'Rompimento 4H', rsi14: 71.9, smaAlignment: 'bullish', volume24hUsd: 820000000, marketCapUsd: 2640000000, high24h: 2.74, low24h: 2.38 },
  { rank: 17, symbol: 'RENDER', name: 'Render', pair: 'RENDER/USDT', color: '#E53935', price: 6.15, change1h: 0.70, change24h: 4.20, change7d: 10.40, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Setup IA Ativo', rsi14: 62.4, smaAlignment: 'bullish', volume24hUsd: 310000000, marketCapUsd: 3200000000, high24h: 6.30, low24h: 5.85 },
  { rank: 18, symbol: 'INJ', name: 'Injective', pair: 'INJ/USDT', color: '#00B4D8', price: 22.80, change1h: -0.10, change24h: 2.50, change7d: 5.90, trend1h: 'Alta', trend4h: 'Neutro', trend1d: 'Alta', shiftState: 'Pivot Diário', rsi14: 56.1, smaAlignment: 'bullish', volume24hUsd: 195000000, marketCapUsd: 2270000000, high24h: 23.4, low24h: 22.1 },
  { rank: 19, symbol: 'TIA', name: 'Celestia', pair: 'TIA/USDT', color: '#7B2CBF', price: 5.85, change1h: -1.20, change24h: -4.50, change7d: -12.30, trend1h: 'Baixa Forte', trend4h: 'Baixa Forte', trend1d: 'Baixa Forte', shiftState: 'Pressão Vendedora', rsi14: 28.4, smaAlignment: 'bearish', volume24hUsd: 260000000, marketCapUsd: 1280000000, high24h: 6.22, low24h: 5.75 },
  { rank: 20, symbol: 'APT', name: 'Aptos', pair: 'APT/USDT', color: '#212121', price: 9.80, change1h: 0.50, change24h: 3.10, change7d: 14.50, trend1h: 'Alta', trend4h: 'Alta Forte', trend1d: 'Alta', shiftState: 'Pullback no Topo', rsi14: 65.3, smaAlignment: 'bullish', volume24hUsd: 410000000, marketCapUsd: 4900000000, high24h: 10.15, low24h: 9.40 },
  { rank: 21, symbol: 'OP', name: 'Optimism', pair: 'OP/USDT', color: '#FF0420', price: 1.62, change1h: -0.35, change24h: 0.80, change7d: -1.40, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Baixa', shiftState: 'Lateralização', rsi14: 48.2, smaAlignment: 'mixed', volume24hUsd: 140000000, marketCapUsd: 2020000000, high24h: 1.68, low24h: 1.59 },
  { rank: 22, symbol: 'ARB', name: 'Arbitrum', pair: 'ARB/USDT', color: '#28A0F0', price: 0.564, change1h: -0.40, change24h: -0.90, change7d: -3.80, trend1h: 'Baixa', trend4h: 'Baixa', trend1d: 'Baixa Forte', shiftState: 'Rejeição Resistência', rsi14: 36.8, smaAlignment: 'bearish', volume24hUsd: 180000000, marketCapUsd: 1980000000, high24h: 0.578, low24h: 0.558 },
  { rank: 23, symbol: 'FET', name: 'Artificial Superintelligence', pair: 'FET/USDT', color: '#1A365D', price: 1.48, change1h: 0.85, change24h: 6.20, change7d: 19.30, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta', shiftState: 'Rompimento Triângulo', rsi14: 70.1, smaAlignment: 'bullish', volume24hUsd: 360000000, marketCapUsd: 3700000000, high24h: 1.54, low24h: 1.38 },
  { rank: 24, symbol: 'KAS', name: 'Kaspa', pair: 'KAS/USDT', color: '#70C7BA', price: 0.134, change1h: -0.15, change24h: 1.40, change7d: 4.80, trend1h: 'Neutro', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Suporte Testado', rsi14: 54.0, smaAlignment: 'bullish', volume24hUsd: 75000000, marketCapUsd: 3300000000, high24h: 0.138, low24h: 0.131 },
  { rank: 25, symbol: 'STX', name: 'Stacks', pair: 'STX/USDT', color: '#5546FF', price: 1.88, change1h: 0.60, change24h: 4.10, change7d: 8.60, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Nakamoto Upgrade', rsi14: 63.1, smaAlignment: 'bullish', volume24hUsd: 125000000, marketCapUsd: 2800000000, high24h: 1.94, low24h: 1.79 },
  { rank: 26, symbol: 'BONK', name: 'Bonk', pair: 'BONK/USDT', color: '#FF9E1B', price: 0.0000224, change1h: 1.10, change24h: 5.70, change7d: 11.20, trend1h: 'Alta Forte', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Giro de Liquidez', rsi14: 66.8, smaAlignment: 'bullish', volume24hUsd: 290000000, marketCapUsd: 1650000000, high24h: 0.0000235, low24h: 0.0000208 },
  { rank: 27, symbol: 'POL', name: 'Polygon Ecosystem', pair: 'POL/USDT', color: '#8247E5', price: 0.385, change1h: -0.25, change24h: -1.10, change7d: -2.80, trend1h: 'Baixa', trend4h: 'Baixa', trend1d: 'Baixa', shiftState: 'Perda de Média 50', rsi14: 41.5, smaAlignment: 'bearish', volume24hUsd: 110000000, marketCapUsd: 3100000000, high24h: 0.395, low24h: 0.380 },
  { rank: 28, symbol: 'AAVE', name: 'Aave', pair: 'AAVE/USDT', color: '#B6509E', price: 158.40, change1h: 1.15, change24h: 7.80, change7d: 14.90, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta Forte', shiftState: 'Líder DeFi', rsi14: 73.2, smaAlignment: 'bullish', volume24hUsd: 310000000, marketCapUsd: 2350000000, high24h: 162.0, low24h: 146.5 },
  { rank: 29, symbol: 'SEI', name: 'Sei Network', pair: 'SEI/USDT', color: '#9B1D20', price: 0.442, change1h: 0.95, change24h: 6.10, change7d: 16.30, trend1h: 'Alta Forte', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Volume em Expansão', rsi14: 67.9, smaAlignment: 'bullish', volume24hUsd: 240000000, marketCapUsd: 1580000000, high24h: 0.458, low24h: 0.412 },
  { rank: 30, symbol: 'JUP', name: 'Jupiter', pair: 'JUP/USDT', color: '#00BE88', price: 1.08, change1h: 1.30, change24h: 8.40, change7d: 21.00, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta Forte', shiftState: 'Rompimento $1.00', rsi14: 75.1, smaAlignment: 'bullish', volume24hUsd: 215000000, marketCapUsd: 1450000000, high24h: 1.12, low24h: 0.98 },
  { rank: 31, symbol: 'PYTH', name: 'Pyth Network', pair: 'PYTH/USDT', color: '#E6DAFE', price: 0.365, change1h: 0.40, change24h: 3.20, change7d: 7.90, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Neutro', shiftState: 'Pullback Médias', rsi14: 58.7, smaAlignment: 'bullish', volume24hUsd: 105000000, marketCapUsd: 1320000000, high24h: 0.378, low24h: 0.351 },
  { rank: 32, symbol: 'UNI', name: 'Uniswap', pair: 'UNI/USDT', color: '#FF007A', price: 7.85, change1h: 0.20, change24h: 1.90, change7d: 5.20, trend1h: 'Alta', trend4h: 'Neutro', trend1d: 'Alta', shiftState: 'Resistência $8', rsi14: 56.4, smaAlignment: 'bullish', volume24hUsd: 170000000, marketCapUsd: 4700000000, high24h: 8.05, low24h: 7.62 },
  { rank: 33, symbol: 'LDO', name: 'Lido DAO', pair: 'LDO/USDT', color: '#F69988', price: 1.22, change1h: -0.50, change24h: -1.30, change7d: -2.10, trend1h: 'Baixa', trend4h: 'Neutro', trend1d: 'Baixa', shiftState: 'Sem Volume', rsi14: 43.1, smaAlignment: 'bearish', volume24hUsd: 90000000, marketCapUsd: 1090000000, high24h: 1.26, low24h: 1.20 },
  { rank: 34, symbol: 'PENDLE', name: 'Pendle', pair: 'PENDLE/USDT', color: '#00F0FF', price: 4.82, change1h: 1.85, change24h: 9.30, change7d: 26.50, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta Forte', shiftState: 'Yield Surge', rsi14: 76.9, smaAlignment: 'bullish', volume24hUsd: 185000000, marketCapUsd: 780000000, high24h: 4.95, low24h: 4.35 },
  { rank: 35, symbol: 'ONDO', name: 'Ondo Finance', pair: 'ONDO/USDT', color: '#0A2540', price: 0.785, change1h: 0.60, change24h: 4.50, change7d: 13.80, trend1h: 'Alta', trend4h: 'Alta Forte', trend1d: 'Alta', shiftState: 'RWA Momentum', rsi14: 65.2, smaAlignment: 'bullish', volume24hUsd: 145000000, marketCapUsd: 1100000000, high24h: 0.812, low24h: 0.745 },
  { rank: 36, symbol: 'ICP', name: 'Internet Computer', pair: 'ICP/USDT', color: '#29ABE2', price: 8.65, change1h: -0.30, change24h: 0.95, change7d: 2.40, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Baixa', shiftState: 'Consolidação Lenta', rsi14: 49.3, smaAlignment: 'mixed', volume24hUsd: 85000000, marketCapUsd: 4050000000, high24h: 8.90, low24h: 8.52 },
  { rank: 37, symbol: 'FIL', name: 'Filecoin', pair: 'FIL/USDT', color: '#0090FF', price: 3.75, change1h: -0.70, change24h: -2.10, change7d: -5.40, trend1h: 'Baixa', trend4h: 'Baixa Forte', trend1d: 'Baixa Forte', shiftState: 'Sem Suporte', rsi14: 31.8, smaAlignment: 'bearish', volume24hUsd: 115000000, marketCapUsd: 2250000000, high24h: 3.88, low24h: 3.70 },
  { rank: 38, symbol: 'FTM', name: 'Sonic (Fantom)', pair: 'FTM/USDT', color: '#1969FF', price: 0.725, change1h: 1.05, change24h: 6.80, change7d: 17.20, trend1h: 'Alta Forte', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Sonic Testnet', rsi14: 69.4, smaAlignment: 'bullish', volume24hUsd: 230000000, marketCapUsd: 2050000000, high24h: 0.748, low24h: 0.672 },
  { rank: 39, symbol: 'RUNE', name: 'THORChain', pair: 'RUNE/USDT', color: '#00CC99', price: 5.40, change1h: 0.45, change24h: 3.70, change7d: 11.50, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Cross-chain Surge', rsi14: 61.8, smaAlignment: 'bullish', volume24hUsd: 195000000, marketCapUsd: 1810000000, high24h: 5.60, low24h: 5.15 },
  { rank: 40, symbol: 'ALGO', name: 'Algorand', pair: 'ALGO/USDT', color: '#000000', price: 0.128, change1h: -0.40, change24h: -0.80, change7d: -1.50, trend1h: 'Neutro', trend4h: 'Baixa', trend1d: 'Baixa', shiftState: 'Fundo Histórico', rsi14: 39.5, smaAlignment: 'bearish', volume24hUsd: 48000000, marketCapUsd: 1060000000, high24h: 0.132, low24h: 0.126 },
  { rank: 41, symbol: 'HBAR', name: 'Hedera', pair: 'HBAR/USDT', color: '#00A87E', price: 0.054, change1h: 0.10, change24h: 1.20, change7d: 3.40, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Neutro', shiftState: 'Lateralização', rsi14: 51.0, smaAlignment: 'mixed', volume24hUsd: 55000000, marketCapUsd: 2050000000, high24h: 0.056, low24h: 0.053 },
  { rank: 42, symbol: 'GRT', name: 'The Graph', pair: 'GRT/USDT', color: '#6742F1', price: 0.175, change1h: 0.35, change24h: 2.80, change7d: 6.90, trend1h: 'Alta', trend4h: 'Neutro', trend1d: 'Neutro', shiftState: 'Setup IA Secundário', rsi14: 54.8, smaAlignment: 'mixed', volume24hUsd: 82000000, marketCapUsd: 1670000000, high24h: 0.182, low24h: 0.169 },
  { rank: 43, symbol: 'GALA', name: 'Gala Games', pair: 'GALA/USDT', color: '#1B1B1B', price: 0.024, change1h: -0.80, change24h: -2.40, change7d: -6.80, trend1h: 'Baixa Forte', trend4h: 'Baixa Forte', trend1d: 'Baixa Forte', shiftState: 'Sobrevendido Severo', rsi14: 26.5, smaAlignment: 'bearish', volume24hUsd: 74000000, marketCapUsd: 870000000, high24h: 0.025, low24h: 0.023 },
  { rank: 44, symbol: 'AR', name: 'Arweave', pair: 'AR/USDT', color: '#222326', price: 18.20, change1h: 0.55, change24h: 4.30, change7d: 9.80, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'AO Network Growth', rsi14: 63.4, smaAlignment: 'bullish', volume24hUsd: 98000000, marketCapUsd: 1200000000, high24h: 18.75, low24h: 17.30 },
  { rank: 45, symbol: 'ENA', name: 'Ethena', pair: 'ENA/USDT', color: '#1C1C1C', price: 0.412, change1h: 1.40, change24h: 8.10, change7d: 21.40, trend1h: 'Alta Forte', trend4h: 'Alta Forte', trend1d: 'Alta', shiftState: 'Entrada USDe', rsi14: 72.3, smaAlignment: 'bullish', volume24hUsd: 210000000, marketCapUsd: 1150000000, high24h: 0.428, low24h: 0.375 },
  { rank: 46, symbol: 'DYDX', name: 'dYdX', pair: 'DYDX/USDT', color: '#6966FF', price: 1.05, change1h: -0.15, change24h: 0.80, change7d: 1.90, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Baixa', shiftState: 'Volume Perp Estável', rsi14: 48.9, smaAlignment: 'mixed', volume24hUsd: 62000000, marketCapUsd: 680000000, high24h: 1.08, low24h: 1.03 },
  { rank: 47, symbol: 'BLUR', name: 'Blur', pair: 'BLUR/USDT', color: '#FF4500', price: 0.258, change1h: -0.90, change24h: -3.20, change7d: -8.50, trend1h: 'Baixa Forte', trend4h: 'Baixa', trend1d: 'Baixa Forte', shiftState: 'Desbloqueio Tokens', rsi14: 29.2, smaAlignment: 'bearish', volume24hUsd: 46000000, marketCapUsd: 450000000, high24h: 0.272, low24h: 0.252 },
  { rank: 48, symbol: 'CRV', name: 'Curve DAO', pair: 'CRV/USDT', color: '#4080FF', price: 0.294, change1h: 0.30, change24h: 1.40, change7d: 4.10, trend1h: 'Neutro', trend4h: 'Alta', trend1d: 'Neutro', shiftState: 'Reconstrução', rsi14: 53.6, smaAlignment: 'mixed', volume24hUsd: 58000000, marketCapUsd: 360000000, high24h: 0.305, low24h: 0.288 },
  { rank: 49, symbol: 'MKR', name: 'Maker', pair: 'MKR/USDT', color: '#1AAB9B', price: 1620.00, change1h: 0.25, change24h: 2.10, change7d: 5.80, trend1h: 'Alta', trend4h: 'Alta', trend1d: 'Alta', shiftState: 'Sky Rebrand', rsi14: 59.8, smaAlignment: 'bullish', volume24hUsd: 88000000, marketCapUsd: 1490000000, high24h: 1650, low24h: 1580 },
  { rank: 50, symbol: 'THETA', name: 'Theta Network', pair: 'THETA/USDT', color: '#2AB8E6', price: 1.35, change1h: -0.20, change24h: 1.10, change7d: 3.20, trend1h: 'Neutro', trend4h: 'Neutro', trend1d: 'Baixa', shiftState: 'Suporte Frágil', rsi14: 47.1, smaAlignment: 'mixed', volume24hUsd: 35000000, marketCapUsd: 1350000000, high24h: 1.39, low24h: 1.33 },
];

export function RadarTrendDemo() {
  const navigate = useNavigate();

  // Store bindings
  const density = useStore((s) => s.tableDensity);
  const setTableDensity = useStore((s) => s.setTableDensity);
  const favorites = useStore((s) => s.favorites);
  const toggleFav = useStore((s) => s.toggleFav);
  const theme = useStore((s) => s.theme);
  const setStore = useStore((s) => s.set);

  // Local states for filtering and interactions
  const [data, setData] = useState<CryptoAssetItem[]>(INITIAL_ASSETS);
  const [activeTab, setActiveTab] = useState<string>('trend');
  const [universe, setUniverse] = useState<string>('top100');
  const [timeframe, setTimeframe] = useState<string>('4h');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLiveSimulating, setIsLiveSimulating] = useState<boolean>(true);
  const [selectedAsset, setSelectedAsset] = useState<CryptoAssetItem | null>(null);

  // Time clock (Brasília / UTC)
  const [clock, setClock] = useState({
    brt: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    utc: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' }),
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setClock({
        brt: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        utc: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' }),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live price tick simulator (discreet 300ms flash up/down)
  useEffect(() => {
    if (!isLiveSimulating) return;

    const interval = setInterval(() => {
      setData((prevData) => {
        // Pick 1 to 3 random assets to tick
        const count = Math.floor(Math.random() * 3) + 1;
        const next = [...prevData];

        for (let i = 0; i < count; i++) {
          const targetIdx = Math.floor(Math.random() * next.length);
          const asset = next[targetIdx];
          const deltaPct = (Math.random() * 0.4 - 0.19) / 100; // -0.19% to +0.21%
          const newPrice = Math.max(0.000001, asset.price * (1 + deltaPct));
          const flash: 'up' | 'down' = newPrice >= asset.price ? 'up' : 'down';

          next[targetIdx] = {
            ...asset,
            lastPrice: asset.price,
            price: Number(newPrice.toFixed(asset.price < 1 ? 6 : 2)),
            priceFlash: flash,
            change24h: Number((asset.change24h + deltaPct * 10).toFixed(2)),
          };
        }

        return next;
      });

      // Clear flash after 350ms
      const flashTimeout = setTimeout(() => {
        setData((prev) =>
          prev.map((a) => (a.priceFlash ? { ...a, priceFlash: null } : a))
        );
      }, 350);

      return () => clearTimeout(flashTimeout);
    }, 1200);

    return () => clearInterval(interval);
  }, [isLiveSimulating]);

  // Tab items for Radar
  const RADAR_TABS: readonly TabItem[] = [
    { id: 'trend', label: 'Tendência', badge: '50' },
    { id: 'monitor', label: 'Monitor' },
    { id: 'rsi', label: 'RSI' },
    { id: 'stoch', label: 'Stoch' },
    { id: 'supertrend', label: 'Supertrend' },
    { id: 'macd', label: 'MACD' },
    { id: 'bollinger', label: 'Bollinger' },
    { id: 'sma_ema', label: 'SMA/EMA' },
    { id: 'performance', label: 'Performance' },
    { id: 'btc_vs_alts', label: 'BTC vs Alts' },
    { id: 'attention', label: 'Atenção' },
    { id: 'sr', label: 'S/R Pivots' },
  ];

  // Filter chips
  const filterChips: readonly FilterChipItem[] = [
    { id: 'all', label: 'Todas', count: data.length },
    { id: 'alta_forte', label: 'Alta Forte', count: data.filter((d) => d.trend4h === 'Alta Forte').length, tone: 'bull' },
    { id: 'alta', label: 'Alta', count: data.filter((d) => d.trend4h === 'Alta').length, tone: 'bull' },
    { id: 'neutro', label: 'Neutro', count: data.filter((d) => d.trend4h === 'Neutro').length, tone: 'neutral' },
    { id: 'baixa', label: 'Baixa', count: data.filter((d) => d.trend4h === 'Baixa').length, tone: 'bear' },
    { id: 'baixa_forte', label: 'Baixa Forte', count: data.filter((d) => d.trend4h === 'Baixa Forte').length, tone: 'bear' },
    { id: 'rsi_oversold', label: 'RSI < 35 (Fundo)', count: data.filter((d) => d.rsi14 < 35).length, tone: 'warn' },
  ];

  // Filtering & searching
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchSymbol = item.symbol.toLowerCase().includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        if (!matchSymbol && !matchName) return false;
      }

      // Universe filter
      if (universe === 'favorites' && !favorites.includes(item.symbol)) {
        return false;
      }
      if (universe === 'top10' && item.rank > 10) return false;

      // Status chip filter
      if (statusFilter === 'alta_forte' && item.trend4h !== 'Alta Forte') return false;
      if (statusFilter === 'alta' && item.trend4h !== 'Alta') return false;
      if (statusFilter === 'neutro' && item.trend4h !== 'Neutro') return false;
      if (statusFilter === 'baixa' && item.trend4h !== 'Baixa') return false;
      if (statusFilter === 'baixa_forte' && item.trend4h !== 'Baixa Forte') return false;
      if (statusFilter === 'rsi_oversold' && item.rsi14 >= 35) return false;

      return true;
    });
  }, [data, searchQuery, universe, favorites, statusFilter]);

  // Aggregate KPI metrics
  const kpis = useMemo(() => {
    const totalVol = data.reduce((acc, d) => acc + d.volume24hUsd, 0);
    const altaCount = data.filter((d) => d.trend4h.includes('Alta')).length;
    const baixaCount = data.filter((d) => d.trend4h.includes('Baixa')).length;
    const avgRsi = data.reduce((acc, d) => acc + d.rsi14, 0) / data.length;

    return {
      volumeTotal: (totalVol / 1e9).toFixed(1) + 'B',
      bullRatio: Math.round((altaCount / data.length) * 100),
      bearRatio: Math.round((baixaCount / data.length) * 100),
      avgRsi: avgRsi.toFixed(1),
    };
  }, [data]);

  // Column definitions for DataTable
  const columns: ColumnDef<CryptoAssetItem>[] = [
    // Column 0: Pinned Moeda (Rank + Fav + Logo + Symbol + Name)
    {
      id: 'coin',
      header: 'Moeda / Ativo',
      pinned: 'left',
      width: '210px',
      sortable: true,
      accessor: (row) => row.rank,
      cell: (row) => {
        const isFav = favorites.includes(row.symbol);
        return (
          <div className="flex items-center gap-2">
            {/* Rank */}
            <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] w-4 text-right">
              {row.rank}
            </span>

            {/* Favorite Star */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFav(row.symbol);
              }}
              title={isFav ? 'Remover dos favoritos' : 'Favoritar ativo'}
              className="text-[var(--text-muted)] hover:text-[var(--warn)] transition-colors p-0.5"
            >
              <Star
                className={cn(
                  'h-3.5 w-3.5',
                  isFav ? 'fill-[var(--warn)] text-[var(--warn)]' : 'opacity-40 hover:opacity-100'
                )}
              />
            </button>

            {/* Token Badge Icon */}
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
              style={{ backgroundColor: row.color }}
            >
              {row.symbol.slice(0, 1)}
            </div>

            {/* Symbol & Name */}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-bold text-[var(--text-primary)] group-hover:text-[var(--brand)] transition-colors flex items-center gap-1">
                {row.symbol}
                <span className="text-[10px] font-normal text-[var(--text-muted)]">USDT</span>
              </span>
              <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[85px]">
                {row.name}
              </span>
            </div>
          </div>
        );
      },
    },

    // Column 1: Preço ao Vivo com Flash
    {
      id: 'price',
      header: 'Preço ($)',
      align: 'right',
      width: '110px',
      sortable: true,
      accessor: (row) => row.price,
      cell: (row) => {
        const formatted =
          row.price < 0.01
            ? row.price.toFixed(7)
            : row.price < 1
              ? row.price.toFixed(4)
              : row.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return (
          <span
            className={cn(
              'font-mono-tabular font-bold transition-all px-1.5 py-0.5 rounded-[4px]',
              row.priceFlash === 'up' ? 'flash-up' : row.priceFlash === 'down' ? 'flash-down' : 'text-[var(--text-primary)]'
            )}
          >
            ${formatted}
          </span>
        );
      },
    },

    // Column 2: 1h %
    {
      id: 'change1h',
      header: '1H (%)',
      align: 'right',
      width: '85px',
      sortable: true,
      accessor: (row) => row.change1h,
      cell: (row) => {
        const val = row.change1h;
        return (
          <span
            className={cn(
              'font-mono-tabular font-semibold text-[11px]',
              val > 0 ? 'text-[var(--bull-text)]' : val < 0 ? 'text-[var(--bear-text)]' : 'text-[var(--text-muted)]'
            )}
          >
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    },

    // Column 3: 24h %
    {
      id: 'change24h',
      header: '24H (%)',
      align: 'right',
      width: '95px',
      sortable: true,
      accessor: (row) => row.change24h,
      cell: (row) => {
        const val = row.change24h;
        return (
          <span
            className={cn(
              'inline-flex items-center justify-end rounded-full px-1.5 py-0.5 font-mono-tabular text-[11px] font-bold',
              val > 0
                ? 'bg-[var(--bull-bg)] text-[var(--bull-text)]'
                : val < 0
                  ? 'bg-[var(--bear-bg)] text-[var(--bear-text)]'
                  : 'text-[var(--text-muted)]'
            )}
          >
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    },

    // Column 4: 7d %
    {
      id: 'change7d',
      header: '7D (%)',
      align: 'right',
      width: '85px',
      sortable: true,
      accessor: (row) => row.change7d,
      cell: (row) => {
        const val = row.change7d;
        return (
          <span
            className={cn(
              'font-mono-tabular font-semibold text-[11px]',
              val > 0 ? 'text-[var(--bull-text)]' : val < 0 ? 'text-[var(--bear-text)]' : 'text-[var(--text-muted)]'
            )}
          >
            {val > 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        );
      },
    },

    // Column 5: Tendência 1H
    {
      id: 'trend1h',
      header: 'Tend. 1H',
      align: 'center',
      width: '110px',
      sortable: true,
      accessor: (row) => row.trend1h,
      cell: (row) => <TrendPill status={row.trend1h} size="xs" />,
    },

    // Column 6: Tendência 4H (Pilar central do radar)
    {
      id: 'trend4h',
      header: 'Tend. 4H',
      align: 'center',
      width: '115px',
      sortable: true,
      accessor: (row) => row.trend4h,
      cell: (row) => <TrendPill status={row.trend4h} pulse size="xs" />,
    },

    // Column 7: Tendência 1D
    {
      id: 'trend1d',
      header: 'Tend. 1D',
      align: 'center',
      width: '110px',
      sortable: true,
      accessor: (row) => row.trend1d,
      cell: (row) => <TrendPill status={row.trend1d} size="xs" />,
    },

    // Column 8: Shift de Estrutura
    {
      id: 'shift',
      header: 'Gatilho / Shift',
      align: 'left',
      width: '145px',
      sortable: true,
      accessor: (row) => row.shiftState,
      cell: (row) => (
        <span className="font-semibold text-[11px] text-[var(--text-secondary)]">
          {row.shiftState}
        </span>
      ),
    },

    // Column 9: RSI 14
    {
      id: 'rsi',
      header: 'RSI (14)',
      align: 'center',
      width: '95px',
      sortable: true,
      accessor: (row) => row.rsi14,
      cell: (row) => <RsiPill rsi={row.rsi14} size="xs" />,
    },

    // Column 10: SMA Alignment
    {
      id: 'sma',
      header: 'Médias (SMA)',
      align: 'center',
      width: '100px',
      sortable: true,
      accessor: (row) => row.smaAlignment,
      cell: (row) => <AlignmentPill alignment={row.smaAlignment} />,
    },

    // Column 11: Volume 24h
    {
      id: 'volume',
      header: 'Vol. 24H ($)',
      align: 'right',
      width: '110px',
      sortable: true,
      accessor: (row) => row.volume24hUsd,
      cell: (row) => {
        const vol = row.volume24hUsd;
        const str =
          vol >= 1e9
            ? `$${(vol / 1e9).toFixed(2)}B`
            : vol >= 1e6
              ? `$${(vol / 1e6).toFixed(1)}M`
              : `$${(vol / 1e3).toFixed(0)}K`;

        return <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">{str}</span>;
      },
    },

    // Column 12: Ação Rápida
    {
      id: 'actions',
      header: '',
      align: 'center',
      width: '50px',
      cell: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAsset(row);
          }}
          title="Ver detalhes técnicos do ativo"
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--brand)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header da Página: Título, Status de Conexão, Relógio BRT/UTC, Seletor de Tema e Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Crypto Radar
            </h1>
            <Pill tone="brand" dot pulse size="xs">
              AO VIVO
            </Pill>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Terminal de análise multi-timeframe e alinhamento de estrutura técnica
          </p>
        </div>

        {/* Global actions and status clocks */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Real-time Brasília / UTC Clock */}
          <div className="hidden sm:flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs text-[var(--text-secondary)] font-mono-tabular">
            <Clock className="h-3.5 w-3.5 text-[var(--brand)]" />
            <span>BRT: <strong>{clock.brt}</strong></span>
            <span className="opacity-40">|</span>
            <span>UTC: <strong>{clock.utc}</strong></span>
          </div>

          {/* Live Price Simulator Toggle */}
          <button
            type="button"
            onClick={() => setIsLiveSimulating(!isLiveSimulating)}
            title={isLiveSimulating ? 'Pausar simulação de ticks' : 'Ativar simulação de ticks'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs font-semibold transition-colors',
              isLiveSimulating
                ? 'border-[var(--brand)]/40 bg-[var(--brand-muted)] text-[var(--brand)]'
                : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {isLiveSimulating ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span className="hidden sm:inline">Ticks Live</span>
          </button>

          {/* Density Switch */}
          <button
            type="button"
            onClick={() => setTableDensity(density === 'compact' ? 'comfortable' : 'compact')}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <Sliders className="h-3.5 w-3.5 text-[var(--brand)]" />
            <span>{density === 'compact' ? 'Compacto (36px)' : 'Confortável (48px)'}</span>
          </button>

          {/* Theme Quick Switcher for Testing */}
          <select
            value={theme}
            onChange={(e) => {
              const newTheme = e.target.value as any;
              setStore({ theme: newTheme });
              document.documentElement.setAttribute('data-theme', newTheme);
            }}
            className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none"
          >
            <option value="minimal">Tema: Minimal (Padrão)</option>
            <option value="nex">Tema: Dark (Nex)</option>
            <option value="light">Tema: Light Real</option>
            <option value="neon">Tema: Neon</option>
            <option value="brutal">Tema: Brutal</option>
            <option value="glass">Tema: Glass</option>
          </select>
        </div>
      </div>

      {/* KPI Strip: 4 Cartões Executivos */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Volume 24H Total"
          value={`$${kpis.volumeTotal}`}
          change={+4.85}
          subtext="Universo monitorado (50+ pares)"
          tone="bull"
        />
        <KpiCard
          label="Pressão Alta vs Baixa (4H)"
          value={`${kpis.bullRatio}% Alta`}
          change={kpis.bullRatio - kpis.bearRatio}
          changeLabel={`${kpis.bearRatio}% em Baixa`}
          subtext="Alinhamento direcional"
          tone={kpis.bullRatio >= 50 ? 'bull' : 'bear'}
        />
        <KpiCard
          label="Dominância BTC"
          value="56.8%"
          change={+0.35}
          subtext="Fluxo direcionado para Blue Chips"
          tone="brand"
        />
        <KpiCard
          label="Média RSI 14 (Mercado)"
          value={kpis.avgRsi}
          subtext="Região de consolidação construtiva"
          tone="neutral"
        />
      </div>

      {/* Tab Strip com as 13 abas do Radar */}
      <TerminalTabs
        tabs={RADAR_TABS}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId)}
        variant="underline"
        size="md"
      />

      {/* Toolbar: Top N, Timeframe, Chips, Busca, Toggle de Densidade */}
      <TerminalToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        resultCount={{ current: filteredData.length, total: data.length }}
        universe={universe}
        onUniverseChange={setUniverse}
        universeOptions={[
          { id: 'top100', label: 'Top 100' },
          { id: 'top10', label: 'Top 10' },
          { id: 'favorites', label: `Favoritos (${favorites.length})` },
        ]}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        filterChips={filterChips}
        selectedFilter={statusFilter}
        onFilterChange={setStatusFilter}
        density={density}
        onToggleDensity={() => setTableDensity(density === 'compact' ? 'comfortable' : 'compact')}
        onExportCsv={() => {
          alert('Exportação CSV gerada com sucesso para os dados filtrados.');
        }}
      />

      {/* Tabela Virtualizada Data-Dense de Tendência */}
      <DataTable<CryptoAssetItem>
        data={filteredData}
        columns={columns}
        getRowId={(row) => row.symbol}
        density={density}
        tableHeight="600px"
        onRowClick={(row) => setSelectedAsset(row)}
      />

      {/* Modal de Detalhes Técnicos do Ativo ao Clicar na Linha */}
      <Modal
        isOpen={selectedAsset !== null}
        onClose={() => setSelectedAsset(null)}
        title={
          selectedAsset ? (
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">{selectedAsset.symbol} / USDT</span>
              <span className="text-xs text-[var(--text-muted)]">({selectedAsset.name})</span>
              <TrendPill status={selectedAsset.trend4h} size="xs" />
            </div>
          ) : (
            'Detalhe do Ativo'
          )
        }
        subtitle="Resumo de confluência técnica e níveis operacionais"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setSelectedAsset(null)}>
              Fechar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (selectedAsset) {
                  navigate(`/monitor?symbol=${selectedAsset.symbol}`);
                }
              }}
            >
              Abrir Candlestick no Monitor
            </Button>
          </div>
        }
      >
        {selectedAsset && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Preço Atual</div>
                <div className="font-mono-tabular text-lg font-bold text-[var(--text-primary)]">
                  ${selectedAsset.price}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Variação 24h</div>
                <div
                  className={cn(
                    'font-mono-tabular text-base font-bold',
                    selectedAsset.change24h >= 0 ? 'text-[var(--bull-text)]' : 'text-[var(--bear-text)]'
                  )}
                >
                  {selectedAsset.change24h >= 0 ? '+' : ''}{selectedAsset.change24h}%
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[var(--text-muted)]">RSI (14)</div>
                <div className="font-mono-tabular text-base font-bold text-[var(--text-primary)]">
                  {selectedAsset.rsi14}
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs leading-relaxed">
              <div className="font-bold text-[var(--text-primary)] mb-1">Gatilho de Estrutura:</div>
              <p className="text-[var(--text-secondary)]">
                O ativo <strong className="text-[var(--text-primary)]">{selectedAsset.symbol}</strong> exibe status <strong>{selectedAsset.trend4h}</strong> no timeframe de 4 horas, com alinhamento das médias móveis em configuração <strong>{selectedAsset.smaAlignment}</strong> e gatilho operacional: <em>"{selectedAsset.shiftState}"</em>.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
