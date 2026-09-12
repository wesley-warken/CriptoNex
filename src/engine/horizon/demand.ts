import type { Conviction } from '@/engine/ranking';

export interface DemandInput {
  /** Volume atual / média 20 (null = indisponível). */
  volRatio: number | null;
  /** Chaikin Money Flow 20 períodos (null = indisponível). */
  cmf: number | null;
}

export interface DemandVerdict {
  /** 0–100 (50 = desconhecido, sem fingir precisão). */
  score: number;
  /** false só quando há sinal E todos negativos. */
  pass: boolean;
  /** false = nenhum sinal disponível. */
  known: boolean;
  reasons: string[];
}

/**
 * Interesse comprador (antídoto contra recomendar ativo morto):
 * expansão de volume (≥1.5×) OU fluxo de dinheiro positivo (CMF>0).
 * Passado em alta sem demanda atual NÃO sustenta recomendação.
 */
export function assessDemand(x: DemandInput): DemandVerdict {
  const signals: { label: string; ok: boolean }[] = [];
  if (x.volRatio != null && Number.isFinite(x.volRatio)) {
    signals.push({
      label: x.volRatio >= 1.5 ? `volume ${x.volRatio.toFixed(1)}× a média (expansão)` : `volume ${x.volRatio.toFixed(1)}× (sem expansão)`,
      ok: x.volRatio >= 1.5,
    });
  }
  if (x.cmf != null && Number.isFinite(x.cmf)) {
    signals.push({
      label: x.cmf > 0 ? `fluxo comprador (CMF +${x.cmf.toFixed(2)})` : `fluxo vendedor (CMF ${x.cmf.toFixed(2)})`,
      ok: x.cmf > 0,
    });
  }
  if (!signals.length) {
    return { score: 50, pass: true, known: false, reasons: ['demanda desconhecida (sem volume/fluxo)'] };
  }
  const positives = signals.filter((s) => s.ok).length;
  return {
    score: Math.round((positives / signals.length) * 100),
    pass: positives > 0,
    known: true,
    reasons: signals.map((s) => s.label),
  };
}

/** Sem demanda comprovada, ELITE/FORTE degradam um tier. */
export function applyDemandGate(tier: Conviction, pass: boolean): Conviction {
  if (pass) return tier;
  if (tier === 'ELITE') return 'FORTE';
  if (tier === 'FORTE') return 'OBSERVAR';
  return tier;
}
