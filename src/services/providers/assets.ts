import type { Asset } from '@/types';
// Lista ampla de cryptos (não limitada a 5). Binance symbol + CoinGecko id.
export const CRYPTO_ASSETS: Asset[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'BTCUSDT', coingeckoId: 'bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'ETHUSDT', coingeckoId: 'ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'SOLUSDT', coingeckoId: 'solana' },
  { id: 'bnb', symbol: 'BNB', name: 'BNB', kind: 'crypto', sector: 'Exchange', binanceSymbol: 'BNBUSDT', coingeckoId: 'binancecoin' },
  { id: 'xrp', symbol: 'XRP', name: 'XRP', kind: 'crypto', sector: 'Payments', binanceSymbol: 'XRPUSDT', coingeckoId: 'ripple' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', kind: 'crypto', sector: 'Meme', binanceSymbol: 'DOGEUSDT', coingeckoId: 'dogecoin' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'ADAUSDT', coingeckoId: 'cardano' },
  { id: 'avalanche', symbol: 'AVAX', name: 'Avalanche', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'AVAXUSDT', coingeckoId: 'avalanche-2' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', kind: 'crypto', sector: 'Oracle', binanceSymbol: 'LINKUSDT', coingeckoId: 'chainlink' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', kind: 'crypto', sector: 'Layer 0', binanceSymbol: 'DOTUSDT', coingeckoId: 'polkadot' },
  { id: 'matic', symbol: 'MATIC', name: 'Polygon', kind: 'crypto', sector: 'Layer 2', binanceSymbol: 'MATICUSDT', coingeckoId: 'matic-network' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', kind: 'crypto', sector: 'Payments', binanceSymbol: 'LTCUSDT', coingeckoId: 'litecoin' },
  { id: 'arbitrum', symbol: 'ARB', name: 'Arbitrum', kind: 'crypto', sector: 'Layer 2', binanceSymbol: 'ARBUSDT', coingeckoId: 'arbitrum' },
  { id: 'optimism', symbol: 'OP', name: 'Optimism', kind: 'crypto', sector: 'Layer 2', binanceSymbol: 'OPUSDT', coingeckoId: 'optimism' },
  { id: 'near', symbol: 'NEAR', name: 'NEAR Protocol', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'NEARUSDT', coingeckoId: 'near' },
  { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos', kind: 'crypto', sector: 'Interop', binanceSymbol: 'ATOMUSDT', coingeckoId: 'cosmos' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', kind: 'crypto', sector: 'DeFi', binanceSymbol: 'UNIUSDT', coingeckoId: 'uniswap' },
  { id: 'injective', symbol: 'INJ', name: 'Injective', kind: 'crypto', sector: 'DeFi', binanceSymbol: 'INJUSDT', coingeckoId: 'injective-protocol' },
  { id: 'bittensor', symbol: 'TAO', name: 'Bittensor', kind: 'crypto', sector: 'AI', binanceSymbol: 'TAOUSDT', coingeckoId: 'bittensor' },
  { id: 'render', symbol: 'RENDER', name: 'Render', kind: 'crypto', sector: 'AI', binanceSymbol: 'RENDERUSDT', coingeckoId: 'render-token' },
  { id: 'fetch', symbol: 'FET', name: 'Fetch.ai', kind: 'crypto', sector: 'AI', binanceSymbol: 'FETUSDT', coingeckoId: 'fetch-ai' },
  { id: 'sui', symbol: 'SUI', name: 'Sui', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'SUIUSDT', coingeckoId: 'sui' },
  { id: 'aptos', symbol: 'APT', name: 'Aptos', kind: 'crypto', sector: 'Layer 1', binanceSymbol: 'APTUSDT', coingeckoId: 'aptos' },
  { id: 'filecoin', symbol: 'FIL', name: 'Filecoin', kind: 'crypto', sector: 'Storage', binanceSymbol: 'FILUSDT', coingeckoId: 'filecoin' },
  { id: 'aave', symbol: 'AAVE', name: 'Aave', kind: 'crypto', sector: 'DeFi', binanceSymbol: 'AAVEUSDT', coingeckoId: 'aave' },
];

export const STOCK_ASSETS: Asset[] = [
  { id: 'PETR4', symbol: 'PETR4', name: 'Petrobras PN', kind: 'stock', sector: 'Energia' },
  { id: 'VALE3', symbol: 'VALE3', name: 'Vale ON', kind: 'stock', sector: 'Mineração' },
  { id: 'ITUB4', symbol: 'ITUB4', name: 'Itaú PN', kind: 'stock', sector: 'Bancos' },
  { id: 'AAPL', symbol: 'AAPL', name: 'Apple', kind: 'stock', sector: 'Tech' },
  { id: 'MSFT', symbol: 'MSFT', name: 'Microsoft', kind: 'stock', sector: 'Tech' },
  { id: 'NVDA', symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', sector: 'Tech' },
];
