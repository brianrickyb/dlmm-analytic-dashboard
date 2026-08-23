import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketSignalPage } from './MarketSignalPage';
import type { MarketSignalResponse } from '../types/market';

const apiMocks = vi.hoisted(() => ({
  fetchMarketSignal: vi.fn(),
}));

vi.mock('../lib/api/markets', () => ({
  fetchMarketSignal: apiMocks.fetchMarketSignal,
}));

// The real TradingViewChart injects an external widget script; the page-level
// behavior under test here doesn't depend on it.
vi.mock('../components/TradingViewChart', () => ({
  TradingViewChart: () => <div data-testid="tradingview-placeholder" />,
}));

function makeSignal(overrides: Partial<MarketSignalResponse> = {}): MarketSignalResponse {
  return {
    price: {
      date: '2026-08-11',
      open: 4005,
      high: 4020,
      low: 4000,
      close: 4015,
      volume: 1100,
    },
    freshness: { asOf: '2026-08-11', stale: false },
    direction: { data: { direction: 'bullish', confidence: 0.7, modelDataThrough: '2026-01-30' } },
    news: { data: [] },
    fundamentals: { data: null, error: 'not fetched in this fixture' },
    ...overrides,
  };
}

describe('MarketSignalPage — price freshness', () => {
  it('shows the as-of date without a stale badge when the newest row is recent', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(makeSignal());

    render(<MarketSignalPage />);

    await waitFor(() => expect(screen.getByText(/As of 2026-08-11/)).toBeInTheDocument());
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
    // Model freshness is surfaced, never hidden.
    expect(screen.getByText(/Model trained on data through/)).toBeInTheDocument();
  });

  it('flags the spot price as stale when the backend says so', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(
      makeSignal({ freshness: { asOf: '2026-01-30', stale: true } }),
    );

    render(<MarketSignalPage />);

    // The badge must be visually distinct (uppercase styling) and present.
    const badge = await screen.findByText('stale');
    expect(badge).toBeInTheDocument();
    expect(screen.getByText(/As of 2026-01-30/)).toBeInTheDocument();
  });

  it('renders per-section errors when the whole request fails', async () => {
    apiMocks.fetchMarketSignal.mockRejectedValue(new Error('backend unreachable'));

    render(<MarketSignalPage />);

    // The page folds one failed fetch into every section's status, so the message
    // appears once per section (direction, fundamentals, news).
    await waitFor(() => expect(screen.getAllByText(/backend unreachable/)).toHaveLength(3));
  });
});
