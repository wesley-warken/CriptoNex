import { fetchWithTimeout } from '@/services/cache';
export interface FearGreedPoint { time: number; value: number; label: string }
export function fgLabel(v: number): string {
  if (v >= 75) return 'Ganância extrema';
  if (v >= 55) return 'Ganância';
  if (v >= 45) return 'Neutro';
  if (v >= 25) return 'Medo';
  return 'Medo extremo';
}
export async function fearGreed(limit = 31): Promise<{ current: number | null; history: FearGreedPoint[] }> {
  const r = await fetchWithTimeout(`https://api.alternative.me/fng/?limit=${limit}`);
  if (!r.ok) throw new Error(`Fear&Greed ${r.status}`);
  const j = (await r.json()) as { data: { value: string; timestamp: string }[] };
  const history = [...j.data].reverse().map((d) => ({ time: Number(d.timestamp) * 1000, value: Number(d.value), label: fgLabel(Number(d.value)) }));
  return { current: history.length ? history[history.length - 1].value : null, history };
}
export interface RedditPost { title: string; subreddit: string; ups: number; comments: number; url: string }
export async function redditPosts(query: string): Promise<RedditPost[]> {
  const inDev = typeof window !== 'undefined' && window.location.port === '5173';
  const url = inDev ? `/api/reddit/search.json?q=${encodeURIComponent(query)}&sort=top&limit=8&t=week` : `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=top&limit=8&t=week`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`Reddit ${r.status}`);
  const j = (await r.json()) as { data: { children: { data: { title: string; subreddit: string; ups: number; num_comments: number; permalink: string } }[] } };
  return j.data.children.map((c) => ({ title: c.data.title, subreddit: c.data.subreddit, ups: c.data.ups, comments: c.data.num_comments, url: `https://www.reddit.com${c.data.permalink}` }));
}
