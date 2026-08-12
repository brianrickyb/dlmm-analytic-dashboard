import { useEffect, useState } from 'react';
import { PoolTable } from '../components/PoolTable';
import { StatTile } from '../components/StatTile';
import { PillButton } from '../components/PillButton';
import { fetchPools } from '../lib/api/pools';
import { formatUsdCompact } from '../lib/format';
import type { PoolWithStats } from '../types/pool';

export function PoolListPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pools, setPools] = useState<PoolWithStats[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchPools()
      .then((result) => {
        if (cancelled) return;
        setPools(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load pools.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana, live from Meteora's public API,
        curated to the top 50 by TVL — hover or tab to the underlined column headers for what
        each term means.
      </p>
      {status === 'loading' ? (
        <div className="h-64 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
      ) : status === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <p style={{ color: 'var(--status-critical)' }}>{errorMessage}</p>
          <PillButton onClick={() => setRequestId((n) => n + 1)} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatTile
              label="Total TVL"
              value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0))}
              variant="hero"
            />
            <StatTile label="24h Volume" value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.volume24hUsd, 0))} />
            <StatTile label="Active Pools" value={String(pools.length)} />
          </div>
          <PoolTable pools={pools} />
        </>
      )}
    </div>
  );
}
