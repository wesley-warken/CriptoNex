<!-- impeccable:design-schema 1 -->

# DESIGN.md — CriptoNex (LED ticker wall)

Mundo visual vigente, registrado a partir do código construído (não de intenção).

## Paleta por tema

Comportamento comum: up = verde compra/alta, down = vermelho venda/baixa, warn = âmbar atenção, accent = ação/seleção. Todos os componentes usam `var(--*)`, nunca cor hardcoded.

| Tema | Fundo | Superfície | Accent | Up / Down / Warn |
|---|---|---|---|---|
| `nex` (padrão) | `#06090c` fosco | `#0b1116` / `#101922` | violeta `#b388ff` (marcador de ativo) | `#00e676` / `#ff3b30` / `#ffb000` |
| `glass` | `#0a101c` + brilhos cyan/violeta 12% | translúcido + blur 18px | ciano `#22d3ee` | `#34d399` / `#fb7185` / `#fbbf24` |
| `light` | `#f4f6f9` | `#ffffff` / `#eceff3` | azul `#0369a1` | `#047857` / `#be123c` / `#92400e` |
| `neon` | `#04060b` | `#080d17` / `#0c1424` | menta `#00ffc8` | `#00ff9d` / `#ff2d78` / `#ffe600` |
| `brutal` | `#f7f3e8` | `#fffdf5` / `#efe7d2` | índigo `#4338ca`, borda 2px + sombra bloco | `#166534` / `#b91c1c` / `#92400e` |

Painéis: borda hairline 1px, raio 6–10px (0 no brutal). Sem gradiente decorativo, sem halo colorido.

## Tipografia

- UI: system stack (`system-ui, -apple-system, Segoe UI`) — sem webfont, offline-proof.
- Numerais: stack mono (`ui-monospace, SFMono, Menlo, Consolas`) + `tabular-nums`, sempre alinhados à direita em tabelas.
- Micro-rótulos: 11px, bold, maiúsculas, tracking 0.14em, cor muted (painéis, cabeçalhos de tabela, toolbar).
- Escala contida (~1.125), sem display serifado.

## Componentes (`src/components/ui/kit.tsx`)

- `Btn`: mesma forma em tudo — `primary` (accent sólido), `ghost` (borda hairline), `danger`; 150ms só em cor/fundo/borda.
- `Seg`: banco segmentado, um aceso (Top N, tempos gráficos, Business/Realtime).
- `Badge`: célula acesa 12–20% da cor do sinal (up/down/warn/accent).
- `Panel`/`PanelTitle`: hairline + título micro; `Stat`: leitura de instrumento em ledger (rótulo, valor mono 2xl, sub) sem card aninhado.
- `Empty` (ensina a interface), `ErrorBox` (problema + recuperação), `Skeleton` (loading, nunca spinner no conteúdo).
- Ícones: lucide traço único; filtros do Monitor usam chaves (`trend-up`, `siren`…) mapeadas para lucide — nunca emoji.

## Tabelas e feed

Cabeçalhos micro com seta de ordenação sempre visível (⇅ apagada, ▼/▲ acesa). Linhas com hairline, hover em surface-2. Pílulas de estado como células acesas. Feed do Monitor com tinte 16% da cor do filtro.

## Movimento

Só estado: hover 150ms, pulse do AO VIVO, sem sequências de entrada. Gráfico atualiza via `update()` (zoom preservado).

## Superfícies do navegador

Seleção na cor accent 30%, scrollbar fina na cor da borda, `focus-visible` em accent, caret accent, placeholder muted 80%. Locale pt-BR no gráfico (fuso Brasília).
