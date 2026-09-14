import { Badge } from './Badge';
import { PillButton } from './PillButton';
import type { DirectionResult, TechnicalSignalResult } from '../types/market';

interface DirectionSignalProps {
  /** ML direction result (XAU only). */
  status: 'loading' | 'error' | 'ready';
  direction: DirectionResult | null;
  errorMessage?: string;
  /** Deterministic technical signal (all markets). */
  technicalSignalStatus: 'loading' | 'error' | 'ready';
  technicalSignal: TechnicalSignalResult | null;
  technicalSignalError?: string;
  onRetry: () => void;
}

function directionColor(dir: 'bullish' | 'bearish' | 'neutral'): string {
  if (dir === 'bullish') return 'var(--green)';
  if (dir === 'bearish') return 'var(--red)';
  return 'var(--amber)';
}

function directionBadgeVariant(dir: 'bullish' | 'bearish' | 'neutral'): 'good' | 'critical' | 'warning' {
  if (dir === 'bullish') return 'good';
  if (dir === 'bearish') return 'critical';
  return 'warning';
}

export function DirectionSignal({
  status,
  direction,
  errorMessage,
  technicalSignalStatus,
  technicalSignal,
  technicalSignalError,
  onRetry,
}: DirectionSignalProps) {
  const showMl = status !== 'error' && direction !== null;
  const showTech = technicalSignalStatus !== 'error' && technicalSignal !== null;

  if (status === 'loading' && technicalSignalStatus === 'loading') {
    return <div className="h-28 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (!showMl && !showTech) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>
          {technicalSignalError ?? errorMessage ?? 'Direction signal is unavailable right now.'}
        </p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Technical signal — shown for ALL markets */}
      {technicalSignal && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Technical Directional Signal
              </div>
              <div
                className="mt-1 text-2xl font-extrabold tracking-tight capitalize"
                style={{ color: directionColor(technicalSignal.direction), fontFamily: 'var(--font-mono)' }}
              >
                {technicalSignal.direction}
              </div>
            </div>
            <Badge variant={directionBadgeVariant(technicalSignal.direction)}>
              {(technicalSignal.confidence * 100).toFixed(0)}% agreement
            </Badge>
          </div>
          {technicalSignal.reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {technicalSignal.reasons.map((reason, i) => (
                <li key={i} className="text-xs" style={{ color: 'var(--muted)' }}>
                  {reason}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Deterministic signal from RSI, MA crossover, and momentum — descriptive, not predictive.
          </p>
        </div>
      )}

      {/* ML signal — XAU only */}
      {showMl && direction && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                ML Direction Signal (5-day horizon)
              </div>
              <div
                className="mt-1 text-2xl font-extrabold tracking-tight capitalize"
                style={{ color: direction.direction === 'bullish' ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}
              >
                {direction.direction}
              </div>
            </div>
            <Badge variant={direction.direction === 'bullish' ? 'good' : 'critical'}>
              {(direction.confidence * 100).toFixed(1)}% confidence
            </Badge>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            A self-trained model's prediction for whether XAU/USD will be higher in 5 trading days —
            not a recommendation. This model's real backtested accuracy (51.7% mean on this horizon)
            is below a 55.6% naive baseline across 2020-2024 — see "How this signal works" below for
            the full picture.
            {direction.modelDataThrough ? (
              <>
                {' '}Model trained on data through <span style={{ color: 'var(--amber)' }}>{direction.modelDataThrough}</span>.
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  );
}
