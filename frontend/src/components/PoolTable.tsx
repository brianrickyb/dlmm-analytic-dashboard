import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PoolWithStats } from '../types/pool';
import { formatPercent, formatUsdCompact } from '../lib/format';
import { Tooltip } from './Tooltip';

type SortKey = 'tvlUsd' | 'volume24hUsd' | 'feeApr24h';

const columns: { key: SortKey; label: string; termKey?: string }[] = [
  { key: 'tvlUsd', label: 'TVL', termKey: 'tvl' },
  { key: 'volume24hUsd', label: 'Volume (24h)' },
  { key: 'feeApr24h', label: 'Fee APR (est.)', termKey: 'feeApr' },
];

const GRID_COLS = 'grid-cols-[2fr_1fr_1fr_1fr]';

export function PoolTable({
  pools,
  sortKey: externalSortKey,
  onSortChange,
}: {
  pools: PoolWithStats[];
  sortKey?: SortKey;
  onSortChange?: (key: SortKey) => void;
}) {
  const [internalSortKey, setInternalSortKey] = useState<SortKey>('tvlUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  const sortKey = externalSortKey ?? internalSortKey;

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
      setInternalSortKey(key);
      onSortChange?.(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="space-y-1.5 text-sm">
        <div className={`grid ${GRID_COLS} gap-4 border border-transparent px-4`}>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Pool
          </span>
          {columns.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleSort(col.key)}
              className="text-right text-[10px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              {col.termKey ? (
                <Tooltip termKey={col.termKey} interactive={false}>
                  {col.label}
                </Tooltip>
              ) : (
                col.label
              )}
              {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          ))}
        </div>
        {sorted.map((pool) => (
          <div
            key={pool.id}
            role="button"
            tabIndex={0}
            aria-label={`View ${pool.name} pool details`}
            onClick={() => navigate(`/pools/${pool.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/pools/${pool.id}`);
              }
            }}
            className={`grid ${GRID_COLS} cursor-pointer items-center gap-4 rounded-xl border px-4 py-3`}
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <div>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>
                {pool.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                <Tooltip termKey="binStep" interactive={false}>
                  bin step
                </Tooltip>{' '}
                {pool.binStep} · fee {(pool.baseFeeBps / 100).toFixed(2)}%
              </div>
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {formatUsdCompact(pool.stats.tvlUsd)}
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {formatUsdCompact(pool.stats.volume24hUsd)}
            </div>
            <div className="text-right tabular-nums font-semibold" style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
              {formatPercent(pool.stats.feeApr24h)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
