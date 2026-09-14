import type { PairPositioning } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
import { Badge } from './Badge';
import { ScreenerTable, type ScreenerColumn } from './ScreenerTable';
import { Sparkline } from './Sparkline';

interface PositioningTableProps {
  pairs: PairPositioning[];
  topLongSymbols: string[];
  topShortSymbols: string[];
}

export function PositioningTable({ pairs, topLongSymbols, topShortSymbols }: PositioningTableProps) {
  const columns: ScreenerColumn<PairPositioning>[] = [
    {
      key: 'symbol',
      header: 'Pair',
      width: '1.6fr',
      render: (pair) => (
        <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
          {pair.symbol}
          {topLongSymbols.includes(pair.symbol) ? <Badge variant="accent">Long-leaning</Badge> : null}
          {topShortSymbols.includes(pair.symbol) ? <Badge variant="critical">Short-leaning</Badge> : null}
        </div>
      ),
    },
    {
      key: 'sparkline',
      header: '24h',
      width: '80px',
      render: (pair) => <Sparkline data={pair.sparkline} />,
    },
    {
      key: 'buyRatio',
      header: <Tooltip termKey="longShortRatio" interactive={false}>Long/Short Ratio</Tooltip>,
      align: 'right',
      sortable: true,
      sortValue: (pair) => pair.buyRatio,
      render: (pair) => (
        <span className="tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
          {(pair.buyRatio * 100).toFixed(1)}% / {(pair.sellRatio * 100).toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'fundingRate',
      header: <Tooltip termKey="fundingRate" interactive={false}>Funding Rate</Tooltip>,
      align: 'right',
      sortable: true,
      sortValue: (pair) => pair.fundingRate,
      render: (pair) => (
        <span className="tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
          {formatPercent(pair.fundingRate * 100, 4)}
        </span>
      ),
    },
    {
      key: 'price24hPct',
      header: '24h Change',
      align: 'right',
      sortable: true,
      sortValue: (pair) => pair.price24hPct,
      render: (pair) => (
        <span
          className="tabular-nums"
          style={{ color: pair.price24hPct >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}
        >
          {formatPercent(pair.price24hPct)}
        </span>
      ),
    },
  ];

  return (
    <ScreenerTable
      columns={columns}
      rows={pairs}
      rowKey={(pair) => pair.symbol}
      defaultSortKey="buyRatio"
      defaultSortDir="desc"
      emptyMessage="No pairs match your search."
      rowStyle={(pair) =>
        topLongSymbols.includes(pair.symbol)
          ? { borderColor: 'var(--green)', background: 'linear-gradient(to right, var(--green-subtle), var(--card))' }
          : undefined
      }
    />
  );
}
