import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { useCryptoMarket } from '@/services/market';
import { useAnalysis } from '@/lib/useAnalysis';
import { useUniverseCrypto } from '@/services/universeHooks';
import { scanner, type ScanSnapshot } from '@/services/scanner';
import { isActiveCoin, type UniverseCoin } from '@/services/universeTypes';
import type { ConfluenceData } from '@/types';
import type { WFReport } from '@/services/walkforward';
import type { HorizonCandidate } from '@/services/horizon';
import type { HorizonFacts } from '@/engine/horizon/types';
import type { HorizonKey } from '@/engine/horizon/horizons';
import type { Setup } from '../domain/entities';
import { analysisAdapter, evidenceAdapter } from '../infrastructure/adapters';
import { assembleSetups, fetchSetupsFacts, type FetchPhase } from './usecases';

export type MarketApi = ReturnType<typeof useCryptoMarket>;
export type AnalysisApi = ReturnType<typeof useAnalysis>;

/**
 * application/useSetups — pipeline de dados do dashboard.
 * Compõe os hooks compartilhados (market, análise, universo, scanner) e
 * orquestra o use-case FetchSetups em duas velocidades: instantâneo
 * (top-25, segundos) e depois o universo em fundo. Devolve dados prontos;
 * decisão e filtro ficam no domain.
 */
export interface SetupsPipeline {
  opps: Setup[];
  market: MarketApi;
  analysis: AnalysisApi;
  logos: Map<string, string>;
  wf: WFReport | null;
  loading: boolean;
  analyzed: number;
  pct: number;
  statusLine: string | null;
  error: string | null;
  retry: () => void;
}

export function useSetups(horizon: HorizonKey): SetupsPipeline {
  const refreshSec = useStore((s) => s.refreshSec);
  const tierGates = useStore((s) => s.tierGates);
  const market = useCryptoMarket(refreshSec);
  const analysis = useAnalysis(market.data, market.candles);
  const u = useUniverseCrypto();
  const [scan, setScan] = useState<ScanSnapshot | null>(null);
  const [wf, setWf] = useState<WFReport | null>(null);

  const [facts, setFacts] = useState<HorizonFacts[]>([]);
  const [instantCount, setInstantCount] = useState(0);
  const [universeCount, setUniverseCount] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [phase, setPhase] = useState<FetchPhase | null>(null);
  const [instantDone, setInstantDone] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);

  // Scanner global aquece score + confluência para o app todo.
  useEffect(() => {
    const l = (s: ScanSnapshot) => setScan(s);
    scanner.listeners.add(l);
    void scanner.boot().then(() => setScan(scanner.snap()));
    return () => {
      scanner.listeners.delete(l);
    };
  }, []);
  const base: UniverseCoin[] = useMemo(
    () => u.coins.filter(isActiveCoin).sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0)),
    [u.coins],
  );
  useEffect(() => {
    if (base.length >= 50) void scanner.start(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.length > 0]);

  useEffect(() => {
    void evidenceAdapter.load().then(setWf).catch(() => undefined);
  }, []);

  const scoreMap = useMemo(() => {
    const mp = new Map<string, number>();
    for (const o of analysis.scores) mp.set(o.symbol, o.score);
    for (const o of scan?.results ?? []) if (!mp.has(o.symbol)) mp.set(o.symbol, o.score);
    return mp;
  }, [analysis.scores, scan]);

  // Instantâneo: top-25 do market (candles já em memória) — lista em segundos.
  const instantCands = useMemo((): HorizonCandidate[] => {
    return market.data
      .filter((d) => (market.candles[d.symbol]?.length ?? 0) >= 60)
      .slice(0, 25)
      .map((d) => ({
        symbol: d.symbol, name: d.name,
        change7d: d.change7d ?? null, marketCap: d.marketCap ?? null, volume24h: d.volume24h ?? null,
      }));
  }, [market.data, market.candles]);
  const instantSet = useMemo(() => new Set(instantCands.map((c) => c.symbol)), [instantCands]);
  // Universo: pontuados no 1d (score ≥ 55), fora do instantâneo — preenche em fundo.
  const candidates = useMemo((): HorizonCandidate[] => {
    return u.coins
      .filter(isActiveCoin)
      .map((c) => ({ c, s: scoreMap.get(c.symbol) ?? -1 }))
      .filter((x) => x.s >= 55 && !instantSet.has(x.c.symbol))
      .sort((x, y) => y.s - x.s)
      .slice(0, 250)
      .map(({ c }) => ({
        symbol: c.symbol, name: c.name,
        change7d: c.change7d ?? null, marketCap: c.marketCap ?? null, volume24h: c.volume24h ?? null,
      }));
  }, [u.coins, scoreMap, instantSet]);

  const instantKey = useMemo(() => instantCands.map((c) => c.symbol).join(','), [instantCands]);
  const universeKey = useMemo(() => candidates.map((c) => c.symbol).join(','), [candidates]);

  // Fase 1: instantâneo.
  useEffect(() => {
    const ctl = new AbortController();
    let alive = true;
    setPhase('instant');
    setFetchError(null);
    setInstantDone(false);
    void fetchSetupsFacts(
      analysisAdapter,
      instantCands,
      [],
      {
        onPhase: () => {},
        onProgress: (done, total) => { if (alive) setProg({ done, total }); },
      },
      ctl.signal,
    )
      .then((b) => {
        if (!alive || ctl.signal.aborted) return;
        setFacts(b.facts);
        setInstantCount(b.instantCount);
        setSkipped(b.skippedShort + b.skippedFailed);
        if (b.firstError) setFetchError(b.firstError);
      })
      .catch((e: unknown) => {
        if (alive && !ctl.signal.aborted) setFetchError(e instanceof Error ? e.message : 'Falha na análise');
      })
      .finally(() => {
        if (!alive) return;
        setInstantDone(true);
        setProg(null);
        if (!candidates.length) setPhase(null);
      });
    return () => {
      alive = false;
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instantKey, runId]);

  // Fase 2: universo (soma ao instantâneo; instantâneo vence por símbolo).
  useEffect(() => {
    if (!instantDone || !candidates.length) {
      if (instantDone && !candidates.length) setPhase(null);
      return;
    }
    const ctl = new AbortController();
    let alive = true;
    setPhase('universe');
    void fetchSetupsFacts(
      analysisAdapter,
      [],
      candidates,
      {
        onPhase: () => {},
        onProgress: (done, total) => { if (alive) setProg({ done, total }); },
      },
      ctl.signal,
    )
      .then((b) => {
        if (!alive || ctl.signal.aborted) return;
        setFacts((prev) => {
          const seen = new Set(prev.map((f) => f.symbol));
          return [...prev, ...b.facts.filter((f) => !seen.has(f.symbol))];
        });
        setUniverseCount(b.universeCount);
        setSkipped((s) => s + b.skippedShort + b.skippedFailed);
        if (b.firstError) setFetchError((prev) => prev ?? b.firstError);
      })
      .catch((e: unknown) => {
        if (alive && !ctl.signal.aborted) {
          setFetchError((prev) => prev ?? (e instanceof Error ? e.message : 'Falha na análise'));
        }
      })
      .finally(() => {
        if (!alive) return;
        setProg(null);
        setPhase(null);
      });
    return () => {
      alive = false;
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instantDone, universeKey, runId]);

  const confMap = useMemo(() => {
    const mp = new Map<string, ConfluenceData>();
    for (const o of scan?.results ?? []) if (o.confluence) mp.set(o.symbol, o.confluence);
    return mp;
  }, [scan]);

  const gatesParam = useMemo(
    () => ({ eliteMinScore: tierGates.eliteMinScore, forteMinScore: tierGates.forteMinScore }),
    [tierGates],
  );

  const opps = useMemo(
    () =>
      assembleSetups(facts, {
        horizon,
        regimeLabel: analysis.regime.label,
        btcChange7d: analysis.btcChange,
        gates: gatesParam,
        wf: wf?.stats ?? null,
        confluenceOf: (s) => confMap.get(s) ?? null,
      }),
    [facts, horizon, analysis.regime.label, analysis.btcChange, gatesParam, wf, confMap],
  );

  const logos = useMemo(() => {
    const mp = new Map<string, string>();
    for (const c of u.coins) if (c.image) mp.set(c.symbol, c.image);
    return mp;
  }, [u.coins]);

  const loading = phase != null;
  const pct = prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const analyzed = instantCount + universeCount;
  const statusLine =
    loading && prog
      ? `${phase === 'universe' ? 'Ampliando universo' : 'Leitura instantânea'}: ${prog.done}/${prog.total} (${pct}%)`
      : !loading && analyzed > 0
        ? `${analyzed} analisados${skipped > 0 ? ` · ${skipped} sem dados` : ''}${fetchError ? ` · ${fetchError}` : ''}`
        : (fetchError ?? null);

  return {
    opps, market, analysis, logos, wf,
    loading, analyzed, pct, statusLine,
    error: fetchError,
    retry: () => {
      market.reload();
      setRunId((x) => x + 1);
    },
  };
}
