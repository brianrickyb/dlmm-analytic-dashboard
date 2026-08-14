import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { HistoryChart } from '../components/HistoryChart';
import { IlCalculator } from '../components/IlCalculator';
import { StatTile } from '../components/StatTile';
import { Tooltip } from '../components/Tooltip';
import { AddLiquidityForm } from '../components/AddLiquidityForm';
import { PillButton } from '../components/PillButton';
import { RelatedNews } from '../components/RelatedNews';
import { fetchPool, fetchPoolHistory, fetchPoolNews, PoolNotFoundError } from '../lib/api/pools';
import { formatPercent, formatPrice, formatUsd, formatUsdCompact } from '../lib/format';
import type { PoolSnapshot, PoolTokenNews, PoolWithStats } from '../types/pool';

export function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const { connected } = useWallet();
  const [status, setStatus] = useState<'loading' | 'error' | 'not-found' | 'ready'>('loading');
  const [pool, setPool] = useState<PoolWithStats | null>(null);
  const [series, setSeries] = useState<PoolSnapshot[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);
  const [newsStatus, setNewsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [poolNews, setPoolNews] = useState<PoolTokenNews[]>([]);
  const [newsErrorMessage, setNewsErrorMessage] = useState<string | undefined>(undefined);
  const [newsRequestId, setNewsRequestId] = useState(0);

  useEffect(() => {
    if (!poolId) return;
    let cancelled = false;
    setStatus('loading');

    Promise.all([fetchPool(poolId), fetchPoolHistory(poolId)])
      .then(([poolResult, historyResult]) => {
        if (cancelled) return;
        setPool(poolResult);
        setSeries(historyResult);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PoolNotFoundError) {
          setStatus('not-found');
          return;
        }
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load pool.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [poolId, requestId]);

  useEffect(() => {
    if (!poolId) return;
    let cancelled = false;
    setNewsStatus('loading');

    fetchPoolNews(poolId)
      .then((result) => {
        if (cancelled) return;
        setPoolNews(result);
        setNewsStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNewsErrorMessage(err instanceof Error ? err.message : 'Failed to load related news.');
        setNewsStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [poolId, newsRequestId]);

  if (status === 'loading') {
    return <div className="h-64 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (status === 'not-found') {
    return (
      <div>
        <p style={{ color: 'var(--text)' }}>Pool not found.</p>
        <Link to="/" style={{ color: 'var(--green)' }}>
          Back to pool list
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage}</p>
        <PillButton onClick={() => setRequestId((n) => n + 1)} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  const stats = pool!.stats;

  return (
    <div className="page-enter space-y-6">
      <div>
        <Link to="/" className="text-xs" style={{ color: 'var(--green)' }}>
          ← Back to pool list
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          {pool!.name}
        </h1>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          <Tooltip termKey="binStep">bin step</Tooltip> {pool!.binStep} · base fee {(pool!.baseFeeBps / 100).toFixed(2)}% · current
          price {formatPrice(stats.currentPrice)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label={<Tooltip termKey="tvl">TVL</Tooltip>} value={formatUsdCompact(stats.tvlUsd)} variant="hero" />
        <StatTile label="Volume (24h)" value={formatUsdCompact(stats.volume24hUsd)} />
        <StatTile label="Fees (24h)" value={formatUsd(stats.fees24hUsd)} />
        <StatTile
          label={<Tooltip termKey="feeApr">Fee APR (est.)</Tooltip>}
          value={formatPercent(stats.feeApr24h)}
          accent="var(--green)"
        />
      </div>

      {series.length === 0 ? (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}
        >
          This pool doesn't have enough recorded history yet to show trend charts or run the IL
          calculator — check back after the daily snapshot has run a few times.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HistoryChart data={series} dataKey="tvlUsd" label="TVL" color="var(--series-blue)" />
            <HistoryChart data={series} dataKey="volume24hUsd" label="Volume (24h)" color="var(--series-violet)" />
            <HistoryChart
              data={series}
              dataKey="feeApr24h"
              label="Fee APR (est.)"
              color="var(--green)"
              valueFormatter={(v) => formatPercent(v)}
            />
          </div>

          <IlCalculator series={series} />
        </>
      )}

      <RelatedNews
        status={newsStatus}
        tokens={poolNews}
        errorMessage={newsErrorMessage}
        onRetry={() => setNewsRequestId((n) => n + 1)}
      />

      {connected ? (
        <AddLiquidityForm />
      ) : (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Connect a wallet to add liquidity (devnet only — separate from the live pool shown above).
        </p>
      )}
    </div>
  );
}
