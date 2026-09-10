import { fetchWithTimeout } from '@/services/cache';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: number | null;
  summary: string;
  coins: string[];
  image: string | null;
}

const FEEDS = [
  { source: 'CoinDesk', url: '/api/rss-cd/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: '/api/rss-ct/rss' },
  { source: 'Decrypt', url: '/api/rss-dec/feed' },
  { source: 'Bitcoin Magazine', url: '/api/rss-bm/feed' },
];

const COIN_KEYWORDS: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth', 'ether'],
  SOL: ['solana', 'sol'],
  XRP: ['xrp', 'ripple'],
  DOGE: ['dogecoin', 'doge'],
  ADA: ['cardano', 'ada'],
  AVAX: ['avalanche', 'avax'],
  LINK: ['chainlink', 'link'],
  DOT: ['polkadot', 'dot'],
  LTC: ['litecoin', 'ltc'],
  BNB: ['bnb', 'binance'],
  ARB: ['arbitrum', 'arb'],
  OP: ['optimism'],
  NEAR: ['near protocol'],
  ATOM: ['cosmos'],
  UNI: ['uniswap', 'uni'],
  TAO: ['bittensor', 'tao'],
  SUI: ['sui network'],
  APT: ['aptos'],
  FIL: ['filecoin', 'fil'],
  AAVE: ['aave'],
  ETF: ['etf'],
  STABLE: ['stablecoin', 'usdt', 'usdc', 'tether'],
};

export function tagCoins(text: string): string[] {
  const t = text.toLowerCase();
  return Object.entries(COIN_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => t.includes(k)))
    .map(([sym]) => sym);
}

function textOf(el: Element | null | undefined, tag: string): string {
  if (!el) return '';
  const n = el.getElementsByTagName(tag)[0] ?? el.querySelector(tag);
  return n?.textContent?.trim() ?? '';
}
function imgOf(el: Element): string | null {
  const enc = el.getElementsByTagName('enclosure')[0]?.getAttribute('url');
  if (enc && /^https?:\/\//.test(enc)) return enc;
  const media = el.getElementsByTagName('media:content')[0] ?? el.getElementsByTagName('media:thumbnail')[0];
  const mu = media?.getAttribute('url');
  if (mu && /^https?:\/\//.test(mu)) return mu;
  return null;
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return (m?.[1] ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function pickAttr(block: string, tag: string, attr: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i'));
  const u = m?.[1] ?? null;
  return u && /^https?:\/\//.test(u) ? u : null;
}

function parseRssFallback(xml: string, source: string): NewsItem[] {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  return blocks.slice(0, 40).map((b, i) => {
    const title = pick(b, 'title').replace(/<[^>]*>/g, ' ').trim();
    const link = pick(b, 'link').replace(/<[^>]*>/g, ' ').trim();
    const pub = pick(b, 'pubDate') || pick(b, 'updated') || pick(b, 'dc:date');
    const desc = pick(b, 'description') || pick(b, 'summary');
    const clean = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 280);
    const ts = pub ? Date.parse(pub) : NaN;
    const image = pickAttr(b, 'enclosure', 'url') ?? pickAttr(b, 'media:content', 'url') ?? pickAttr(b, 'media:thumbnail', 'url');
    return {
      id: `${source}-${i}-${link || title}`.slice(0, 160),
      title,
      link,
      source,
      publishedAt: Number.isNaN(ts) ? null : ts,
      summary: clean,
      coins: tagCoins(`${title} ${clean}`),
      image,
    };
  }).filter((n) => n.title);
}

export function parseRss(xml: string, source: string): NewsItem[] {
  if (typeof DOMParser === 'undefined') return parseRssFallback(xml, source);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items = Array.from(doc.getElementsByTagName('item'));
  return items.slice(0, 40).map((it, i) => {
    const title = textOf(it, 'title');
    const link = textOf(it, 'link');
    const pub = textOf(it, 'pubDate') || textOf(it, 'updated') || textOf(it, 'dc:date');
    const desc = (textOf(it, 'description') || textOf(it, 'summary') || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 280);
    const ts = pub ? Date.parse(pub) : NaN;
    return {
      id: `${source}-${i}-${link || title}`.slice(0, 160),
      title,
      link,
      source,
      publishedAt: Number.isNaN(ts) ? null : ts,
      summary: desc,
      coins: tagCoins(`${title} ${desc}`),
      image: imgOf(it),
    };
  }).filter((n) => n.title);
}

export async function fetchNews(): Promise<{ items: NewsItem[]; errors: string[] }> {
  const inDev = typeof window !== 'undefined' && window.location.port === '5173';
  const items: NewsItem[] = [];
  const errors: string[] = [];
  await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const url = inDev ? f.url : f.url.replace(/^\/api\/rss-cd/, 'https://www.coindesk.com').replace(/^\/api\/rss-ct/, 'https://cointelegraph.com').replace(/^\/api\/rss-dec/, 'https://decrypt.co').replace(/^\/api\/rss-bm/, 'https://bitcoinmagazine.com');
        const r = await fetchWithTimeout(url, 15000);
        if (!r.ok) throw new Error(`${f.source} ${r.status}`);
        items.push(...parseRss(await r.text(), f.source));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }),
  );
  items.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  return { items, errors };
}
