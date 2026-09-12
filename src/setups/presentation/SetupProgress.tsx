/**
 * Barra fina de 1px no topo da página: status "Analisando X%".
 * Só existe durante a análise; some sem deixar rastro.
 */
export function SetupProgress({ pct }: { pct: number }) {
  return (
    <div className="h-px bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Analisando setups">
      <div className="h-px bg-cyan-300 transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}
