# Security — Pulso de Mercado

- Sistema ANALÍTICO: nenhuma execução de ordens, nenhuma chave privada,
  seed de carteira ou secret de exchange no código ou storage.
- Token Brapi é opcional, digitado pelo usuário, guardado só no
  localStorage local (`cc.user`).
- Nenhum dado sai do navegador exceto chamadas públicas às APIs de mercado
  (Binance, CoinGecko, Yahoo, Nasdaq Trader, Brapi, Alternative.me, Reddit).
- Sem autenticação, sem cookies próprios, sem tracking.
- Importação JSON valida schema antes de substituir dados locais.
