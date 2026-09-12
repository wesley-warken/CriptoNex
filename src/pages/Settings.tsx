import { useState } from 'react';
import { useStore } from '@/stores/useStore';
import { MSection } from '@/components/minimal/MSection';
import { cn } from '@/lib/utils';

export function Settings() {
  const s = useStore();
  const [json, setJson] = useState('');
  const [msg, setMsg] = useState('');

  const themes: { id: typeof s.theme; label: string; desc: string }[] = [
    { id: 'minimal', label: 'Minimal', desc: 'Zinc plano, divisórias de 1px, cor só semântica (padrão)' },
    { id: 'nex', label: 'Nex Dark', desc: 'Preto profundo #0A0E14, camadas e cyan elétrico' },
    { id: 'glass', label: 'Glass', desc: 'Superfícies translúcidas e efeito backdrop blur' },
    { id: 'neon', label: 'Neon Cyber', desc: 'Bordas vibrantes com brilhos saturados' },
    { id: 'brutal', label: 'Industrial Brutal', desc: 'Bordas retas de alto contraste mono' },
    { id: 'light', label: 'Paper Light', desc: 'Modo claro com alto contraste editorial' },
  ];

  return (
    <div className="space-y-4 text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Configurações do Terminal</h1>
          <p className="text-xs text-[var(--text-muted)]">Ajuste preferências operacionais, densidade, sons e backup de dados locais.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
            CriptoNex v2.0
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Painel de Preferências Operacionais */}
        <MSection title="Preferências Operacionais" right={<span className="text-[11px] tabular-nums text-[var(--text-muted)]">Armazenado no navegador</span>}>

          <div className="mt-3 space-y-3.5 text-xs">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">Operador / Identificação</label>
              <input
                value={s.name}
                onChange={(e) => s.set({ name: e.target.value })}
                className="w-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
                placeholder="Seu nome ou handle"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">Moeda Padrão</label>
                <select
                  value={s.currency}
                  onChange={(e) => s.set({ currency: e.target.value })}
                  className="w-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                >
                  <option value="USD">USD ($ - Dólar)</option>
                  <option value="BRL">BRL (R$ - Real)</option>
                  <option value="EUR">EUR (€ - Euro)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">Intervalo de Refresh</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={s.refreshSec}
                    onChange={(e) => s.set({ refreshSec: Math.max(15, Number(e.target.value)) })}
                    className="w-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                  />
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">seg</span>
                </div>
              </div>
            </div>

            {/* Densidade das Tabelas */}
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--text-muted)]">Densidade das Tabelas de Dados</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => s.setTableDensity('compact')}
                  className={cn(
                    'flex flex-col items-start border p-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.98]',
                    s.tableDensity === 'compact'
                      ? 'border-[var(--brand)] bg-[var(--surface-2)]'
                      : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--text-muted)]'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <span className={cn('h-1.5 w-1.5 rounded-full', s.tableDensity === 'compact' ? 'bg-[var(--brand)]' : 'bg-[var(--text-muted)]')} />
                    <span>Compacto (38px)</span>
                  </div>
                  <span className="mt-1 text-[11px] text-[var(--text-muted)]">Densidade máxima de tela, estilo Bloomberg</span>
                </button>

                <button
                  onClick={() => s.setTableDensity('comfortable')}
                  className={cn(
                    'flex flex-col items-start border p-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.98]',
                    s.tableDensity === 'comfortable'
                      ? 'border-[var(--brand)] bg-[var(--surface-2)]'
                      : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--text-muted)]'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <span className={cn('h-1.5 w-1.5 rounded-full', s.tableDensity === 'comfortable' ? 'bg-[var(--brand)]' : 'bg-[var(--text-muted)]')} />
                    <span>Confortável (48px)</span>
                  </div>
                  <span className="mt-1 text-[11px] text-[var(--text-muted)]">Maior espaçamento vertical entre linhas</span>
                </button>
              </div>
            </div>

            {/* Sons e Alertas */}
            <div className="flex items-center justify-between border-y border-[var(--border)] py-2.5">
              <div>
                <div className="text-[var(--text-primary)] font-medium">Alertas Sonoros de Mercado</div>
                <div className="text-[11px] text-[var(--text-muted)]">Tocar áudio curto quando um gatilho de preço for atingido</div>
              </div>
              <button
                onClick={() => s.set({ muted: !s.muted })}
                className={cn(
                  'px-3 py-1 text-xs tabular-nums transition-colors duration-150 ease-out active:scale-[0.98]',
                  !s.muted ? 'font-semibold text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                )}
              >
                {!s.muted ? 'SOM ATIVO' : 'MUTADO'}
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">Token Brapi.dev (Opcional - Cotações B3)</label>
              <input
                value={s.brapiToken}
                onChange={(e) => s.set({ brapiToken: e.target.value })}
                placeholder="Cole seu token brapi.dev aqui para maior cota"
                className="w-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
              />
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Se vazio, utiliza endpoints públicos com fallback automático.</p>
            </div>
          </div>
        </MSection>

        {/* Painel de Temas & Backup */}
        <div className="space-y-4">
          <MSection title="Temas do Terminal" right={<span className="text-[11px] tabular-nums text-[var(--text-muted)]">6 variações visuais</span>}>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {themes.map((th) => (
                <button
                  key={th.id}
                  onClick={() => s.set({ theme: th.id })}
                  className={cn(
                    'flex flex-col items-start border p-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.98]',
                    s.theme === th.id
                      ? 'border-[var(--brand)] bg-[var(--surface-2)] shadow-sm'
                      : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--text-muted)]'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-[var(--text-primary)] text-xs">{th.label}</span>
                    {s.theme === th.id && (
                      <span className="text-[10px] font-bold tabular-nums text-[var(--brand)]">ATIVO</span>
                    )}
                  </div>
                  <span className="mt-1 text-[10px] text-[var(--text-muted)] leading-tight">{th.desc}</span>
                </button>
              ))}
            </div>
          </MSection>

          <MSection title="Backup, Importação e Redefinição" right={<span className="text-[11px] tabular-nums text-[var(--text-muted)]">Persistência 100% local</span>}>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => {
                  const blob = new Blob([s.exportAll()], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'criptonex-terminal-backup.json';
                  a.click();
                }}
                className="bg-[var(--brand)] px-3.5 py-2 text-xs font-semibold text-white transition-opacity duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
              >
                Exportar Backup JSON
              </button>

              <button
                onClick={() => {
                  try {
                    s.importAll(json);
                    setMsg('✓ Dados importados com sucesso.');
                  } catch {
                    setMsg('✕ Arquivo inválido — nenhum dado foi alterado.');
                  }
                }}
                className="border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--text-primary)] active:scale-[0.98]"
              >
                Importar JSON
              </button>

              <button
                onClick={() => {
                  if (confirm('Atenção: deseja limpar o portfólio, favoritos, alertas e configurações salvas neste navegador?')) {
                    s.clearAll();
                    setMsg('Todos os dados locais foram redefinidos.');
                  }
                }}
                className="ml-auto border border-[var(--bear)] bg-[var(--surface-1)] px-3 py-2 text-xs font-semibold text-[var(--bear)] transition-colors duration-150 ease-out hover:bg-[var(--bear)] hover:text-white active:scale-[0.98]"
              >
                Limpar Todos os Dados
              </button>
            </div>

            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder="Para restaurar, cole aqui o conteúdo do arquivo JSON de backup exportado…"
              className="mt-3 h-28 w-full border border-[var(--border)] bg-[var(--surface-1)] p-2.5 text-[11px] tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
            />

            {msg && (
              <div className="mt-2 border-y border-[var(--border)] py-1.5 text-xs text-[var(--text-secondary)]">
                {msg}
              </div>
            )}

            <p className="mt-2.5 text-[11px] leading-6 text-[var(--text-muted)]">
              O backup inclui carteiras, histórico de transações, watchlist, favoritos, setores e configurações. A importação realiza validação de integridade antes de gravar.
            </p>
          </MSection>
        </div>
      </div>
    </div>
  );
}
