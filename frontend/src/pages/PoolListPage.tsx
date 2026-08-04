import { PoolTable } from '../components/PoolTable';
import { getPoolsWithStats } from '../mock/snapshots';

export function PoolListPage() {
  const pools = getPoolsWithStats();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana. TVL, volume, and fee APR update from
        live pool data — hover the underlined column headers for what each term means.
      </p>
      <PoolTable pools={pools} />
    </div>
  );
}
