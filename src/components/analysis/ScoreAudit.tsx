import { useState } from 'react';
import type { OpportunityScore } from '@/types';
export function ScoreAudit({ score }: { score: OpportunityScore }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="tabular text-lg font-bold text-[var(--accent)] hover:underline" title="Ver como o score foi calculado">
        {score.score}/100
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="panel w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold">Como {score.symbol} chegou a {score.score}/100</h3>
            <p className="text-xs text-muted">Pesos centralizados em scoring.config.ts — auditável.</p>
            <div className="mt-3 space-y-1.5">
              {score.breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-sm">
                  <span className="w-44 text-xs text-muted">{b.label}</span>
                  <div className="h-2 flex-1 rounded bg-[var(--surface-2)]"><div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${(b.earned / b.max) * 100}%` }} /></div>
                  <span className="tabular text-xs">+{b.earned}/{b.max}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm">Confiança: <strong>{score.confidence}%</strong> · Qualidade dos dados: <strong>{score.dataQuality}%</strong> · Alinhamento: <strong>{score.timeframeAlignment}%</strong></div>
            <div className="mt-2 text-sm"><strong>Por quê</strong><ul className="list-disc pl-5 text-muted">{score.why.map((w) => <li key={w}>{w}</li>)}</ul></div>
            {score.risks.length > 0 && <div className="mt-2 text-sm"><strong>Riscos</strong><ul className="list-disc pl-5 text-muted">{score.risks.map((w) => <li key={w}>{w}</li>)}</ul></div>}
            <button onClick={() => setOpen(false)} className="mt-4 w-full rounded-lg bg-[var(--accent)] py-2 font-bold text-black">Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}
