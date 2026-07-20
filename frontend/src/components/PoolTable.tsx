import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PoolWithStats } from '../types/pool';
import { formatPercent, formatUsdCompact } from '../lib/format';

type SortKey = 'tvlUsd' | 'volume24hUsd' | 'feeApr24h';

const columns: { key: SortKey; label: string }[] = [
  { key: 'tvlUsd', label: 'TVL' },
  { key: 'volume24hUsd', label: 'Volume (24h)' },
  { key: 'feeApr24h', label: 'Fee APR (est.)' },
];

export function PoolTable({ pools }: { pools: PoolWithStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('tvlUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  const sorted = useMemo(() => {
    const copy = [...pools];
    copy.sort((a, b) => {
      const diff = a.stats[sortKey] - b.stats[sortKey];
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [pools, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--gridline)' }}>
            <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>
              Pool
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((pool) => (
            <tr
              key={pool.id}
              className="cursor-pointer hover:opacity-80"
              style={{ borderBottom: '1px solid var(--gridline)' }}
              onClick={() => navigate(`/pools/${pool.id}`)}
            >
              <td className="px-4 py-3">
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {pool.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  bin step {pool.binStep} · fee {(pool.baseFeeBps / 100).toFixed(2)}%
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {formatUsdCompact(pool.stats.tvlUsd)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {formatUsdCompact(pool.stats.volume24hUsd)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: 'var(--series-green)' }}>
                {formatPercent(pool.stats.feeApr24h)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
