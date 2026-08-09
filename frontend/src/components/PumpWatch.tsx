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
        <div
          key={candidate.poolId}
          className="min-w-[180px] rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          <a
            href={candidate.poolUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 hover:opacity-80"
          >
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {candidate.symbol}
            </span>
            <span className="tabular-nums text-xs font-semibold" style={{ color: 'var(--status-good)' }}>
              +{formatPercent(candidate.priceChangePct6h)}
            </span>
          </a>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {candidate.network} · {formatUsdCompact(candidate.volumeUsd24h)} vol · {poolAge(candidate.poolCreatedAt)}
          </div>
          {candidate.news ? (
            <a
              href={candidate.news.url}
              target="_blank"
              rel="noreferrer"
              title={candidate.news.title}
              className="mt-1.5 inline-block hover:opacity-80"
            >
              <Badge variant="accent">News</Badge>
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}
