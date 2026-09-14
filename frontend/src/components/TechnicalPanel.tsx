import { StatTile } from './StatTile';
import { PillButton } from './PillButton';
import type { TechnicalReadout } from '../types/market';

interface TechnicalPanelProps {
  status: 'loading' | 'error' | 'ready';
  technical: TechnicalReadout | null;
  errorMessage?: string;
  onRetry: () => void;
}

function formatOrNa(value: number | null, format: (v: number) => string): string {
  return value === null ? 'N/A' : format(value);
}

function crossoverState(maCrossover: number | null): { value: string; accent?: string } {
  if (maCrossover === null) return { value: 'N/A' };
  // Threshold filters out SMA float noise around zero.
  if (Math.abs(maCrossover) < 1e-9) return { value: 'Flat' };
  return maCrossover > 0
    ? { value: `Bullish (+${formatPair(maCrossover)})`, accent: 'var(--green)' }
    : { value: `Bearish (${formatPair(maCrossover)})`, accent: 'var(--red)' };
}

function formatPair(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(5);
}

/**
 * Plain deterministic technicals (RSI-14, MA10/50 crossover, momentum, volatility)
 * computed backend-side from the same closes the ML model sees -- shown for every
 * market, and the only readout for pairs without a trained direction model.
 */
export function TechnicalPanel({ status, technical, errorMessage, onRetry }: TechnicalPanelProps) {
  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error' || !technical) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Technical readout is unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  const cross = crossoverState(technical.maCrossover);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile
        label="RSI (14)"
        value={formatOrNa(technical.rsi14, (v) => v.toFixed(1))}
        accent={technical.rsi14 === null ? undefined : technical.rsi14 >= 70 ? 'var(--red)' : technical.rsi14 <= 30 ? 'var(--green)' : undefined}
      />
      <StatTile label="MA10 vs MA50" value={cross.value} accent={cross.accent} />
      <StatTile label="Momentum (10d)" value={formatOrNa(technical.momentum10Pct, (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)} />
      <StatTile label="Volatility (14d)" value={formatOrNa(technical.volatility14Pct, (v) => `${v.toFixed(2)}%`)} />
    </div>
  );
}
