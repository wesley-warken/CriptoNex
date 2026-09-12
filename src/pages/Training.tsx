import { useState } from 'react';
import { MSection } from '@/components/minimal/MSection';
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
    <div className="space-y-3 text-[var(--text-secondary)]">
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">{Object.keys(LESSONS).map((k) => <button key={k} onClick={() => setTab(k)} className={k === tab ? 'px-3 py-1.5 text-sm font-semibold text-[var(--brand)] transition-colors duration-150 ease-out active:scale-[0.98]' : 'px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]'}>{k}</button>)}</div>
      <MSection title={tab}>
        <div className="divide-y divide-[var(--border)]">
          {([['Conceito', L.conceito], ['Interpretação', L.interpretacao], ['Exemplo', L.exemplo], ['Limitações', L.limitacoes]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="grid gap-1 py-2 first:pt-0 last:pb-0">
              <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
              <dd className="text-sm leading-6 text-[var(--text-secondary)]">{v}</dd>
            </div>
          ))}
        </div>
      </MSection>
      <MSection title="Calculadora — Risk/Reward, stop distance, position size">
        <div className="grid gap-2 md:grid-cols-4">
          {([['Entrada', entry, setEntry], ['Stop', stop, setStop], ['Alvo', target, setTarget], ['Risco (R$)', risk, setRisk]] as [string, string, (v: string) => void][]).map(([k, v, fn]) => (
            <label key={k} className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{k}<input value={v} onChange={(e) => fn(e.target.value)} type="number" step="any" className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm tabular-nums text-[var(--text-primary)] outline-none transition-colors duration-150 ease-out focus:border-[var(--brand)]" /></label>
          ))}
        </div>
        <div className="mt-2 text-sm tabular-nums text-[var(--text-secondary)]">R/R: <span className="font-semibold text-[var(--text-primary)]">{riskReward(Number(entry), Number(stop), Number(target))?.toFixed(2) ?? '—'}</span> · Stop distance: <span className="font-semibold text-[var(--text-primary)]">{Math.abs(Number(entry) - Number(stop)).toFixed(2)}</span> · Position size: <span className="font-semibold text-[var(--text-primary)]">{positionSize(Number(entry), Number(stop), Number(risk)).toFixed(4)}</span> un.</div>
      </MSection>
    </div>
  );
}
