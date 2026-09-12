import { fetchWithTimeout } from '@/services/cache';
import { generateTranslate } from '@/services/aiAnalysis';

/** Léxico bilíngue simples para estimativa de sentimento (heurística local). */
const POS = [
  'bullish', 'surge', 'surges', 'rally', 'record', 'all-time high', 'gains', 'soar', 'soars', 'jump', 'jumps',
  'approval', 'approved', 'adopt', 'adoption', 'inflow', 'inflows', 'etf', 'breakthrough', 'launch', 'partnership',
  'alta', 'recorde', 'aprova', 'lucro', 'ganho', 'sobe', 'dispara', 'otimismo', 'adoção', 'lança',
];
const NEG = [
  'bearish', 'crash', 'plunge', 'dump', 'fear', 'lawsuit', 'sec', 'hack', 'exploit', 'scam', 'fraud', 'ban',
  'drop', 'fall', 'falls', 'decline', 'sell', 'selloff', 'liquidation', 'queda', 'medo', 'golpe', 'fraude',
  'processo', 'proíbe', 'cai', 'desaba', 'venda', 'liquida',
];

/**
 * Estima sentimento 1–10 por contagem ponderada de termos.
 * 1–3 negativo, 4–7 neutro, 8–10 positivo. Heurística — não é análise.
 */
export function sentimentScore(text: string): { score: number; label: 'negativo' | 'neutro' | 'positivo' } {
  const t = ` ${text.toLowerCase()} `;
  let pos = 0;
  let neg = 0;
  for (const w of POS) if (t.includes(w)) pos += w.length > 5 ? 2 : 1;
  for (const w of NEG) if (t.includes(w)) neg += w.length > 5 ? 2 : 1;
  const raw = 5 + (pos - neg);
  const score = Math.max(1, Math.min(10, Math.round(raw)));
  return { score, label: score <= 3 ? 'negativo' : score >= 8 ? 'positivo' : 'neutro' };
}

const transCache = new Map<string, string>();

/**
 * Tradução EN→PT sob demanda — cadeia do TRANSLATE: Flash-Lite (cota
 * auxiliar) → MyMemory (gratuita) → original. Nunca trava, nunca toca o
 * Flash principal; chamador mostra o original com badge quando for o caso.
 */
export async function translateToPt(text: string): Promise<string> {
  const key = text.slice(0, 400);
  const hit = transCache.get(key);
  if (hit) return hit;
  try {
    const lite = await generateTranslate(key);
    if (lite.tier === 'lite' && lite.text.trim()) {
      transCache.set(key, lite.text);
      return lite.text;
    }
  } catch {
    /* sem Lite: MyMemory */
  }
  try {
    const r = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|pt`, 15000);
    if (!r.ok) throw new Error(`Tradução ${r.status}`);
    const j = (await r.json()) as { responseData?: { translatedText?: string } };
    const out = j.responseData?.translatedText ?? text;
    transCache.set(key, out);
    return out;
  } catch {
    throw new Error('Tradução indisponível');
  }
}
