import { PoolTable } from '../components/PoolTable';
import { getPoolsWithStats } from '../mock/snapshots';

export function PoolListPage() {
  const pools = getPoolsWithStats();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <PoolTable pools={pools} />
    </div>
  );
}
