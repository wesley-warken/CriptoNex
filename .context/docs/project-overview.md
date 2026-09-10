# Project Overview — Pulso de Mercado

Terminal web LOCAL e pessoal de análise de mercado (crypto + ações), sem login,
sem backend próprio, sem paywall. Inspirado funcionalmente em plataformas
profissionais, com identidade, textos e componentes próprios.

- Stack: Vite 6 + React 18 + TypeScript strict + Tailwind 3.4 + React Router 6 +
  Zustand 5 (persist) + TanStack Table + Recharts + lightweight-charts + D3 +
  technicalindicators + Lucide + date-fns.
- Comandos: `npm run dev` (app em http://localhost:5173), `npm run build`
  (tsc --noEmit + vite build, deve passar limpo), `npm run test` (Vitest).
- Persistência: Zustand persist (`cc.user`) + snapshots em localStorage +
  universo de ativos em IndexedDB via `src/lib/idb.ts` (idb-keyval).
- Pipeline analítico: providers → normalização → cache → indicadores →
  regime → sinais → scoring → ranking → interpretação → UI.
- 16 rotas: /, /portfolio, /radar, /opportunities, /regime, /stocks,
  /watchlist, /bubbles, /deepchart, /monitor, /tophunter, /social,
  /favorites, /backtesting, /training, /settings.
- 4 temas via CSS variables (`src/styles/themes.css`): glass (default),
  light, neon, brutal. Nenhuma cor hardcoded em componentes.
- Interface inteira em pt-BR; termos de mercado (RSI, MACD, Breakout) em inglês.
