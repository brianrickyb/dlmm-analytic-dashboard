import type { PumpCandidate } from '../types/screener';
import { formatPercent, formatUsdCompact } from '../lib/format';
import { Badge } from './Badge';
import { PillButton } from './PillButton';
import { ScreenerTable, type ScreenerColumn } from './ScreenerTable';

interface PumpWatchProps {
  status: 'loading' | 'error' | 'ready';
  candidates: PumpCandidate[];
  errorMessage?: string;
  onRetry: () => void;
}

function poolAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return '<1h old';
  if (hours < 24) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

const columns: ScreenerColumn<PumpCandidate>[] = [
  {
    key: 'symbol',
    header: 'Pool',
    width: '1.6fr',
    render: (candidate) => (
      <div>
        <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
          {candidate.symbol}
          {candidate.news ? <Badge variant="accent">News</Badge> : null}
        </div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          {candidate.network} · {candidate.dex}
        </div>
      </div>
    ),
  },
  {
    key: 'priceChangePct6h',
    header: '6h Change',
    align: 'right',
    sortable: true,
    sortValue: (candidate) => candidate.priceChangePct6h,
    render: (candidate) => (
      <span className="tabular-nums font-semibold" style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
        +{formatPercent(candidate.priceChangePct6h)}
      </span>
    ),
  },
  {
    key: 'volumeUsd24h',
    header: '24h Volume',
    align: 'right',
    sortable: true,
    sortValue: (candidate) => candidate.volumeUsd24h,
    render: (candidate) => (
      <span className="tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        {formatUsdCompact(candidate.volumeUsd24h)}
      </span>
    ),
  },
  {
    key: 'poolCreatedAt',
    header: 'Age',
    align: 'right',
    sortable: true,
    sortValue: (candidate) => -new Date(candidate.poolCreatedAt).getTime(),
    render: (candidate) => (
      <span className="tabular-nums text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
        {poolAge(candidate.poolCreatedAt)}
      </span>
    ),
  },
];

export function PumpWatch({ status, candidates, errorMessage, onRetry }: PumpWatchProps) {
  if (status === 'loading') {
    return (
      <div className="h-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Failed to load pump watch.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  return (
    <ScreenerTable
      columns={columns}
      rows={candidates}
      rowKey={(candidate) => candidate.poolId}
      rowHref={(candidate) => candidate.poolUrl}
      emptyMessage="No pools currently match the pump criteria — check back soon."
    />
  );
}
