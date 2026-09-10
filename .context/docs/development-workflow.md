# Development Workflow — Pulso de Mercado

1. `npm install` (uma vez / ao trocar deps).
2. `npm run dev` → http://localhost:5173.
3. Implementar em camadas: types → services/providers → engine → hooks →
   pages; nunca HTTP em componente.
4. `npx vitest run` p/ motor analítico e parsers (TSV Nasdaq, lookup,
   merge de universo).
5. `npm run build` deve passar limpo antes de considerar pronto
   (tsc --noEmit + vite build).
6. Zero TODO/placeholder/dado fake; fonte indisponível = estado de erro +
   retry, nunca número inventado.
7. Temas: só via CSS variables em `src/styles/themes.css`.
8. Harness dotcontext: workflow PREVC em `.context/runtime/workflows/`,
   sensores em `.context/config/sensors.json` (build, testes, boot do dev).
