import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, Radar, Trophy, Activity, LineChart, Star, CircleDot, Grid3X3, Monitor, Users, FlaskConical, GraduationCap, Settings, Search, VolumeX, Volume2, Crosshair, Newspaper, CandlestickChart, Bell, Droplets } from 'lucide-react';
import { useStore } from '@/stores/useStore';
import { GlobalSearch } from '@/components/analysis/GlobalSearch';
import { AlertChecker } from '@/components/analysis/AlertChecker';
import { useMonitorWatch } from '@/services/monitorWatch';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/radar', label: 'Crypto Radar', icon: Radar },
  { to: '/oportunidades', label: 'Oportunidades', icon: Trophy },
  { to: '/regime', label: 'Market Regime', icon: Activity },
  { to: '/stocks', label: 'Stocks', icon: LineChart },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/bubbles', label: 'Bubbles', icon: CircleDot },
  { to: '/deepchart', label: 'DeepChart', icon: Grid3X3 },
  { to: '/monitor', label: 'Monitor', icon: Monitor },
  { to: '/tophunter', label: 'Top Hunter', icon: Crosshair },
  { to: '/moneyflow', label: 'Money Flow', icon: Droplets },
  { to: '/derivatives', label: 'Derivativos', icon: CandlestickChart },
  { to: '/news', label: 'Notícias', icon: Newspaper },
  { to: '/alerts', label: 'Alertas', icon: Bell },
  { to: '/social', label: 'Social', icon: Users },
  { to: '/favorites', label: 'Favorites', icon: Star },
  { to: '/backtesting', label: 'Backtesting', icon: FlaskConical },
  { to: '/training', label: 'Trainings', icon: GraduationCap },
  { to: '/settings', label: 'Settings', icon: Settings },
];
export function Shell() {
  const theme = useStore((s) => s.theme);
  const set = useStore((s) => s.set);
  const muted = useStore((s) => s.muted);
  const segment = useStore((s) => s.segment);
  const name = useStore((s) => s.name);
  const loc = useLocation();
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useMonitorWatch(); // vigia dos filtros do Monitor em background (qualquer página)
  return (
    <div className="app-shell flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] p-3 lg:flex">
        <div className="mb-2 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent)] text-sm font-bold text-black">NX</div>
          <div><div className="font-bold tracking-tight">CriptoNex</div><div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">terminal local</div></div>
        </div>
        {ITEMS.map((it) => (
          <NavLink key={it.to + it.label} to={it.to} className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-[var(--surface-2)] hover:text-white', isActive && loc.pathname === it.to ? 'bg-[var(--surface-2)] font-bold text-[var(--accent)]' : '')}>
            <it.icon size={16} /> {it.label}
          </NavLink>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)]/90 p-3 backdrop-blur">
          <div className="font-bold tracking-tight lg:hidden">CriptoNex</div>
          <div className="relative ml-auto hidden min-w-52 items-center md:flex">
            <Search size={15} className="absolute left-2 text-muted" />
            <GlobalSearch />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm">
            {(['crypto', 'stocks'] as const).map((s) => (
              <button key={s} onClick={() => set({ segment: s })} className={cn('px-3 py-1.5', segment === s ? 'bg-[var(--accent)] font-bold text-black' : 'text-muted')}>{s === 'crypto' ? 'Crypto' : 'Stocks'}</button>
            ))}
          </div>
          <button title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => set({ muted: !muted })} className="rounded-lg border border-[var(--border)] p-2">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <select value={theme} onChange={(e) => set({ theme: e.target.value as typeof theme })} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm">
            <option value="nex">Nex</option>
            <option value="glass">Glass</option>
            <option value="light">Light</option>
            <option value="neon">Neon</option>
            <option value="brutal">Brutal</option>
          </select>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-2)] text-sm font-bold text-white">{name.slice(0, 1).toUpperCase()}</div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-4 p-4">
          <Outlet />
        </main>
        <AlertChecker />
        <nav className="sticky bottom-0 flex gap-1 overflow-x-auto border-t border-[var(--border)] bg-[var(--surface)] p-2 lg:hidden">
          {ITEMS.slice(0, 8).map((it) => (
            <NavLink key={it.label} to={it.to} className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs"><it.icon size={14} />{it.label}</NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
