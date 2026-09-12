import { yahooChart } from '@/services/lookup';
import { idbGet, idbSet } from '@/lib/idb';
import { horizonCacheKey } from '@/services/horizon';
import { assembleSetups } from '@/setups/application/usecases';
import { qualityOf, type Setup } from '@/setups/domain/entities';
import type { HorizonFacts } from '@/engine/horizon/types';
import type { BriefIndex, MorningBriefInput } from '@/services/aiAnalysis';

/**
 * morningBrief — dados do Morning Market Brief (abertura US, 10:30 BRT).
 * Yahoo como única fonte US (mesmo endpoint estável do app); tudo null-safe:
 * sem dado → 'N/A' honesto no template, nunca número inventado.
 */

export const US_SYMBOLS = {
  spx: { symbol: '^GSPC', label: 'S&P 500' },
  ndx: { symbol: '^IXIC', label: 'Nasdaq 100' },
  dji: { symbol: '^DJI', label: 'Dow Jones' },
  vix: { symbol: '^VIX', label: 'VIX' },
  dxy: { symbol: 'DX-Y.NYB', label: 'DXY' },
} as const;

export const SECTOR_ETFS: { symbol: string; label: string }[] = [
  { symbol: 'XLK', label: 'Tech (XLK)' },
  { symbol: 'XLC', label: 'Comunicação (XLC)' },
  { symbol: 'XLF', label: 'Financeiro (XLF)' },
  { symbol: 'XLE', label: 'Energia (XLE)' },
  { symbol: 'XLV', label: 'Saúde (XLV)' },
  { symbol: 'XLI', label: 'Industrial (XLI)' },
  { symbol: 'XLP', label: 'Consumo base (XLP)' },
  { symbol: 'XLY', label: 'Consumo disc. (XLY)' },
  { symbol: 'XLB', label: 'Materiais (XLB)' },
  { symbol: 'XLRE', label: 'Imobiliário (XLRE)' },
  { symbol: 'XLU', label: 'Utilidades (XLU)' },
];

/** YYYY-MM-DD em um fuso (chave dia p/ frescor de sessão). */
export function dayKeyInTz(ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  } catch {
    return '';
  }
}

/** Data de hoje em BRT (dd/mm/yyyy) para o cabeçalho do brief. */
export function todayBrt(ts = Date.now()): string {
  try {
    const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
    return p;
  } catch {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
}

/** Janela de destaque do brief: 10:00–11:00 BRT (abertura US às 10:30). */
export function inBriefWindow(ts = Date.now()): boolean {
  try {
    const h = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
    return h >= '10:00' && h < '11:00';
  } catch {
    return false;
  }
}

const SEEN_KEY = (day: string) => `cc.brief:seen:${day}`;

export async function briefSeenToday(briefDay: string): Promise<boolean> {
  try {
    const r = await idbGet<string>(SEEN_KEY(briefDay));
    return !!r && !r.stale;
  } catch {
    return false;
  }
}

export async function markBriefSeen(briefDay: string): Promise<void> {
  try {
    await idbSet(SEEN_KEY(briefDay), briefDay, 24 * 3600_000);
  } catch {
    /* best-effort */
  }
}

/** Índice US com gap de abertura; gap=null quando a sessão não é de hoje (ET). */
export async function fetchUsIndex(symbol: string, label: string): Promise<BriefIndex & { fresh: boolean }> {
  const empty = { label, price: null, chg: null, gap: null, fresh: false };
  try {
    const q = await yahooChart(symbol, '1d', '5m');
    const gap = q.openToday != null && q.prevClose ? ((q.openToday / q.prevClose - 1) * 100) : null;
    const todayNy = dayKeyInTz(Date.now(), 'America/New_York');
    const lastNy = q.lastTime ? dayKeyInTz(q.lastTime, 'America/New_York') : '';
    const fresh = !!todayNy && todayNy === lastNy;
    return { label, price: q.price, chg: q.changePct, gap: fresh ? gap : null, fresh };
  } catch {
    return empty;
  }
}

export interface UsQuotes {
  spx: BriefIndex;
  ndx: BriefIndex;
  dji: BriefIndex;
  vixLevel: number | null;
  vixChg: number | null;
  dxyDir: 'alta' | 'queda' | 'lateral' | null;
  dxyChg: number | null;
  sectorsTop: { label: string; chg: number }[];
  sectorsBottom: { label: string; chg: number }[];
}

async function sectorChg(s: { symbol: string; label: string }): Promise<{ label: string; chg: number } | null> {
  try {
    const q = await yahooChart(s.symbol, '5d', '1d');
    return q.changePct == null ? null : { label: s.label, chg: q.changePct };
  } catch {
    return null;
  }
}

/** Índices + VIX + DXY + setores (lotes de 3 p/ não agredir o rate-limit). */
export async function fetchUsQuotes(): Promise<UsQuotes> {
  const [spx, ndx, dji, vix, dxy] = await Promise.all([
    fetchUsIndex(US_SYMBOLS.spx.symbol, US_SYMBOLS.spx.label),
    fetchUsIndex(US_SYMBOLS.ndx.symbol, US_SYMBOLS.ndx.label),
    fetchUsIndex(US_SYMBOLS.dji.symbol, US_SYMBOLS.dji.label),
    fetchUsIndex(US_SYMBOLS.vix.symbol, US_SYMBOLS.vix.label),
    fetchUsIndex(US_SYMBOLS.dxy.symbol, US_SYMBOLS.dxy.label),
  ]);
  const sectors: { label: string; chg: number }[] = [];
  for (let k = 0; k < SECTOR_ETFS.length; k += 3) {
    const batch = await Promise.all(SECTOR_ETFS.slice(k, k + 3).map(sectorChg));
    for (const b of batch) if (b) sectors.push(b);
  }
  sectors.sort((a, b) => b.chg - a.chg);
  const dxyChg = dxy.chg;
  return {
    spx, ndx, dji,
    vixLevel: vix.price,
    vixChg: vix.chg,
    dxyDir: dxyChg == null ? null : Math.abs(dxyChg) < 0.05 ? 'lateral' : dxyChg > 0 ? 'alta' : 'queda',
    dxyChg,
    sectorsTop: sectors.slice(0, 3),
    sectorsBottom: sectors.slice(-3).reverse(),
  };
}

/**
 * Correlação 48h BTC vs S&P (heurística documentada): sinais opostos, ou um
 * lateral (|x|<0.3%) enquanto o outro anda (|y|≥1%), → 'desacoplado' (fluxo
 * próprio); resto → 'segue' (beta de risco).
 */
export function btcCorrMode(spx48: number | null, btc48: number | null): 'segue' | 'desacoplado' | null {
  if (spx48 == null || btc48 == null || !Number.isFinite(spx48) || !Number.isFinite(btc48)) return null;
  if (Math.abs(spx48) < 0.05 && Math.abs(btc48) < 0.05) return 'segue';
  if (spx48 * btc48 < 0) return 'desacoplado';
  if ((Math.abs(spx48) < 0.3 && Math.abs(btc48) >= 1) || (Math.abs(btc48) < 0.3 && Math.abs(spx48) >= 1)) return 'desacoplado';
  return 'segue';
}

/** Variação % entre o último close e o de ~2 sessões atrás (48h). */
export function pct48h(closes: number[]): number | null {
  const c = closes.filter((v) => v > 0);
  if (c.length < 3) return null;
  const last = c[c.length - 1];
  const ref = c[c.length - 3];
  return ref > 0 ? ((last / ref - 1) * 100) : null;
}

export interface DivergenceInput {
  spxChg: number | null;
  vixChg: number | null;
  regime: string;
  breadth: number | null;
}

/** Divergências perigosas (determinísticas; a IA só verbaliza). */
export function computeDivergences(d: DivergenceInput): string[] {
  const flags: string[] = [];
  if (d.spxChg != null && d.vixChg != null && d.spxChg > 0 && d.vixChg > 0) {
    flags.push('VIX em alta junto com o S&P: proteção sendo precificada — reduza tamanho.');
  }
  if (d.regime.includes('RISK-ON') && d.breadth != null && d.breadth > 80) {
    flags.push('Amplitude acima de 80 com regime risk-on: euforia — se passar de 85, reduza tamanho.');
  }
  if (d.regime.includes('RISK-OFF') && d.spxChg != null && d.spxChg > 1) {
    flags.push('Abertura positiva contra regime risk-off: repique candidato a fade — exija confirmação.');
  }
  return flags;
}

/** Filtra/ordena oportunidades Elite 80+ (puro; IO fica no readElites). */
export function pickElites(opps: Setup[], limit = 3): { symbol: string; score: number; rr: number | null }[] {
  return opps
    .filter((o) => qualityOf(o.score) === 'elite')
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((o) => ({ symbol: o.symbol, score: o.score, rr: o.rr1 ?? null }));
}

/**
 * Elites 1–3m a partir do cache stage-2 (IDB, 60min) — zero rede.
 * Sem cache fresco: lista vazia honesta (card linka /setups).
 */
export async function readElites(
  symbols: string[],
  regimeLabel: string,
  btcChange7d: number | null,
  limit = 3,
): Promise<{ symbol: string; score: number; rr: number | null }[]> {
  const facts: HorizonFacts[] = [];
  for (const s of symbols.slice(0, 40)) {
    try {
      const r = await idbGet<HorizonFacts>(horizonCacheKey(s));
      if (r && !r.stale) facts.push(r.data);
    } catch {
      /* ignora símbolo sem cache */
    }
  }
  if (!facts.length) return [];
  try {
    const opps = assembleSetups(facts, { horizon: '3m', regimeLabel, btcChange7d });
    return pickElites(opps, limit);
  } catch {
    return [];
  }
}

/** Monta o input canônico do brief a partir das peças (puro, testável). */
export function composeBriefInput(parts: {
  dateBrt: string;
  quotes: UsQuotes;
  btc: { price: number | null; chg24: number | null };
  eth: { price: number | null; chg24: number | null };
  spx48: number | null;
  btc48: number | null;
  regime: string;
  breadth: number | null;
  news: { title: string; source: string }[];
  elites: { symbol: string; score: number; rr: number | null }[];
}): MorningBriefInput {
  const { quotes: q } = parts;
  return {
    dateBrt: parts.dateBrt,
    spx: q.spx, ndx: q.ndx, dji: q.dji,
    vix: { level: q.vixLevel, chg: q.vixChg },
    dxy: { dir: q.dxyDir, chg: q.dxyChg },
    btc: parts.btc, eth: parts.eth,
    btcCorr48: { spx48: parts.spx48, btc48: parts.btc48, mode: btcCorrMode(parts.spx48, parts.btc48) },
    regime: parts.regime, breadth: parts.breadth,
    sectorsTop: q.sectorsTop, sectorsBottom: q.sectorsBottom,
    news: parts.news,
    elites: parts.elites,
    flags: computeDivergences({ spxChg: q.spx.chg, vixChg: q.vixChg, regime: parts.regime, breadth: parts.breadth }),
  };
}
