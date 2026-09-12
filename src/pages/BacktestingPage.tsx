import { useEffect, useMemo, useState } from 'react';
import { CRYPTO_ASSETS } from '@/services/providers/assets';
import { binanceKlines } from '@/services/providers/binance';
import { backtest, formatPF } from '@/engine/backtesting';
import { Panel, PanelTitle, Skeleton, ErrorBox } from '@/components/ui/kit';
import { MSection } from '@/components/minimal/MSection';
import { MStats } from '@/components/minimal/MStats';
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
    <div className="space-y-3 text-[var(--text-secondary)]">
      <Panel>
        <PanelTitle>Estratégia</PanelTitle>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Ativo <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none">{CRYPTO_ASSETS.map((x) => <option key={x.symbol} value={x.symbol}>{x.symbol}</option>)}</select></label>
          <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Score ≥ <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-xs tabular-nums text-[var(--text-primary)] outline-none" /></label>
          <span className="text-xs text-[var(--text-muted)]">Período: dados diários reais · hold 7d · sem look-ahead (sinal usa só dados até o timestamp).</span>
        </div>
      </Panel>
      {loading && <Skeleton className="h-48" />}
      {error && <ErrorBox message={error} onRetry={() => setRetryKey((x) => x + 1)} />}
      {r && (
        <MStats
          items={[
            { label: 'Trades', value: `${r.trades}`, sub: `pulados: ${r.skippedOverlap + r.skippedInvalid}` },
            { label: 'Win rate', value: `${r.winRate.toFixed(1)}%` },
            { label: 'Retorno médio liq.', value: `${r.avgReturn.toFixed(2)}%`, tone: r.avgReturn >= 0 ? 'up' : 'down' },
            { label: 'Mediana', value: `${r.medianReturn.toFixed(2)}%`, tone: r.medianReturn >= 0 ? 'up' : 'down' },
            { label: 'Melhor/pior', value: `${r.best.toFixed(1)}% / ${r.worst.toFixed(1)}%` },
            { label: 'Profit factor', value: formatPF(r.profitFactor, r.trades) },
            { label: 'Max drawdown', value: `${r.maxDrawdown.toFixed(1)}%`, tone: 'down' },
            { label: 'Benchmark B&H', value: `${r.benchmarkReturn.toFixed(1)}%` },
            { label: 'Alpha', value: `${r.alpha >= 0 ? '+' : ''}${r.alpha.toFixed(1)}%`, tone: r.alpha >= 0 ? 'up' : 'down' },
            { label: 'Exposição máx', value: `${r.maxSimultaneous} simult.` },
            { label: 'Amostra', value: `${r.sampleLabel} (n=${r.trades})` },
            { label: 'Qualidade dados', value: r.dataQuality ? `${r.dataQuality.score}/100` : '—' },
          ]}
        />
      )}
      <MSection title="Aviso"><p className="text-sm leading-6 text-[var(--text-secondary)]">Backtest direcional (compra em BUY, vende em SELL) com alvo-antes-stop do plano, fee 0.1%/lado + slippage 0.05% e teto de 5 simultâneas. Retornos líquidos de custos; drawdown sobre equity composta. Não garante resultado futuro. Amostras pequenas não sustentam conclusões.</p></MSection>
    </div>
  );
}
