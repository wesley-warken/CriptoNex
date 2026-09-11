/**
 * Vigia do Monitor: avalia os filtros ativos a cada 5min em qualquer página,
 * carimba estreias (firstSeen) e dispara notificação desktop nas novas.
 * Sem isso, eventos que acontecem com o Radar fechado passam batido.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { useUniverseCrypto } from '@/services/universeHooks';
import {
  buildMonData, evalMonitor, loadFirstSeen, planMonitorData, saveFirstSeen, PRESET_FILTERS,
  type MonData, type MonMatch,
} from '@/engine/monitor';
import { ensureMaKlines } from '@/services/maTable';
import { closesToCandles } from '@/services/indicatorTable';
import { getIntervalKlines, sampleEvery } from '@/services/rsiTable';

const WATCH_MS = 5 * 60 * 1000;
const WATCH_TOP = 100;
const FIRST_DELAY_MS = 45_000;

/** Separa estreias de repetidos e mescla firstSeen. Puro e testável. */
export function diffNewMatches(
  prev: Record<string, number>, matches: MonMatch[], now: number,
): { merged: Record<string, number>; news: MonMatch[]; changed: boolean } {
  const merged = { ...prev };
  const news: MonMatch[] = [];
  let changed = false;
  for (const m of matches) {
    const k = `${m.filterId}:${m.symbol}`;
    if (merged[k] == null) {
      merged[k] = now;
      news.push(m);
      changed = true;
    }
  }
  return { merged, news, changed };
}

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
  const running = useRef(false);
  const stateRef = useRef({ coins, monFilters, monDisabled });
  stateRef.current = { coins, monFilters, monDisabled };

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (running.current) return;
      const { coins: cs, monFilters: customs, monDisabled: dis } = stateRef.current;
      if (!cs.length) return;
      const active = [...PRESET_FILTERS, ...customs].filter((f) => !dis.includes(f.id));
      if (!active.length) return;
      running.current = true;
      try {
        const plan = planMonitorData(active);
        const top = [...cs]
          .filter((c) => (c.marketCap ?? 0) > 0)
          .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
          .slice(0, WATCH_TOP);
        const data: MonData[] = [];
        for (let i = 0; i < top.length; i += 8) {
          const batch = await Promise.all(
            top.slice(i, i + 8).map(async (c) => {
              const hourly = (c.spark7d ?? []).filter((v) => v > 0);
              const h1 = closesToCandles(hourly.slice(-120)) ?? null;
              const h4 = closesToCandles(sampleEvery(hourly, 4)) ?? null;
              const [d1, w1] = await Promise.all([
                plan.daily === 'none' ? null : plan.daily === 'ma'
                  ? ensureMaKlines([{ symbol: c.symbol, id: c.id }], '1d').then((m) => m.get(c.symbol) ?? null)
                  : getIntervalKlines(c.symbol, c.id, '1d', 60, 120),
                plan.weekly ? getIntervalKlines(c.symbol, c.id, '1w', 30, 60) : null,
              ]);
              return buildMonData(c, { '1h': h1, '4h': h4, '1d': d1, '1w': w1 });
            }),
          );
          if (!alive) return;
          data.push(...batch);
        }
        if (!alive) return;
        const now = Date.now();
        const matches = evalMonitor(data, active);
        const { merged, news, changed } = diffNewMatches(loadFirstSeen(), matches, now);
        if (changed) saveFirstSeen(merged);
        if (!alive) return;
        const byId = new Map(active.map((f) => [f.id, f]));
        for (const m of news.slice(0, 5)) {
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
