import { PillButton } from './PillButton';
import type { FredObservation, FredSummary } from '../types/market';

interface FundamentalsPanelProps {
  status: 'loading' | 'error' | 'ready';
  fundamentals: FredSummary | null;
  errorMessage?: string;
  onRetry: () => void;
}

interface IndicatorDef {
  key: keyof FredSummary;
  label: string;
  suffix: string;
  /** Short explanation of what this indicator signals for gold/FX. */
  context: string;
}

const INDICATORS: IndicatorDef[] = [
  {
    key: 'fedFundsRate',
    label: 'Fed Funds Rate',
    suffix: '%',
    context: 'Higher rates strengthen USD and pressure gold; lower rates do the opposite.',
  },
  {
    key: 'realYield10y',
    label: '10Y Real Yield',
    suffix: '%',
    context: 'Rising real yields make non-yielding gold less attractive; falling yields support it.',
  },
  {
    key: 'cpi',
    label: 'CPI Index',
    suffix: '',
    context: 'Higher CPI signals inflation — gold often acts as a hedge; deflation weakens it.',
  },
  {
    key: 'dollarIndex',
    label: 'Dollar Index',
    suffix: '',
    context: 'A stronger dollar typically pressures gold and commodity-priced FX pairs.',
  },
];

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function FundamentalsTile({ indicator, obs }: { indicator: IndicatorDef; obs: FredObservation | null }) {
  const value = obs ? `${obs.value.toFixed(2)}${indicator.suffix}` : 'N/A';
  const dateLabel = obs ? formatDate(obs.date) : null;

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {indicator.label}
      </div>
      <div
        className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums"
        style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </div>
      {dateLabel && (
        <div className="mt-1 text-[10px]" style={{ color: 'var(--muted)' }}>
          As of {dateLabel}
        </div>
      )}
      <div className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
        {indicator.context}
      </div>
    </div>
  );
}

export function FundamentalsPanel({ status, fundamentals, errorMessage, onRetry }: FundamentalsPanelProps) {
  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error' || !fundamentals) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Fundamentals are unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {INDICATORS.map((ind) => (
        <FundamentalsTile key={ind.key} indicator={ind} obs={fundamentals[ind.key]} />
      ))}
    </div>
  );
}
