/**
 * Cunhas verificadas (pipeline binário, sem "meia cunha").
 *
 * REGRA DE OURO: só avalia vela FECHADA. O chamador deve passar a série sem
 * o candle em formação (ex.: `candles.slice(0, -1)`); o radar nunca avalia
 * desenho em formação, senão "verifica" cunha que desaparece 3 velas depois.
 *
 * Portas (todas ou nenhuma — 7/7 = selo CUNHA VERIFICADA):
 *  1. 3+ topos e 3+ fundos (fractal sobre fechamentos, ordem 3)
 *  2. sequência monotônica no sentido do tipo
 *  3. inclinação das duas linhas no sentido do tipo
 *  4. convergência (desc: cima mais íngreme p/ baixo; asc: baixo mais íngreme p/ cima)
 *  5. ápice projetado à frente, dentro do teto (reprova canal paralelo)
 *  6. mínimo de toques por linha (tolerância 1%)
 *  7. vida mínima + linha de cima acima da de baixo em todo o trecho
 *
 * Estados: FORMANDO → CONFIRMADA (fechamento além da linha de rompimento) →
 * INVALIDADA (fechamento no lado oposto). Selo é revogável.
 * Quality (0–100) serve SÓ para ranquear qual olhar primeiro — nunca para
 * dizer "mais ou menos cunha".
 */

export type WedgeKind = 'desc' | 'asc';
export type WedgeState = 'forming' | 'confirmed' | 'invalidated';

export interface WedgeGate {
  id: string;
  label: string;
  pass: boolean;
}

export interface WedgeLine {
  m: number;
  b: number;
}

export interface WedgeResult {
  kind: WedgeKind;
  verified: boolean;
  gates: WedgeGate[];
  state: WedgeState;
  quality: number;
  apexBars: number | null;
  touchesHigh: number;
  touchesLow: number;
  lifeBars: number;
  lineHigh: WedgeLine;
  lineLow: WedgeLine;
  lastIndex: number;
}

export const WEDGE_MIN_TOUCHES = 2;
export const WEDGE_MIN_LIFE = 15;
export const WEDGE_APEX_CAP = 30;
export const WEDGE_TOL_PCT = 1;
export const WEDGE_MIN_CLOSES = 40;

interface Swing {
  index: number;
  price: number;
}

function fractalSwings(closes: number[], order = 3): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = order; i < closes.length - order; i++) {
    const w = closes.slice(i - order, i + order + 1);
    const v = closes[i];
    if (v === Math.max(...w)) highs.push({ index: i, price: v });
    if (v === Math.min(...w)) lows.push({ index: i, price: v });
  }
  return { highs, lows };
}

function linreg(pts: Swing[]): WedgeLine {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.index, 0) / n;
  const my = pts.reduce((s, p) => s + p.price, 0) / n;
  const den = pts.reduce((s, p) => s + (p.index - mx) ** 2, 0);
  const m = den ? pts.reduce((s, p) => s + (p.index - mx) * (p.price - my), 0) / den : 0;
  return { m, b: my - m * mx };
}

const at = (l: WedgeLine, x: number): number => l.m * x + l.b;
const distPct = (price: number, line: number): number =>
  line !== 0 ? (Math.abs(price - line) / Math.abs(line)) * 100 : Infinity;

function monotonic(seq: Swing[], dir: 1 | -1): boolean {
  for (let i = 1; i < seq.length; i++) {
    if (dir === -1 ? seq[i].price >= seq[i - 1].price : seq[i].price <= seq[i - 1].price) return false;
  }
  return true;
}

function rangeOf(a: number[]): number {
  if (!a.length) return 0;
  return Math.max(...a) - Math.min(...a);
}

/**
 * Verifica UMA cunha do tipo pedido sobre fechamentos (já sem a vela em
 * formação). Sempre retorna o relatório completo das 7 portas.
 */
export function verifyWedge(closes: number[], volumes?: (number | null)[], kind: WedgeKind = 'desc'): WedgeResult {
  const fail = (gates: WedgeGate[], extra?: Partial<WedgeResult>): WedgeResult => ({
    kind,
    verified: false,
    gates,
    state: 'forming',
    quality: 0,
    apexBars: null,
    touchesHigh: 0,
    touchesLow: 0,
    lifeBars: 0,
    lineHigh: { m: 0, b: 0 },
    lineLow: { m: 0, b: 0 },
    lastIndex: closes.length - 1,
    ...extra,
  });
  const G = (id: string, label: string, pass: boolean): WedgeGate => ({ id, label, pass });
  const gates: WedgeGate[] = [];
  const dir: 1 | -1 = kind === 'desc' ? -1 : 1;

  if (closes.length < WEDGE_MIN_CLOSES) {
    return fail([G('data', `mínimo ${WEDGE_MIN_CLOSES} fechamentos`, false)]);
  }
  const { highs, lows } = fractalSwings(closes, 3);
  const H = highs.slice(-4);
  const L = lows.slice(-4);
  gates.push(G('swings', '3+ topos e 3+ fundos', H.length >= 3 && L.length >= 3));
  if (!gates[0].pass) return fail(gates);

  gates.push(G('sequence', kind === 'desc' ? 'topos e fundos descendentes' : 'topos e fundos ascendentes', monotonic(H, dir) && monotonic(L, dir)));

  const lineHigh = linreg(H);
  const lineLow = linreg(L);
  const slopeOk =
    kind === 'desc' ? lineHigh.m < 0 && lineLow.m < 0 : lineHigh.m > 0 && lineLow.m > 0;
  gates.push(G('slope', kind === 'desc' ? 'ambas as linhas negativas' : 'ambas as linhas positivas', slopeOk));

  const converges =
    kind === 'desc' ? lineHigh.m < lineLow.m : lineLow.m > lineHigh.m;
  gates.push(G('convergence', kind === 'desc' ? 'cima mais íngreme p/ baixo' : 'baixo mais íngreme p/ cima', converges));

  // Ápice: interseção à frente do último fechamento, dentro do teto.
  // É o que reprova canal paralelo (ápice no infinito).
  const lastIdx = closes.length - 1;
  const den = lineHigh.m - lineLow.m;
  const apexX = den !== 0 ? (lineLow.b - lineHigh.b) / den : NaN;
  const apexBars = Number.isFinite(apexX) ? apexX - lastIdx : NaN;
  const apexOk = Number.isFinite(apexBars) && apexBars > 0 && apexBars <= WEDGE_APEX_CAP;
  gates.push(G('apex', `ápice projetado à frente (≤${WEDGE_APEX_CAP} velas)`, apexOk));

  let touchesHigh = 0;
  let touchesLow = 0;
  for (const s of H) if (distPct(s.price, at(lineHigh, s.index)) <= WEDGE_TOL_PCT) touchesHigh++;
  for (const s of L) if (distPct(s.price, at(lineLow, s.index)) <= WEDGE_TOL_PCT) touchesLow++;
  gates.push(G('touches', `mínimo ${WEDGE_MIN_TOUCHES} toques por linha (±${WEDGE_TOL_PCT}%)`, touchesHigh >= WEDGE_MIN_TOUCHES && touchesLow >= WEDGE_MIN_TOUCHES));

  const firstIdx = Math.min(H[0].index, L[0].index);
  const lifeBars = lastIdx - firstIdx;
  let noCross = true;
  for (let x = firstIdx; x <= lastIdx; x++) {
    if (!(at(lineHigh, x) > at(lineLow, x))) { noCross = false; break; }
  }
  gates.push(G('life', `vida ≥${WEDGE_MIN_LIFE} velas + sem cruzamento no trecho`, lifeBars >= WEDGE_MIN_LIFE && noCross));

  const verified = gates.every((g) => g.pass);
  if (!verified) {
    return fail(gates, {
      apexBars: Number.isFinite(apexBars) ? apexBars : null,
      touchesHigh, touchesLow, lifeBars, lineHigh, lineLow,
    });
  }

  // Estado de vida no último FECHAMENTO.
  const last = closes[lastIdx];
  const up = at(lineHigh, lastIdx);
  const lo = at(lineLow, lastIdx);
  const state: WedgeState =
    kind === 'desc'
      ? last > up ? 'confirmed' : last < lo ? 'invalidated' : 'forming'
      : last < lo ? 'confirmed' : last > up ? 'invalidated' : 'forming';

  // Qualidade (ranking apenas): toques 35 + contração 25 + volume 20 + maturidade 20.
  const win = closes.slice(firstIdx);
  const recent = win.slice(-15);
  const older = win.slice(0, Math.max(1, win.length - 15));
  const contraction = older.length && rangeOf(older) > 0
    ? Math.min(1, Math.max(0, 1 - rangeOf(recent) / rangeOf(older)))
    : 0;
  const vols = (volumes ?? []).slice(firstIdx).filter((v): v is number => v != null && v > 0);
  let volScore: number | null = null;
  if (vols.length >= 10) {
    const r = vols.slice(-10).reduce((s, v) => s + v, 0) / 10;
    const o = vols.slice(0, Math.max(1, vols.length - 10));
    const oAvg = o.reduce((s, v) => s + v, 0) / o.length;
    volScore = oAvg > 0 ? Math.min(1, Math.max(0, 1 - r / oAvg)) : 0;
  }
  const touchPts = Math.min(35, (touchesHigh + touchesLow) * 5);
  const parts = [touchPts, contraction * 25, Math.min(20, (lifeBars * 20) / 45)];
  let max = 35 + 25 + 20;
  if (volScore != null) { parts.push(volScore * 20); max += 20; }
  const quality = Math.round((parts.reduce((s, v) => s + v, 0) / max) * 100);

  return {
    kind, verified: true, gates, state, quality,
    apexBars, touchesHigh, touchesLow, lifeBars, lineHigh, lineLow, lastIndex: lastIdx,
  };
}

/** Direção da primeira saída do canal à frente (para backtest). */
export function exitDirection(
  closes: number[], fromIdx: number, res: WedgeResult, kind: WedgeKind, maxBars = WEDGE_APEX_CAP,
): 'up' | 'down' | null {
  const end = Math.min(closes.length, fromIdx + maxBars);
  for (let t = fromIdx; t < end; t++) {
    const c = closes[t];
    if (c == null || c <= 0) continue;
    if (c > at(res.lineHigh, t)) return 'up';
    if (c < at(res.lineLow, t)) return 'down';
  }
  return null;
}

export interface WedgeBreakStats {
  n: number;
  favorPct: number;
}

/**
 * Certeza MEDIDA, não prometida: varre janelas históricas, conta cunhas
 * verificadas e a direção do primeiro rompimento. % histórico a favor do viés.
 */
export function wedgeBreakStats(closes: number[], kind: WedgeKind): WedgeBreakStats | null {
  let n = 0;
  let favor = 0;
  for (let end = 70; end + 5 <= closes.length; end += 5) {
    const hist = closes.slice(0, end);
    let res: WedgeResult;
    try {
      res = verifyWedge(hist, undefined, kind);
    } catch {
      continue;
    }
    if (!res.verified || res.state === 'invalidated') continue;
    const dir = exitDirection(closes, end, res, kind);
    if (!dir) continue;
    n++;
    if ((kind === 'desc' && dir === 'up') || (kind === 'asc' && dir === 'down')) favor++;
  }
  if (!n) return null;
  return { n, favorPct: Math.round((favor / n) * 100) };
}

// ---- Log de selos (revogável + auditável) ----
export interface WedgeEvent {
  symbol: string;
  kind: WedgeKind;
  event: 'emitted' | 'confirmed' | 'revoked';
  state: WedgeState;
  price: number;
  at: number;
}

const WEDGE_LOG_KEY = 'cc.wedges.log';

export function loadWedgeLog(): WedgeEvent[] {
  try {
    const raw = localStorage.getItem(WEDGE_LOG_KEY);
    const j = raw ? (JSON.parse(raw) as WedgeEvent[]) : [];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function saveWedgeLog(log: WedgeEvent[]): void {
  try {
    localStorage.setItem(WEDGE_LOG_KEY, JSON.stringify(log.slice(-500)));
  } catch {
    /* armazenamento cheio */
  }
}

/**
 * Diferença pura (testável) entre selos anteriores e atuais.
 * current: selos verificados agora (symbol+kind+state+price).
 */
export function diffWedgeStates(
  prev: { symbol: string; kind: WedgeKind; state: WedgeState }[],
  curr: { symbol: string; kind: WedgeKind; state: WedgeState; price: number }[],
): Omit<WedgeEvent, 'at'>[] {
  const out: Omit<WedgeEvent, 'at'>[] = [];
  const pMap = new Map(prev.map((p) => [`${p.kind}:${p.symbol}`, p]));
  const cMap = new Map(curr.map((c) => [`${c.kind}:${c.symbol}`, c]));
  for (const c of curr) {
    const p = pMap.get(`${c.kind}:${c.symbol}`);
    if (!p) out.push({ symbol: c.symbol, kind: c.kind, event: 'emitted', state: c.state, price: c.price });
    else if (p.state === 'forming' && c.state === 'confirmed') {
      out.push({ symbol: c.symbol, kind: c.kind, event: 'confirmed', state: c.state, price: c.price });
    }
  }
  for (const p of prev) {
    if (!cMap.has(`${p.kind}:${p.symbol}`)) {
      out.push({ symbol: p.symbol, kind: p.kind, event: 'revoked', state: p.state, price: NaN });
    }
  }
  return out;
}

/** Aplica o diff no log persistido (selo caiu sozinho quando some). */
export function syncWedgeLog(curr: { symbol: string; kind: WedgeKind; state: WedgeState; price: number }[]): WedgeEvent[] {
  const log = loadWedgeLog();
  const lastByKey = new Map<string, WedgeEvent>();
  for (const e of log) lastByKey.set(`${e.kind}:${e.symbol}`, e);
  // Estado vigente = último evento não-revogado por chave
  const prev: { symbol: string; kind: WedgeKind; state: WedgeState }[] = [];
  for (const [key, e] of lastByKey) {
    if (e.event === 'revoked') continue;
    const [kind, ...sym] = key.split(':');
    prev.push({ symbol: sym.join(':'), kind: kind as WedgeKind, state: e.state });
  }
  const now = Date.now();
  const fresh = diffWedgeStates(prev, curr).map((e) => ({ ...e, at: now }));
  if (!fresh.length) return log;
  const next = [...log, ...fresh].slice(-500);
  saveWedgeLog(next);
  return next;
}
