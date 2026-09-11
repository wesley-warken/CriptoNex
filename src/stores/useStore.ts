import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortfolioPosition } from '@/types';
import type { StockEntry } from '@/services/universeTypes';
import type { Operation, Wallet } from '@/lib/portfolio';
import type { CustomScan } from '@/engine/scanConditions';
import type { MonFilter } from '@/engine/monitor';
import type { Conviction } from '@/engine/ranking';

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
/** Frescor de tier por símbolo: tier atual, anterior e desde quando. */
export interface TierSeenEntry {
  tier: Conviction;
  prev: Conviction | null;
  since: number;
  price: number | null;
}
/** Operação pré-preenchida a partir de uma linha do ranking. */
export interface PendingOp {
  symbol: string;
  kind: 'crypto' | 'stock';
  tier: Conviction;
  score: number;
  rr: number | null;
  stretch: number | null;
  confFull: boolean;
}
/** Gates numéricos dos tiers + origem (padrão, walk-forward ou pessoal). */
export interface TierGatesState {
  eliteMinScore: number;
  forteMinScore: number;
  source: 'padrao' | 'walkforward' | 'pessoal';
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
  tierSeen: Record<string, TierSeenEntry>;
  lastVisitOpp: number;
  pendingOp: PendingOp | null;
  tierGates: TierGatesState;
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
  noteTiers: (entries: { symbol: string; tier: Conviction; price?: number | null }[]) => void;
  setLastVisitOpp: (ts: number) => void;
  setPendingOp: (p: PendingOp | null) => void;
  setTierGates: (g: TierGatesState) => void;
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
      tierSeen: {},
      lastVisitOpp: 0,
      pendingOp: null,
      tierGates: { eliteMinScore: 75, forteMinScore: 65, source: 'padrao' },
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
      noteTiers: (entries) => {
        if (!entries.length) return;
        const now = Date.now();
        const seen = { ...get().tierSeen };
        let changed = false;
        for (const e of entries) {
          const cur = seen[e.symbol];
          if (!cur) {
            seen[e.symbol] = { tier: e.tier, prev: null, since: now, price: e.price ?? null };
            changed = true;
          } else if (cur.tier !== e.tier) {
            seen[e.symbol] = { tier: e.tier, prev: cur.tier, since: now, price: e.price ?? cur.price };
            changed = true;
          }
        }
        if (changed) {
          // Teto anti-crescimento: mantém os 2000 mais recentes.
          const keys = Object.keys(seen);
          if (keys.length > 2000) {
            keys
              .sort((a, b) => seen[a].since - seen[b].since)
              .slice(0, keys.length - 2000)
              .forEach((k) => delete seen[k]);
          }
          set({ tierSeen: seen });
        }
      },
      setLastVisitOpp: (ts) => set({ lastVisitOpp: ts }),
      setPendingOp: (p) => set({ pendingOp: p }),
      setTierGates: (g) => set({ tierGates: g }),
      exportAll: () => JSON.stringify({ app: 'pulso-mercado', v: 7, exportedAt: new Date().toISOString(), settings: { name: get().name, currency: get().currency, refreshSec: get().refreshSec, theme: get().theme, segment: get().segment, portfolioMethod: get().portfolioMethod, brapiToken: get().brapiToken, muted: get().muted }, favorites: get().favorites, watchlist: get().watchlist, positions: get().positions, operations: get().operations, wallets: get().wallets, sectors: get().sectors, customAssets: get().customAssets, alerts: get().alerts, customScans: get().customScans, monFilters: get().monFilters, monDisabled: get().monDisabled, tierSeen: get().tierSeen, tierGates: get().tierGates }, null, 2),
      importAll: (json) => {
        const d = JSON.parse(json) as { settings?: Partial<SettingsState> & { portfolioMethod?: PortfolioMethod }; favorites?: string[]; watchlist?: string[]; positions?: PortfolioPosition[]; operations?: Operation[]; wallets?: Wallet[]; sectors?: Record<string, string>; customAssets?: StockEntry[]; alerts?: PriceAlert[]; customScans?: CustomScan[]; monFilters?: MonFilter[]; monDisabled?: string[]; tierSeen?: Record<string, TierSeenEntry>; tierGates?: TierGatesState };
        if (!d || typeof d !== 'object') throw new Error('Arquivo inválido');
        const migratedOps: Operation[] = d.operations ?? (d.positions ?? []).map((p) => ({ id: p.id, walletId: 'main', kind: p.kind, symbol: p.symbol, side: 'buy' as const, quantity: p.quantity, price: p.avgPrice, date: p.date, note: p.note }));
        set({ ...(d.settings ?? {}), portfolioMethod: d.settings?.portfolioMethod ?? get().portfolioMethod, favorites: d.favorites ?? get().favorites, watchlist: d.watchlist ?? get().watchlist, positions: [], operations: migratedOps.length ? migratedOps : get().operations, wallets: d.wallets ?? (get().wallets.length ? get().wallets : [{ id: 'main', name: 'Principal', createdAt: new Date().toISOString() }]), sectors: d.sectors ?? get().sectors, customAssets: d.customAssets ?? get().customAssets, alerts: d.alerts ?? get().alerts, customScans: d.customScans ?? get().customScans, monFilters: d.monFilters ?? get().monFilters, monDisabled: d.monDisabled ?? get().monDisabled, tierSeen: d.tierSeen ?? get().tierSeen, tierGates: d.tierGates ?? get().tierGates });
      },
      clearAll: () => set({ positions: [], operations: [], favorites: [], watchlist: [], sectors: {}, customAssets: [], alerts: [], customScans: [], monFilters: [], monDisabled: [], tierSeen: {}, pendingOp: null, wallets: [{ id: 'main', name: 'Principal', createdAt: new Date().toISOString() }] }),
    }),
    {
      name: 'cc.user',
      version: 6,
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        if (!Array.isArray(s.monFilters)) s.monFilters = [];
        if (!Array.isArray(s.monDisabled)) s.monDisabled = [];
        if (typeof s.tierSeen !== 'object' || s.tierSeen === null) s.tierSeen = {};
        if (typeof s.lastVisitOpp !== 'number') s.lastVisitOpp = 0;
        if (!('pendingOp' in s)) s.pendingOp = null;
        if (typeof s.tierGates !== 'object' || s.tierGates === null)
          s.tierGates = { eliteMinScore: 75, forteMinScore: 65, source: 'padrao' };
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
