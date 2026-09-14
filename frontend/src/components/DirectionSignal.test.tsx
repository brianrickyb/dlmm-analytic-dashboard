import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectionSignal } from './DirectionSignal';
import type { DirectionResult, TechnicalSignalResult } from '../types/market';

const TECHNICAL_SIGNAL: TechnicalSignalResult = {
  direction: 'bullish',
  confidence: 0.6,
  reasons: ['RSI(14) at 60.0 — bullish momentum (above 55)', '10-day momentum at +2.00% — strong upward move'],
};

const ML_DIRECTION: DirectionResult = {
  direction: 'bearish',
  confidence: 0.517,
  modelDataThrough: '2026-08-01',
};

describe('DirectionSignal — technical signal (shown for every market)', () => {
  it('renders the technical direction, confidence, and every reason when present', () => {
    render(
      <DirectionSignal
        status="error"
        direction={null}
        technicalSignalStatus="ready"
        technicalSignal={TECHNICAL_SIGNAL}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Technical Directional Signal')).toBeInTheDocument();
    expect(screen.getByText('bullish')).toBeInTheDocument();
    // confidence 0.6 -> (0.6*100).toFixed(0) = "60"
    expect(screen.getByText('60% agreement')).toBeInTheDocument();
    for (const reason of TECHNICAL_SIGNAL.reasons) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  });

  it('does not render a reasons list when reasons is empty', () => {
    render(
      <DirectionSignal
        status="error"
        direction={null}
        technicalSignalStatus="ready"
        technicalSignal={{ ...TECHNICAL_SIGNAL, reasons: [] }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Technical Directional Signal')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('DirectionSignal — ML signal (XAU only)', () => {
  it('renders the ML direction and confidence when status is ready', () => {
    render(
      <DirectionSignal
        status="ready"
        direction={ML_DIRECTION}
        technicalSignalStatus="error"
        technicalSignal={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('ML Direction Signal (5-day horizon)')).toBeInTheDocument();
    expect(screen.getByText('bearish')).toBeInTheDocument();
    // confidence 0.517 -> (0.517*100).toFixed(1) = "51.7"
    expect(screen.getByText('51.7% confidence')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
  });

  it('does not render the ML block when status is error, even if a stale direction value is passed', () => {
    render(
      <DirectionSignal
        status="error"
        direction={ML_DIRECTION}
        technicalSignalStatus="ready"
        technicalSignal={TECHNICAL_SIGNAL}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByText('ML Direction Signal (5-day horizon)')).toBeNull();
    // Technical signal (a different market/section) still renders independently.
    expect(screen.getByText('Technical Directional Signal')).toBeInTheDocument();
  });
});

describe('DirectionSignal — both signals together', () => {
  it('renders both the technical and ML blocks when both are ready', () => {
    render(
      <DirectionSignal
        status="ready"
        direction={ML_DIRECTION}
        technicalSignalStatus="ready"
        technicalSignal={TECHNICAL_SIGNAL}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Technical Directional Signal')).toBeInTheDocument();
    expect(screen.getByText('ML Direction Signal (5-day horizon)')).toBeInTheDocument();
  });
});

describe('DirectionSignal — loading and error states', () => {
  it('shows a loading skeleton when both statuses are loading', () => {
    const { container } = render(
      <DirectionSignal status="loading" direction={null} technicalSignalStatus="loading" technicalSignal={null} onRetry={vi.fn()} />,
    );

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText('Technical Directional Signal')).toBeNull();
  });

  it('shows an error message with a retry button when neither signal is available', () => {
    const onRetry = vi.fn();
    render(
      <DirectionSignal
        status="error"
        direction={null}
        technicalSignalStatus="error"
        technicalSignal={null}
        technicalSignalError="Technical signal is unavailable right now."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Technical signal is unavailable right now.')).toBeInTheDocument();
    screen.getByText('Retry').click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
