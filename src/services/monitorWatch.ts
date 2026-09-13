/**
 * Vigia do Monitor: avalia os filtros ativos a cada 5min em qualquer página,
 * registra bordas inativo→ativo e dispara notificação desktop só nas novas.
 * Sem isso, eventos que acontecem com o Radar fechado passam batido.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { useUniverseCrypto } from '@/services/universeHooks';
import {
  buildMonData, diffEdgeEvents, evalFilterState, loadMonActive, loadMonEvents,
  planMonitorData, saveMonActive, saveMonEvents, selectTopByMcap, validateFilter, PRESET_FILTERS,
  MON_EVENTS_KEY,
  type MonData, type MonEdgeState,
} from '@/engine/monitor';
import { fetchMonCoinKlines } from '@/services/monitorData';

/** Canal do event bus Monitor→Radar (mesma aba). */
export const MON_EVENTS_CHANNEL = 'mon-events-updated';

/** Avisa o Radar aberto que há bordas novas (sem polling). */
export function emitMonEventsUpdated(): void {
  try {
    window.dispatchEvent(new CustomEvent(MON_EVENTS_CHANNEL));
  } catch {
    /* sem DOM */
  }
}

/**
 * Assina bordas novas: CustomEvent (mesma aba) + storage (outras abas).
 * Seguro em ambiente sem DOM (testes node): retorna no-op.
 */
export function subscribeMonEvents(cb: () => void): () => void {
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
    const onCustom = (): void => cb();
    const onStorage = (e: StorageEvent): void => {
      if (e.key === MON_EVENTS_KEY) cb();
    };
    window.addEventListener(MON_EVENTS_CHANNEL, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(MON_EVENTS_CHANNEL, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  } catch {
    return () => {};
  }
}

const WATCH_MS = 5 * 60 * 1000;
const FIRST_DELAY_MS = 45_000;

export function notifyMatch(filterName: string, icon: string, symbol: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(`${icon} ${filterName}`, { body: `${symbol} entrou no filtro`, tag: `mon-${filterName}-${symbol}` });
    setTimeout(() => n.close(), 15_000);
  } catch {
    /* sem permissão/ambiente */
  }
}

export function useMonitorWatch(): { lastRun: number | null } {
  const [lastRun, setLastRun] = useState<number | null>(null);
  const coins = useUniverseCrypto().coins;
  const monFilters = useStore((s) => s.monFilters);
  const monDisabled = useStore((s) => s.monDisabled);
  const radarTopN = useStore((s) => s.radarTopN);
  const running = useRef(false);
  const stateRef = useRef({ coins, monFilters, monDisabled, radarTopN });
  stateRef.current = { coins, monFilters, monDisabled, radarTopN };

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (running.current) return;
      const { coins: cs, monFilters: customs, monDisabled: dis, radarTopN: topN } = stateRef.current;
      if (!cs.length) return;
      // Filtros inválidos (combinação impossível) nunca avaliam — e nunca
      // somem em silêncio: a UI os marca como incompatíveis.
      const active = [...PRESET_FILTERS, ...customs].filter(
        (f) => !dis.includes(f.id) && validateFilter(f).length === 0,
      );
      if (!active.length) return;
      running.current = true;
      try {
        const plan = planMonitorData(active);
        // Mesmo universo do Radar: Top N por market cap (nunca Top 100 fixo).
        const top = selectTopByMcap(cs, topN, topN ?? 300);
        const states: { key: string; filterId: string; symbol: string; state: MonEdgeState }[] = [];
        const data: MonData[] = [];
        for (let i = 0; i < top.length; i += 8) {
          const batch = await Promise.all(
            top.slice(i, i + 8).map(async (c) => {
              const { kl, rangeKl } = await fetchMonCoinKlines(c, plan);
              return buildMonData(c, kl, rangeKl);
            }),
          );
          if (!alive) return;
          data.push(...batch);
        }
        if (!alive) return;
        const now = Date.now();
        for (const d of data) {
          for (const f of active) {
            states.push({
              key: `${f.id}:${d.symbol}`, filterId: f.id, symbol: d.symbol,
              state: evalFilterState(d, f),
            });
          }
        }
        // Boot silencioso: o conjunto ativo persistido vira o "anterior" —
        // ativo antes do reload NÃO dispara de novo.
        const { active: next, events, changed } = diffEdgeEvents(loadMonActive(), states, now);
        if (changed) {
          saveMonActive(next);
          saveMonEvents([...events, ...loadMonEvents()]);
          // Empurra para o Radar aberto: sem polling, sem refresh manual.
          emitMonEventsUpdated();
        }
        if (!alive) return;
        const byId = new Map(active.map((f) => [f.id, f]));
        for (const m of events.slice(0, 5)) {
          const f = byId.get(m.filterId);
          if (f) notifyMatch(f.name, f.icon, m.symbol);
        }
        setLastRun(now);
      } finally {
        running.current = false;
      }
    };
    const t0 = setTimeout(run, FIRST_DELAY_MS);
    const iv = setInterval(run, WATCH_MS);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lastRun };
}
