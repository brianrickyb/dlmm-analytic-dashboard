import { Badge } from './Badge';
import { PillButton } from './PillButton';
import type { DirectionResult } from '../types/market';

interface DirectionSignalProps {
  status: 'loading' | 'error' | 'ready';
  direction: DirectionResult | null;
  errorMessage?: string;
  onRetry: () => void;
}

export function DirectionSignal({ status, direction, errorMessage, onRetry }: DirectionSignalProps) {
  if (status === 'loading') {
    return <div className="h-28 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />;
  }

  if (status === 'error' || !direction) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Direction signal is unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  const isBullish = direction.direction === 'bullish';

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Model Direction Signal (5-day horizon)
          </div>
          <div
            className="mt-1 text-2xl font-extrabold tracking-tight capitalize"
            style={{ color: isBullish ? 'var(--status-good)' : 'var(--status-critical)' }}
          >
            {direction.direction}
          </div>
        </div>
        <Badge variant={isBullish ? 'good' : 'critical'}>{(direction.confidence * 100).toFixed(1)}% confidence</Badge>
      </div>
      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        A self-trained model's prediction for whether XAU/USD will be higher in 5 trading days —
        not a recommendation. This model's real backtested accuracy (51.7% mean on this horizon)
        is below a 55.6% naive baseline across 2020-2024 — see "How this signal works" below for
        the full picture.
      </p>
    </div>
  );
}
