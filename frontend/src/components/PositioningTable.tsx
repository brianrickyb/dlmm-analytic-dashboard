import { useMemo, useState } from 'react';
import type { PairPositioning } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';

type SortKey = 'buyRatio' | 'fundingRate' | 'price24hPct';

const columns: { key: SortKey; label: string; termKey?: string }[] = [
  { key: 'buyRatio', label: 'Long/Short Ratio', termKey: 'longShortRatio' },
  { key: 'fundingRate', label: 'Funding Rate', termKey: 'fundingRate' },
  { key: 'price24hPct', label: '24h Change' },
];

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
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--gridline)' }}>
            <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>
              Pair
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => toggleSort(col.key)}
              >
                {col.termKey ? <Tooltip termKey={col.termKey}>{col.label}</Tooltip> : col.label}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((pair) => {
            const isTopLong = topLongSymbols.includes(pair.symbol);
            const isTopShort = topShortSymbols.includes(pair.symbol);
            return (
              <tr key={pair.symbol} style={{ borderBottom: '1px solid var(--gridline)' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {pair.symbol}
                  {isTopLong ? (
                    <span className="ml-2 text-xs" style={{ color: 'var(--status-good)' }}>
                      Long-leaning
                    </span>
                  ) : null}
                  {isTopShort ? (
                    <span className="ml-2 text-xs" style={{ color: 'var(--status-critical)' }}>
                      Short-leaning
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {(pair.buyRatio * 100).toFixed(1)}% / {(pair.sellRatio * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {formatPercent(pair.fundingRate * 100, 4)}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  style={{ color: pair.price24hPct >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
                >
                  {formatPercent(pair.price24hPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
