import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Compass, LineChart, SunMoon, Sliders, Volume2, VolumeX, ArrowRight, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/stores/useStore';

export interface CommandItem {
  id: string;
  category: 'Ativos' | 'Navegação' | 'Ações';
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * CommandPalette: Busca global acionável por Ctrl+K ou Cmd+K.
 */
export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const theme = useStore((s) => s.theme);
  const density = useStore((s) => s.tableDensity);
  const muted = useStore((s) => s.muted);
  const set = useStore((s) => s.set);
  const setTableDensity = useStore((s) => s.setTableDensity);

  // Keyboard shortcut Ctrl+K listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Base list of commands
  const commands: CommandItem[] = [
    // Pages
    {
      id: 'page-radar-demo',
      category: 'Navegação',
      title: 'Crypto Radar → Demo Tendência',
      subtitle: 'Tabela virtualizada data-dense com 60+ moedas',
      icon: <Compass className="h-4 w-4 text-[var(--brand)]" />,
      onSelect: () => {
        navigate('/demo/radar');
        onClose();
      },
    },
    {
      id: 'page-radar',
      category: 'Navegação',
      title: 'Crypto Radar Principal',
      subtitle: '13 abas de screeners e indicadores',
      icon: <Compass className="h-4 w-4 text-[var(--text-secondary)]" />,
      onSelect: () => {
        navigate('/radar');
        onClose();
      },
    },
    {
      id: 'page-dashboard',
      category: 'Navegação',
      title: 'Dashboard de Mercado',
      subtitle: 'Visão macro, dominância e Fear & Greed',
      icon: <LineChart className="h-4 w-4 text-[var(--text-secondary)]" />,
      onSelect: () => {
        navigate('/');
        onClose();
      },
    },
    {
      id: 'page-monitor',
      category: 'Navegação',
      title: 'Monitor de Ativo',
      subtitle: 'Candlestick em tempo real e trade plan',
      icon: <LineChart className="h-4 w-4 text-[var(--text-secondary)]" />,
      onSelect: () => {
        navigate('/monitor');
        onClose();
      },
    },

    // Actions
    {
      id: 'act-density',
      category: 'Ações',
      title: `Alternar Densidade: ${density === 'compact' ? 'Compacto (36px)' : 'Confortável (48px)'}`,
      subtitle: 'Alternar altura de linha nas tabelas do terminal',
      icon: <Sliders className="h-4 w-4 text-[var(--brand)]" />,
      onSelect: () => {
        setTableDensity(density === 'compact' ? 'comfortable' : 'compact');
        onClose();
      },
    },
    {
      id: 'act-sound',
      category: 'Ações',
      title: muted ? 'Ativar Efeitos Sonoros' : 'Silenciar Alertas Sonoros',
      subtitle: 'Sons de execução de ordens e gatilhos de alerta',
      icon: muted ? <Volume2 className="h-4 w-4 text-[var(--bull)]" /> : <VolumeX className="h-4 w-4 text-[var(--bear)]" />,
      onSelect: () => {
        set({ muted: !muted });
        onClose();
      },
    },
    {
      id: 'act-theme',
      category: 'Ações',
      title: `Alternar Tema (Atual: ${theme})`,
      subtitle: 'Chavear entre dark, light, neon e brutal',
      icon: <SunMoon className="h-4 w-4 text-[var(--warn)]" />,
      onSelect: () => {
        const themes = ['minimal', 'nex', 'light', 'neon', 'brutal', 'glass'] as const;
        const curIdx = themes.indexOf(theme as any);
        const next = themes[(curIdx + 1) % themes.length];
        set({ theme: next });
        document.documentElement.setAttribute('data-theme', next);
        onClose();
      },
    },

    // Quick Tickers
    {
      id: 'ticker-btc',
      category: 'Ativos',
      title: 'BTC / Bitcoin',
      subtitle: 'Visualizar candles em tempo real e indicadores',
      icon: <span className="font-mono-tabular font-bold text-[var(--brand)]">₿</span>,
      onSelect: () => {
        navigate('/monitor?symbol=BTC');
        onClose();
      },
    },
    {
      id: 'ticker-eth',
      category: 'Ativos',
      title: 'ETH / Ethereum',
      subtitle: 'Visualizar candles em tempo real e indicadores',
      icon: <span className="font-mono-tabular font-bold text-[var(--brand)]">Ξ</span>,
      onSelect: () => {
        navigate('/monitor?symbol=ETH');
        onClose();
      },
    },
    {
      id: 'ticker-sol',
      category: 'Ativos',
      title: 'SOL / Solana',
      subtitle: 'Visualizar candles em tempo real e indicadores',
      icon: <span className="font-mono-tabular font-bold text-[var(--brand)]">◎</span>,
      onSelect: () => {
        navigate('/monitor?symbol=SOL');
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(query.toLowerCase())) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleNavigation = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].onSelect();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleNavigation);
    return () => window.removeEventListener('keydown', handleNavigation);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette container */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl animate-in fade-in zoom-in-95 duration-100">
        {/* Search header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ativo, tela ou ação do terminal (ou digite BTC, ETH, Radar)..."
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="hidden sm:inline-block rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-mono-tabular text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              Nenhum comando encontrado para "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => cmd.onSelect()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-[6px] px-3 py-2 text-xs transition-colors duration-100',
                    isSelected
                      ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-[var(--surface-2)]">
                      {cmd.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">{cmd.title}</div>
                      {cmd.subtitle && (
                        <div className="text-[11px] text-[var(--text-muted)]">{cmd.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {cmd.category}
                    </span>
                    {isSelected && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--brand)]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/50 px-3 py-2 text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span>↑↓ navegar</span>
            <span>↵ selecionar</span>
            <span>ESC fechar</span>
          </div>
          <span className="font-mono-tabular font-bold text-[var(--brand)]">CriptoNex v2.0</span>
        </div>
      </div>
    </div>
  );
}
