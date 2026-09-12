import { useState, useEffect, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Radar,
  Trophy,
  Target,
  Activity,
  LineChart,
  Star,
  CircleDot,
  Grid3X3,
  Monitor,
  Users,
  FlaskConical,
  GraduationCap,
  Settings,
  Search,
  VolumeX,
  Volume2,
  Crosshair,
  Newspaper,
  CandlestickChart,
  Bell,
  Droplets,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Clock,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/stores/useStore';
import { GlobalSearch } from '@/components/analysis/GlobalSearch';
import { AlertChecker } from '@/components/analysis/AlertChecker';
import { useMonitorWatch } from '@/services/monitorWatch';
import { CommandPalette } from '@/components/ui/command-palette';
import { cn } from '@/lib/utils';

interface NavGroup {
  name: string;
  items: {
    to: string;
    label: string;
    icon: LucideIcon;
    highlight?: boolean;
    badge?: string;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    name: 'Mercado',
    items: [
      { to: '/', label: 'Dashboard Geral', icon: LayoutDashboard },
      { to: '/radar', label: 'Crypto Radar', icon: Radar },
      { to: '/oportunidades', label: 'Oportunidades', icon: Trophy },
      { to: '/setups', label: 'Setups Técnicos', icon: Target },
    ],
  },
  {
    name: 'Análise',
    items: [
      { to: '/monitor', label: 'Monitor de Ativo', icon: Monitor },
      { to: '/deepchart', label: 'DeepChart', icon: Grid3X3 },
      { to: '/regime', label: 'Regime de Mercado', icon: Activity },
      { to: '/tophunter', label: 'Top Hunter', icon: Crosshair },
      { to: '/bubbles', label: 'Market Bubbles', icon: CircleDot },
    ],
  },
  {
    name: 'Carteira',
    items: [
      { to: '/portfolio', label: 'Portfólio', icon: Wallet },
      { to: '/alerts', label: 'Alertas', icon: Bell },
      { to: '/watchlist', label: 'Watchlist', icon: Star },
    ],
  },
  {
    name: 'Sistema',
    items: [
      { to: '/stocks', label: 'Ações (B3 / EUA)', icon: LineChart },
      { to: '/news', label: 'Notícias & Sentimento', icon: Newspaper },
      { to: '/backtesting', label: 'Backtesting', icon: FlaskConical },
      { to: '/settings', label: 'Configurações', icon: Settings },
    ],
  },
];

export function Shell() {
  const theme = useStore((s) => s.theme);
  const set = useStore((s) => s.set);
  const muted = useStore((s) => s.muted);
  const segment = useStore((s) => s.segment);
  const name = useStore((s) => s.name);
  const loc = useLocation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Live clocks for Brasília and UTC
  const [clocks, setClocks] = useState({
    brt: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    utc: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' }),
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setClocks({
        brt: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        utc: new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC' }),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useMonitorWatch(); // vigia dos filtros do Monitor em background

  // Determine active section name for breadcrumbs
  const currentItem = NAV_GROUPS.flatMap((g) => g.items).find((it) => it.to === loc.pathname);
  const pageTitle = currentItem?.label || 'Terminal';

  return (
    <div className="app-shell flex min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {/* Sidebar Desktop */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-1)] transition-all duration-200 z-30 lg:flex',
          isSidebarCollapsed ? 'w-16 p-2' : 'w-60 p-3'
        )}
      >
        {/* Brand Header & Collapse Toggle */}
        <div className="mb-3 flex items-center justify-between gap-2 px-1 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[var(--brand)] text-xs font-bold text-white shadow-sm">
              NX
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col leading-none">
                <span className="font-bold tracking-tight text-sm text-[var(--text-primary)]">
                  CriptoNex
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] mt-0.5">
                  Terminal Pro
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className="rounded-[4px] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation Group Items */}
        <div className="flex-1 overflow-y-auto space-y-4 scrollbar-none pr-0.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.name} className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-80">
                  {group.name}
                </div>
              )}
              {group.items.map((it) => {
                const isActive = loc.pathname === it.to;
                return (
                  <NavLink
                    key={it.to + it.label}
                    to={it.to}
                    title={isSidebarCollapsed ? it.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors select-none',
                      isActive
                        ? 'font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
                      it.highlight && !isActive ? 'text-[var(--brand)]' : ''
                    )}
                  >
                    <it.icon size={16} className={cn('shrink-0', isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]')} />
                    {!isSidebarCollapsed && <span className="truncate">{it.label}</span>}
                    {!isSidebarCollapsed && it.badge && (
                      <span className="ml-auto px-1.5 text-[10px] font-mono-tabular font-bold tabular-nums text-[var(--text-muted)]">
                        {it.badge}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-[var(--brand)]" />
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer: Status ao vivo */}
        <div className="mt-auto border-t border-[var(--border-subtle)] pt-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--bull)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--bull)]" />
            </span>
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                WebSocket Conectado
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Body */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Modern Topbar */}
        <header className="sticky top-0 z-20 flex h-13 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4">
          {/* Left: Mobile Title / Breadcrumbs */}
          <div className="flex items-center gap-2">
            <div className="font-bold tracking-tight text-sm text-[var(--text-primary)] lg:hidden flex items-center gap-1.5">
              <span className="rounded bg-[var(--brand)] px-1.5 py-0.5 text-xs text-white font-bold">NX</span>
              CriptoNex
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span>Terminal</span>
              <span className="opacity-40">/</span>
              <span className="font-semibold text-[var(--text-primary)]">{pageTitle}</span>
            </div>
          </div>

          {/* Center: Command Palette Trigger Button (Ctrl+K) */}
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="flex items-center gap-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors w-48 sm:w-64 md:w-80 shadow-sm"
          >
            <Search size={13} className="shrink-0 text-[var(--text-muted)]" />
            <span className="truncate">Buscar ticker ou página...</span>
            <kbd className="ml-auto hidden sm:inline-block rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-mono-tabular font-semibold text-[var(--text-muted)]">
              Ctrl+K
            </kbd>
          </button>

          {/* Right Controls: Market Clocks, Segment Toggle, Audio, Theme, Profile */}
          <div className="flex items-center gap-2.5">
            {/* Clocks BRT & UTC */}
            <div className="hidden xl:flex items-center gap-2 px-1 text-[11px] font-mono-tabular tabular-nums text-[var(--text-secondary)]">
              <Clock size={12} aria-hidden="true" />
              <span>BRT <strong className="font-semibold text-[var(--text-primary)]">{clocks.brt}</strong></span>
              <span className="opacity-30">|</span>
              <span>UTC <strong className="font-semibold text-[var(--text-primary)]">{clocks.utc}</strong></span>
            </div>

            {/* Segment Toggle (Crypto vs Stocks) */}
            <div className="flex items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs">
              {(['crypto', 'stocks'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => set({ segment: s })}
                  aria-pressed={segment === s}
                  className={cn(
                    'rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors',
                    segment === s
                      ? 'bg-[var(--surface-1)] font-semibold text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {s === 'crypto' ? 'Crypto' : 'Ações'}
                </button>
              ))}
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              title={muted ? 'Ativar efeitos sonoros' : 'Silenciar sons de alertas'}
              onClick={() => set({ muted: !muted })}
              className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            {/* Theme Selector */}
            <select
              value={theme}
              onChange={(e) => {
                const nextTheme = e.target.value as any;
                set({ theme: nextTheme });
                document.documentElement.setAttribute('data-theme', nextTheme);
              }}
              className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none shadow-sm cursor-pointer"
            >
              <option value="light">Light Minimalista (Padrão)</option>
              <option value="minimal">Dark Minimalista</option>
              <option value="nex">Dark Terminal</option>
              <option value="glass">Glass</option>
              <option value="neon">Neon</option>
              <option value="brutal">Brutal</option>
            </select>

            {/* User Profile Avatar */}
            <div
              title={name}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-xs font-bold text-[var(--text-primary)] border border-[var(--border)] shadow-sm"
            >
              {name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Global Page Container */}
        <main className="mx-auto w-full max-w-[1500px] flex-1 space-y-4 p-4">
          <Outlet />
        </main>

        <AlertChecker />
        <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />

        {/* Mobile Navigation Bar */}
        <nav className="sticky bottom-0 flex gap-1 overflow-x-auto border-t border-[var(--border)] bg-[var(--surface-1)] p-2 lg:hidden scrollbar-none z-30">
          {NAV_GROUPS.flatMap((g) => g.items).slice(0, 8).map((it) => (
            <NavLink
              key={it.label}
              to={it.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1 rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]'
                )
              }
            >
              <it.icon size={14} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
