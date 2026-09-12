import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/coingecko': {
        target: 'https://api.coingecko.com/api/v3',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/coingecko/, ''),
      },
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo/, ''),
      },
      '/api/ylookup': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ylookup/, ''),
      },
      '/nasdaq': {
        target: 'https://www.nasdaqtrader.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/nasdaq/, ''),
      },
      '/api/rss-cd': {
        target: 'https://www.coindesk.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rss-cd/, ''),
      },
      '/api/rss-ct': {
        target: 'https://cointelegraph.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rss-ct/, ''),
      },
      '/api/rss-dec': {
        target: 'https://decrypt.co',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rss-dec/, ''),
      },
      '/api/rss-bm': {
        target: 'https://bitcoinmagazine.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rss-bm/, ''),
      },
      '/api/rss-yf': {
        target: 'https://finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rss-yf/, ''),
      },
      '/api/reddit': {
        target: 'https://www.reddit.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/reddit/, ''),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
