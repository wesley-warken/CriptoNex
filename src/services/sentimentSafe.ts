import { fearGreed as fg } from '@/services/providers/sentiment';
import { geckoTrending } from '@/services/providers/coingecko';
import { snapshotGet, snapshotSet } from '@/services/cache';
export async function geckoTrendingSafe(): Promise<{ symbol: string; name: string }[]> {
  try {
    const t = await geckoTrending();
    snapshotSet('cc.social.snapshots', t);
    return t;
  } catch {
    return snapshotGet<{ symbol: string; name: string }[]>('cc.social.snapshots')?.data ?? [];
  }
}
export { fg as fearGreed };
