# Tooling — Pulso de Mercado

- Node 22 + npm 10. Vite 6 (`vite.config.ts` com alias `@` → `src`,
  proxies dev, `vitest/config`).
- Deps runtime: react, react-router-dom, zustand, @tanstack/react-table,
  @tanstack/react-virtual, recharts, lightweight-charts, d3,
  technicalindicators, lucide-react, date-fns, idb-keyval, clsx,
  tailwind-merge, class-variance-authority.
- Chromium Playwright cacheado em `%LOCALAPPDATA%\ms-playwright`
  (usado p/ capturas e PDFs do run catalogo-telas-001).
- Harness dotcontext em `.context/` (docs, workflow PREVC, sensores).
- Runs documentais em `working/runs/` + `output/runs/` (padrão Document
  Studio Pro, ex. catalogo-telas-001).
