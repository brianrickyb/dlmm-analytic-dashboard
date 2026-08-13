import { useEffect, useMemo, useState } from 'react';
import { PoolTable } from '../components/PoolTable';
import { StatTile } from '../components/StatTile';
import { PillButton } from '../components/PillButton';
import { fetchPools } from '../lib/api/pools';
import { formatUsdCompact } from '../lib/format';
import type { PoolWithStats } from '../types/pool';

type SortKey = 'tvlUsd' | 'volume24hUsd' | 'feeApr24h';

const SORT_LABELS: Record<SortKey, string> = {
  tvlUsd: 'TVL',
  volume24hUsd: 'Volume',
  feeApr24h: 'APR',
};

export function PoolListPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pools, setPools] = useState<PoolWithStats[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('tvlUsd');

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

  const filtered = useMemo(
    () => pools.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [pools, search],
  );

  return (
    <div className="page-enter space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana, live from Meteora's public API,
        curated to the top 50 by TVL — hover or tab to the underlined column headers for what
        each term means.
      </p>
      {status === 'loading' ? (
        <div className="h-64 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      ) : status === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <p style={{ color: 'var(--red)' }}>{errorMessage}</p>
          <PillButton onClick={() => setRequestId((n) => n + 1)} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label="Total TVL"
              value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0))}
              variant="hero"
            />
            <StatTile label="24h Volume" value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.volume24hUsd, 0))} />
            <StatTile label="Active Pools" value={String(pools.length)} />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative max-w-[280px] flex-1">
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--muted)"
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              >
                <circle cx={11} cy={11} r={8} />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pools…"
                className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
              />
            </div>
            <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: sortKey === key ? 'var(--green-subtle)' : 'transparent',
                    color: sortKey === key ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
              {filtered.length} pools
            </span>
          </div>

          <PoolTable pools={filtered} sortKey={sortKey} onSortChange={setSortKey} />
        </>
      )}
    </div>
  );
}
