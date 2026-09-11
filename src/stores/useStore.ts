import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortfolioPosition } from '@/types';
import type { StockEntry } from '@/services/universeTypes';
import type { Operation, Wallet } from '@/lib/portfolio';
import type { CustomScan } from '@/engine/scanConditions';
import type { MonFilter } from '@/engine/monitor';

export type ThemeName = 'light' | 'neon' | 'glass' | 'brutal' | 'nex';
export type PortfolioMethod = 'standard' | 'investor';

export interface PriceAlert {
  id: string;
  symbol: string;
  kind: 'crypto' | 'stock';
  condition: 'above' | 'below';
  price: number;
  active: boolean;
  createdAt: string;
  triggeredAt: string | null;
}
interface SettingsState {
  name: string;
  currency: string;
  refreshSec: number;
  brapiToken: string;
  theme: ThemeName;
  muted: boolean;
  segment: 'crypto' | 'stocks';
  favorites: string[];
  watchlist: string[];
  positions: PortfolioPosition[];
  operations: Operation[];
  wallets: Wallet[];
  portfolioMethod: PortfolioMethod;
  customScans: CustomScan[];
  sectors: Record<string, string>;
  customAssets: StockEntry[];
  alerts: PriceAlert[];
  monFilters: MonFilter[];
  monDisabled: string[];
  set: (p: Partial<SettingsState>) => void;
  toggleFav: (s: string) => void;
  toggleWatch: (s: string) => void;
  addPosition: (p: PortfolioPosition) => void;
  updatePosition: (id: string, p: Partial<PortfolioPosition>) => void;
  removePosition: (id: string) => void;
  addOperation: (o: Operation) => void;
  updateOperation: (id: string, o: Partial<Operation>) => void;
  removeOperation: (id: string) => void;
  addWallet: (name: string) => void;
  renameWallet: (id: string, name: string) => void;
  removeWallet: (id: string) => void;
  addScan: (s: CustomScan) => void;
  removeScan: (id: string) => void;
  reorderFav: (symbols: string[]) => void;
  addCustomAsset: (a: StockEntry) => void;
  removeCustomAsset: (symbol: string) => void;
  addAlert: (a: PriceAlert) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  addMonFilter: (f: MonFilter) => void;
  removeMonFilter: (id: string) => void;
  toggleMonFilter: (id: string) => void;
  markTriggered: (id: string) => void;
  exportAll: () => string;
  importAll: (json: string) => void;
  clearAll: () => void;
}
export const useStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      name: 'Analista Local',
      currency: 'USD',
      refreshSec: 60,
      brapiToken: '',
      theme: 'nex',
      muted: false,
      segment: 'crypto',
      favorites: ['BTC', 'ETH', 'SOL'],
      watchlist: ['BTC', 'ETH', 'SOL', 'TAO', 'LINK'],
      positions: [],
      operations: [],
      wallets: [{ id: 'main', name: 'Principal', createdAt: new Date().toISOString() }],
      portfolioMethod: 'standard' as PortfolioMethod,
      customScans: [],
      sectors: {},
      customAssets: [],
      alerts: [],
      monFilters: [],
      monDisabled: [],
      set: (p) => set(p),
      toggleFav: (s) => set({ favorites: get().favorites.includes(s) ? get().favorites.filter((x) => x !== s) : [...get().favorites, s] }),
      toggleWatch: (s) => set({ watchlist: get().watchlist.includes(s) ? get().watchlist.filter((x) => x !== s) : [...get().watchlist, s] }),
      addPosition: (p) => set({ positions: [...get().positions, p] }),
      updatePosition: (id, p) => set({ positions: get().positions.map((x) => (x.id === id ? { ...x, ...p } : x)) }),
      removePosition: (id) => set({ positions: get().positions.filter((x) => x.id !== id) }),
      addOperation: (o) => set({ operations: [...get().operations, o] }),
      updateOperation: (id, o) => set({ operations: get().operations.map((x) => (x.id === id ? { ...x, ...o } : x)) }),
      removeOperation: (id) => set({ operations: get().operations.filter((x) => x.id !== id) }),
      addWallet: (name) => set({ wallets: [...get().wallets, { id: `${Date.now()}`, name: name.trim() || 'Carteira', createdAt: new Date().toISOString() }] }),
      renameWallet: (id, name) => set({ wallets: get().wallets.map((w) => (w.id === id ? { ...w, name } : w)) }),
      removeWallet: (id) => {
        if (id === 'main') return;
        set({ wallets: get().wallets.filter((w) => w.id !== id), operations: get().operations.map((o) => (o.walletId === id ? { ...o, walletId: 'main' } : o)) });
      },
      addScan: (s) => set({ customScans: [...get().customScans, s] }),
      removeScan: (id) => set({ customScans: get().customScans.filter((x) => x.id !== id) }),
      reorderFav: (symbols) => set({ favorites: symbols }),
      addCustomAsset: (a) => set({ customAssets: get().customAssets.some((x) => x.symbol === a.symbol) ? get().customAssets : [...get().customAssets, a] }),
      removeCustomAsset: (symbol) => set({ customAssets: get().customAssets.filter((x) => x.symbol !== symbol) }),
      addAlert: (a) => set({ alerts: [...get().alerts, a] }),
      removeAlert: (id) => set({ alerts: get().alerts.filter((x) => x.id !== id) }),
      toggleAlert: (id) => set({ alerts: get().alerts.map((x) => (x.id === id ? { ...x, active: !x.active, triggeredAt: null } : x)) }),
      addMonFilter: (f) => set({ monFilters: [...get().monFilters, f] }),
      removeMonFilter: (id) => set({ monFilters: get().monFilters.filter((x) => x.id !== id), monDisabled: get().monDisabled.filter((x) => x !== id) }),
      toggleMonFilter: (id) => set({ monDisabled: get().monDisabled.includes(id) ? get().monDisabled.filter((x) => x !== id) : [...get().monDisabled, id] }),
      markTriggered: (id) => set({ alerts: get().alerts.map((x) => (x.id === id ? { ...x, triggeredAt: new Date().toISOString(), active: false } : x)) }),
      exportAll: () => JSON.stringify({ app: 'pulso-mercado', v: 5, exportedAt: new Date().toISOString(), settings: { name: get().name, currency: get().currency, refreshSec: get().refreshSec, theme: get().theme, segment: get().segment, portfolioMethod: get().portfolioMethod }, favorites: get().favorites, watchlist: get().watchlist, positions: get().positions, operations: get().operations, wallets: get().wallets, sectors: get().sectors, customAssets: get().customAssets, alerts: get().alerts, customScans: get().customScans }, null, 2),
      importAll: (json) => {
        const d = JSON.parse(json) as { settings?: Partial<SettingsState> & { portfolioMethod?: PortfolioMethod }; favorites?: string[]; watchlist?: string[]; positions?: PortfolioPosition[]; operations?: Operation[]; wallets?: Wallet[]; sectors?: Record<string, string>; customAssets?: StockEntry[]; alerts?: PriceAlert[]; customScans?: CustomScan[] };
        if (!d || typeof d !== 'object') throw new Error('Arquivo inválido');
        const migratedOps: Operation[] = d.operations ?? (d.positions ?? []).map((p) => ({ id: p.id, walletId: 'main', kind: p.kind, symbol: p.symbol, side: 'buy' as const, quantity: p.quantity, price: p.avgPrice, date: p.date, note: p.note }));
        set({ ...(d.settings ?? {}), portfolioMethod: d.settings?.portfolioMethod ?? get().portfolioMethod, favorites: d.favorites ?? get().favorites, watchlist: d.watchlist ?? get().watchlist, positions: [], operations: migratedOps.length ? migratedOps : get().operations, wallets: d.wallets ?? (get().wallets.length ? get().wallets : [{ id: 'main', name: 'Principal', createdAt: new Date().toISOString() }]), sectors: d.sectors ?? get().sectors, customAssets: d.customAssets ?? get().customAssets, alerts: d.alerts ?? get().alerts, customScans: d.customScans ?? get().customScans });
      },
      clearAll: () => set({ positions: [], operations: [], favorites: [], watchlist: [], sectors: {}, customAssets: [], alerts: [], customScans: [], wallets: [{ id: 'main', name: 'Principal', createdAt: new Date().toISOString() }] }),
    }),
    {
      name: 'cc.user',
      version: 5,
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        if (!Array.isArray(s.monFilters)) s.monFilters = [];
        if (!Array.isArray(s.monDisabled)) s.monDisabled = [];
        const positions = (s.positions ?? []) as PortfolioPosition[];
        const operations = (s.operations ?? []) as Operation[];
        if (positions.length && !operations.length) {
          s.operations = positions.map((p) => ({ id: p.id, walletId: 'main', kind: p.kind, symbol: p.symbol, side: 'buy' as const, quantity: p.quantity, price: p.avgPrice, date: p.date, note: p.note }));
        }
        if (!(s.wallets as unknown[] | undefined)?.length) {
          s.wallets = [{ id: 'main', name: 'Principal', createdAt: new Date().toISOString() }];
          for (const o of s.operations as Operation[]) o.walletId = 'main';
        }
        if (!s.portfolioMethod) s.portfolioMethod = 'standard';
        return s;
      },
    },
  ),
);
