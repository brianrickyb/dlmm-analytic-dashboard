import { Link, useParams } from 'react-router-dom';
import { HistoryChart } from '../components/HistoryChart';
import { IlCalculator } from '../components/IlCalculator';
import { StatTile } from '../components/StatTile';
import { pools } from '../mock/pools';
import { getLatestStats, getSnapshots } from '../mock/snapshots';
import { formatPercent, formatPrice, formatUsd, formatUsdCompact } from '../lib/format';

export function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const pool = pools.find((p) => p.id === poolId);

  if (!pool) {
    return (
      <div>
        <p style={{ color: 'var(--text-primary)' }}>Pool not found.</p>
        <Link to="/" style={{ color: 'var(--series-blue)' }}>
          Back to pool list
        </Link>
      </div>
    );
  }

  const series = getSnapshots(pool.id);
  const stats = getLatestStats(pool.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-xs" style={{ color: 'var(--series-blue)' }}>
          ← Back to pool list
        </Link>
        <h1 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {pool.name}
        </h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          bin step {pool.binStep} · base fee {(pool.baseFeeBps / 100).toFixed(2)}% · current price {formatPrice(stats.currentPrice)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="TVL" value={formatUsdCompact(stats.tvlUsd)} />
        <StatTile label="Volume (24h)" value={formatUsdCompact(stats.volume24hUsd)} />
        <StatTile label="Fees (24h)" value={formatUsd(stats.fees24hUsd)} />
        <StatTile label="Fee APR (est.)" value={formatPercent(stats.feeApr24h)} accent="var(--series-green)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HistoryChart data={series} dataKey="tvlUsd" label="TVL" color="var(--series-blue)" />
        <HistoryChart data={series} dataKey="volume24hUsd" label="Volume (24h)" color="var(--series-violet)" />
        <HistoryChart
          data={series}
          dataKey="feeApr24h"
          label="Fee APR (est.)"
          color="var(--series-green)"
          valueFormatter={(v) => formatPercent(v)}
        />
      </div>

      <IlCalculator series={series} />
    </div>
  );
}
