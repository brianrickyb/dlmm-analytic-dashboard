import { PoolTable } from '../components/PoolTable';
import { StatTile } from '../components/StatTile';
import { getPoolsWithStats } from '../mock/snapshots';
import { formatUsdCompact } from '../lib/format';

export function PoolListPage() {
  const pools = getPoolsWithStats();
  const totalTvlUsd = pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0);
  const totalVolume24hUsd = pools.reduce((sum, p) => sum + p.stats.volume24hUsd, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana. TVL, volume, and fee APR shown here
        are sample data for this demo — hover or tab to the underlined column headers for what
        each term means.
      </p>
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Total TVL" value={formatUsdCompact(totalTvlUsd)} />
        <StatTile label="24h Volume" value={formatUsdCompact(totalVolume24hUsd)} />
        <StatTile label="Active Pools" value={String(pools.length)} />
      </div>
      <PoolTable pools={pools} />
    </div>
  );
}
