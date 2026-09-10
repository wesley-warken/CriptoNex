import { fetchWithTimeout } from '@/services/cache';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';
import { parseNasdaqTsv, type NasdaqRow } from '@/services/universeTypes';

export const US_TTL_MS = 24 * 60 * 60 * 1000;

function base(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') return '/nasdaq';
  return 'https://www.nasdaqtrader.com';
}

async function fetchTsv(path: string): Promise<string> {
  const r = await fetchWithTimeout(`${base()}${path}`, 30000);
  if (!r.ok) throw new Error(`Nasdaq ${r.status}`);
  return r.text();
}

type ParseFn = (text: string, exch: string) => NasdaqRow[] | Promise<NasdaqRow[]>;

async function parseInWorker(text: string, fallbackExchange: string): Promise<NasdaqRow[]> {
  try {
    const mod = await import('@/workers/parseStocks?worker');
    const WorkerCtor = mod.default as new () => Worker;
    const worker = new WorkerCtor();
    const result = await new Promise<NasdaqRow[]>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('worker timeout')), 20000);
      worker.onmessage = (ev: MessageEvent) => {
        clearTimeout(t);
        worker.terminate();
        resolve(ev.data as NasdaqRow[]);
      };
      worker.onerror = (e) => {
        clearTimeout(t);
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ text, fallbackExchange });
    });
    return result;
  } catch {
    return parseNasdaqTsv(text, fallbackExchange);
  }
}

export async function fetchUsUniverse(parse: ParseFn = parseInWorker): Promise<NasdaqRow[]> {
  const [listed, other] = await Promise.all([
    fetchTsv('/dynamic/SymDir/nasdaqlisted.txt'),
    fetchTsv('/dynamic/SymDir/otherlisted.txt'),
  ]);
  const [a, b] = await Promise.all([
    parse(listed, 'NASDAQ'),
    parse(other, 'NYSE'),
  ]);
  const seen = new Set<string>();
  const out: NasdaqRow[] = [];
  for (const r of [...a, ...b]) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push(r);
  }
  await idbSet(IDB_KEYS.usStocks, out, US_TTL_MS);
  return out;
}

export async function loadCachedUsUniverse(): Promise<{ data: NasdaqRow[]; ts: number; stale: boolean } | null> {
  return idbGet<NasdaqRow[]>(IDB_KEYS.usStocks);
}
