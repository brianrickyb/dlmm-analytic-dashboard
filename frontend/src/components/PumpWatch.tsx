import type { PumpCandidate } from '../types/screener';
import { formatPercent, formatUsdCompact } from '../lib/format';
import { Badge } from './Badge';
import { PillButton } from './PillButton';

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

export function PumpWatch({ status, candidates, errorMessage, onRetry }: PumpWatchProps) {
  if (status === 'loading') {
    return (
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load pump watch.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        No pools currently match the pump criteria — check back soon.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {candidates.map((candidate) => (
        <a
          key={candidate.poolId}
          href={candidate.poolUrl}
          target="_blank"
          rel="noreferrer"
          className="min-w-[180px] rounded-xl border px-3 py-2 text-sm hover:opacity-80"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {candidate.symbol}
            </span>
            <span className="tabular-nums text-xs font-semibold" style={{ color: 'var(--status-good)' }}>
              +{formatPercent(candidate.priceChangePct6h)}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {candidate.network} · {formatUsdCompact(candidate.volumeUsd24h)} vol · {poolAge(candidate.poolCreatedAt)}
          </div>
          {candidate.news ? (
            <div className="mt-1.5">
              <Badge variant="accent">News</Badge>
            </div>
          ) : null}
        </a>
      ))}
    </div>
  );
}
