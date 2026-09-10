import { useState } from 'react';
import { useStore } from '@/stores/useStore';
import { Panel, PanelTitle } from '@/components/ui/kit';

export function Settings() {
  const s = useStore();
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel>
        <PanelTitle>Configurações</PanelTitle>
        <div className="grid gap-2 text-sm">
          <label>Nome<input value={s.name} onChange={(e) => s.set({ name: e.target.value })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" /></label>
          <label>Moeda<select value={s.currency} onChange={(e) => s.set({ currency: e.target.value })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"><option value="USD">USD</option><option value="BRL">BRL</option><option value="EUR">EUR</option></select></label>
          <label>Refresh (segundos)<input type="number" value={s.refreshSec} onChange={(e) => s.set({ refreshSec: Math.max(30, Number(e.target.value)) })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" /></label>
          <label>Brapi token (opcional, fallback B3)<input value={s.brapiToken} onChange={(e) => s.set({ brapiToken: e.target.value })} placeholder="token brapi.dev" className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5" /></label>
          <label>Tema<select value={s.theme} onChange={(e) => s.set({ theme: e.target.value as typeof s.theme })} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"><option value="glass">Glass</option><option value="light">Light</option><option value="neon">Neon</option><option value="brutal">Brutal</option></select></label>
        </div>
      </Panel>
      <Panel>
        <PanelTitle>Snapshots · Exportar · Importar · Limpar</PanelTitle>
        <div className="flex flex-wrap gap-2 text-sm">
          <button onClick={() => { const blob = new Blob([s.exportAll()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pulso-mercado-backup.json'; a.click(); }} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-bold text-black">Exportar JSON completo</button>
          <button onClick={() => { try { s.importAll(json); setMsg('Importado com sucesso.'); } catch { setMsg('Arquivo inválido — nada foi alterado.'); } }} className="rounded-lg border border-[var(--border)] px-3 py-1.5">Importar JSON</button>
          <button onClick={() => { if (confirm('Limpar portfolio, favoritos, watchlist e setores?')) { s.clearAll(); setMsg('Dados locais limpos.'); } }} className="rounded-lg border border-[var(--down)] px-3 py-1.5 text-[var(--down)]">Limpar dados</button>
        </div>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} placeholder="Cole aqui o JSON exportado para importar…" className="mt-2 h-36 w-full rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-xs" />
        {msg && <div className="mt-1 text-sm text-muted">{msg}</div>}
        <p className="mt-2 text-xs text-muted">O backup inclui portfolio, watchlist, favoritos, settings, setores e snapshots. A importação valida o schema antes de substituir.</p>
      </Panel>
    </div>
  );
}
