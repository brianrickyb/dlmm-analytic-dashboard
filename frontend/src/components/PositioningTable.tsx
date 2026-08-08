import { useMemo, useState } from 'react';
import type { PairPositioning } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
import { Badge } from './Badge';

type SortKey = 'buyRatio' | 'fundingRate' | 'price24hPct';

const columns: { key: SortKey; label: string; termKey?: string }[] = [
  { key: 'buyRatio', label: 'Long/Short Ratio', termKey: 'longShortRatio' },
  { key: 'fundingRate', label: 'Funding Rate', termKey: 'fundingRate' },
  { key: 'price24hPct', label: '24h Change' },
];

const GRID_COLS = 'grid-cols-[1.5fr_1fr_1fr_1fr]';

interface PositioningTableProps {
  pairs: PairPositioning[];
  topLongSymbols: string[];
  topShortSymbols: string[];
}

export function PositioningTable({ pairs, topLongSymbols, topShortSymbols }: PositioningTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('buyRatio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...pairs];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [pairs, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="space-y-1.5">
      <div className={`grid ${GRID_COLS} gap-4 px-4`}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Pair
        </span>
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            onClick={() => toggleSort(col.key)}
            className="text-right text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            {col.termKey ? <Tooltip termKey={col.termKey}>{col.label}</Tooltip> : col.label}
            {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
      </div>
      {sorted.map((pair) => {
        const isTopLong = topLongSymbols.includes(pair.symbol);
        const isTopShort = topShortSymbols.includes(pair.symbol);
        return (
          <div
            key={pair.symbol}
            className={`grid ${GRID_COLS} items-center gap-4 rounded-xl border px-4 py-3`}
            style={{
              borderColor: isTopLong ? 'var(--accent)' : 'var(--border)',
              background: isTopLong ? 'linear-gradient(to right, var(--accent-bg), var(--surface-1))' : 'var(--surface-1)',
            }}
          >
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              {pair.symbol}
              {isTopLong ? <Badge variant="accent">Long-leaning</Badge> : null}
              {isTopShort ? <Badge variant="critical">Short-leaning</Badge> : null}
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {(pair.buyRatio * 100).toFixed(1)}% / {(pair.sellRatio * 100).toFixed(1)}%
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatPercent(pair.fundingRate * 100, 4)}
            </div>
            <div
              className="text-right tabular-nums"
              style={{ color: pair.price24hPct >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
            >
              {formatPercent(pair.price24hPct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
