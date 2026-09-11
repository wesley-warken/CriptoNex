import { useEffect, useMemo, useState } from 'react';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines } from '@/services/providers/binance';
import { backtest } from '@/engine/backtesting';
import { Panel, PanelTitle, Skeleton, ErrorBox } from '@/components/ui/kit';
import type { Candle } from '@/types';

export function BacktestingPage() {
  const [symbol, setSymbol] = useState('BTC');
  const [threshold, setThreshold] = useState(70);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const bs = CRYPTO_ASSETS.find((x) => x.symbol === symbol)?.binanceSymbol ?? 'BTCUSDT';
        const kl = await binanceKlines(bs, '1d', 400);
        if (alive) setCandles(kl);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Falha'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [symbol, retryKey]);
  const r = useMemo(() => (candles.length >= 60 ? backtest(candles, threshold, 7) : null), [candles, threshold]);
  return (
    <div className="space-y-3">
      <Panel>
        <PanelTitle>Estratégia</PanelTitle>
        <div className="flex flex-wrap gap-3 text-sm">
          <label>Ativo <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">{CRYPTO_ASSETS.map((x) => <option key={x.symbol} value={x.symbol}>{x.symbol}</option>)}</select></label>
          <label>Score ≥ <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-20 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1" /></label>
          <span className="text-muted">Período: dados diários reais · hold 7d · sem look-ahead (sinal usa só dados até o timestamp).</span>
        </div>
      </Panel>
      {loading && <Skeleton className="h-48" />}
      {error && <ErrorBox message={error} onRetry={() => setRetryKey((x) => x + 1)} />}
      {r && (
        <div className="grid gap-3 md:grid-cols-3">
          {[['Trades', String(r.trades)], ['Win rate', `${r.winRate.toFixed(1)}%`], ['Retorno médio', `${r.avgReturn.toFixed(2)}%`], ['Profit factor', r.profitFactor.toFixed(2)], ['Max drawdown', `${r.maxDrawdown.toFixed(1)}%`], ['Amostra', r.sampleEnough ? 'Suficiente (n≥20)' : 'Insufficient sample size']].map(([k, v]) => (
            <Panel key={k}><div className="text-xs text-muted">{k}</div><div className="tabular text-xl font-bold">{v}</div></Panel>
          ))}
        </div>
      )}
      <Panel><PanelTitle>Aviso</PanelTitle><p className="text-sm text-muted">Backtest usa histórico real disponível e não garante resultado futuro. Amostras pequenas não sustentam conclusões.</p></Panel>
    </div>
  );
}
