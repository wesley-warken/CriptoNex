import { useState } from 'react';
import { Panel, PanelTitle } from '@/components/ui/kit';
import { positionSize, riskReward } from '@/engine/risk';

const LESSONS: Record<string, { conceito: string; interpretacao: string; exemplo: string; limitacoes: string }> = {
  RSI: { conceito: 'RSI (14) mede velocidade e magnitude dos movimentos: 0–100.', interpretacao: '<30 oversold (possível exaustão vendedora); >70 overbought; 50–68 zona saudável de tendência.', exemplo: 'SOL com RSI 58 + SMA50>SMA200 sugere momentum sem euforia.', limitacoes: 'Em tendências fortes, RSI pode ficar preso em overbought/oversold. Nunca use isolado.' },
  MACD: { conceito: 'MACD = EMA12 − EMA26; histograma mostra força do momentum.', interpretacao: 'Hist >0: momentum comprador; cruzamento para cima: aceleração altista.', exemplo: 'Hist saindo de −2 para +0.5 após fundo indica retomada de força.', limitacoes: 'Atrasado em mercados laterais; gera falsos cruzamentos sem filtro de tendência.' },
  Supertrend: { conceito: 'Supertrend combina ATR com direção: segue o preço com banda de volatilidade.', interpretacao: 'Verde/bullish: preço acima da banda; flip indica possível troca de regime de curto prazo.', exemplo: 'Flip para bullish com volume 2× média tem mais peso que flip seco.', limitacoes: 'Whipsaw em lateral; sempre confirmar com estrutura e volume.' },
  'Risk Management': { conceito: 'Risco se gerencia por tamanho de posição, stop e concentração.', interpretacao: 'R/R ≥ 2, risco por trade 1–2% da carteira, concentração por ativo <45%.', exemplo: 'Use a calculadora abaixo antes de dimensionar qualquer posição.', limitacoes: 'Conteúdo educacional. Não é recomendação financeira personalizada.' },
};
export function Training() {
  const [tab, setTab] = useState('RSI');
  const [entry, setEntry] = useState('100');
  const [stop, setStop] = useState('95');
  const [target, setTarget] = useState('112');
  const [risk, setRisk] = useState('200');
  const L = LESSONS[tab];
  return (
    <div className="space-y-3">
      <div className="flex gap-1">{Object.keys(LESSONS).map((k) => <button key={k} onClick={() => setTab(k)} className={k === tab ? 'rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-bold text-black' : 'rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-muted'}>{k}</button>)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel><PanelTitle>Conceito</PanelTitle><p className="text-sm">{L.conceito}</p></Panel>
        <Panel><PanelTitle>Interpretação</PanelTitle><p className="text-sm">{L.interpretacao}</p></Panel>
        <Panel><PanelTitle>Exemplo</PanelTitle><p className="text-sm">{L.exemplo}</p></Panel>
        <Panel><PanelTitle>Limitações</PanelTitle><p className="text-sm">{L.limitacoes}</p></Panel>
      </div>
      <Panel>
        <PanelTitle>Calculadora — Risk/Reward, stop distance, position size</PanelTitle>
        <div className="grid gap-2 md:grid-cols-4">
          {([['Entrada', entry, setEntry], ['Stop', stop, setStop], ['Alvo', target, setTarget], ['Risco (R$)', risk, setRisk]] as [string, string, (v: string) => void][]).map(([k, v, fn]) => (
            <label key={k} className="text-sm">{k}<input value={v} onChange={(e) => fn(e.target.value)} type="number" step="any" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" /></label>
          ))}
        </div>
        <div className="tabular mt-2 text-sm">R/R: {riskReward(Number(entry), Number(stop), Number(target))?.toFixed(2) ?? '—'} · Stop distance: {Math.abs(Number(entry) - Number(stop)).toFixed(2)} · Position size: {positionSize(Number(entry), Number(stop), Number(risk)).toFixed(4)} un.</div>
      </Panel>
    </div>
  );
}
