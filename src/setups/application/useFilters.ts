import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  activeFilterCount, applyPreset, decodeFilters, DEFAULT_FILTERS, encodeFilters,
  type FilterState, type PresetKey,
} from '../domain/filters';

/**
 * application/useFilters — reducer único sincronizado à URL.
 * Escrita na URL com debounce; leitura da URL (voltar/avançar) hidrata.
 * A busca filtra ao vivo com debounce curto; o input continua instantâneo.
 */

export type FilterAction =
  | { type: 'set'; patch: Partial<FilterState> }
  | { type: 'preset'; key: PresetKey }
  | { type: 'clear' }
  | { type: 'hydrate'; state: FilterState };

function reducer(s: FilterState, a: FilterAction): FilterState {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch };
    case 'preset':
      return applyPreset(s, a.key);
    case 'clear':
      return { ...DEFAULT_FILTERS, horizon: s.horizon };
    case 'hydrate':
      return a.state;
  }
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface FiltersApi {
  state: FilterState;
  /** Busca com debounce para filtrar a lista ao vivo. */
  liveQuery: string;
  activeCount: number;
  set: (patch: Partial<FilterState>) => void;
  preset: (key: PresetKey) => void;
  clear: () => void;
}

export function useFilters(): FiltersApi {
  const [params, setParams] = useSearchParams();
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => decodeFilters(params.toString()),
  );
  const writing = useRef(false);

  // Estado → URL (debounce; replace para não poluir o histórico).
  const encoded = encodeFilters(state);
  useEffect(() => {
    const t = setTimeout(() => {
      writing.current = true;
      setParams(encoded ? `?${encoded}` : '', { replace: true });
      setTimeout(() => {
        writing.current = false;
      }, 50);
    }, 350);
    return () => clearTimeout(t);
  }, [encoded, setParams]);

  // URL → estado (voltar/avançar do navegador).
  useEffect(() => {
    if (writing.current) return;
    const fromUrl = decodeFilters(params.toString());
    if (encodeFilters(fromUrl) !== encodeFilters(state)) {
      dispatch({ type: 'hydrate', state: fromUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const liveQuery = useDebouncedValue(state.query, 200);
  const activeCount = useMemo(() => activeFilterCount(state), [state]);

  return useMemo(
    () => ({
      state,
      liveQuery,
      activeCount,
      set: (patch: Partial<FilterState>) => dispatch({ type: 'set', patch }),
      preset: (key: PresetKey) => dispatch({ type: 'preset', key }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [state, liveQuery, activeCount],
  );
}
