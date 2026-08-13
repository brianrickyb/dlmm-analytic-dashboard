import { StatTile } from './StatTile';
import type { FredObservation, FredSummary } from '../types/market';

interface FundamentalsPanelProps {
  status: 'loading' | 'error' | 'ready';
  fundamentals: FredSummary | null;
  errorMessage?: string;
}

function formatObservation(obs: FredObservation | null, suffix: string): string {
  if (!obs) return 'N/A';
  return `${obs.value.toFixed(2)}${suffix}`;
}

export function FundamentalsPanel({ status, fundamentals, errorMessage }: FundamentalsPanelProps) {
  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error' || !fundamentals) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Fundamentals are unavailable right now.'}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Fed Funds Rate" value={formatObservation(fundamentals.fedFundsRate, '%')} />
      <StatTile label="10Y Real Yield" value={formatObservation(fundamentals.realYield10y, '%')} />
      <StatTile label="CPI Index" value={formatObservation(fundamentals.cpi, '')} />
      <StatTile label="Dollar Index" value={formatObservation(fundamentals.dollarIndex, '')} />
    </div>
  );
}
