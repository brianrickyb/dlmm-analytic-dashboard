import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  TradingViewChart: ({ symbol }: { symbol: string }) => <div data-testid="tradingview-placeholder" data-symbol={symbol} />,
}));

function makeSignal(overrides: Partial<MarketSignalResponse> = {}): MarketSignalResponse {
  return {
    market: { key: 'xau', pair: 'XAU/USD', label: 'Gold' },
    price: {
      date: '2026-08-11',
      open: 4005,
      high: 4020,
      low: 4000,
      close: 4015,
      volume: 1100,
    },
    freshness: { asOf: '2026-08-11', stale: false },
    technical: {
      data: { rsi14: 61.2, maCrossover: 12.4, momentum10Pct: 1.8, volatility14Pct: 0.9 },
    },
    technicalSignal: {
      data: { direction: 'bullish', confidence: 0.75, reasons: ['RSI above 55', 'MA bullish crossover', '+1.8% momentum'] },
    },
    direction: { data: { direction: 'bullish', confidence: 0.7, modelDataThrough: '2026-01-30' } },
    news: { data: [] },
    fundamentals: { data: null, error: 'not fetched in this fixture' },
    ...overrides,
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/markets" element={<MarketSignalPage />} />
        <Route path="/markets/:symbol" element={<MarketSignalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MarketSignalPage — routing across markets', () => {
  it('renders every supported market as a switcher link with the active pair highlighted', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(makeSignal());

    renderAt('/markets/xau');

    const eurusdLink = await screen.findByRole('link', { name: 'EUR/USD' });
    expect(eurusdLink).toHaveAttribute('href', '/markets/eurusd');
    // aria-current marks the active market for assistive tech.
    expect(screen.getByRole('link', { name: 'XAU/USD' })).toHaveAttribute('aria-current', 'page');
  });

  it('fetches and displays the requested FX pair without the gold-only ML section', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(
      makeSignal({
        market: { key: 'eurusd', pair: 'EUR/USD', label: 'Euro' },
        direction: { data: null, error: 'The ML direction model is calibrated for XAU/USD only.' },
      }),
    );

    renderAt('/markets/eurusd');

    await waitFor(() => expect(apiMocks.fetchMarketSignal).toHaveBeenCalledWith('eurusd'));
    expect(screen.getByText('EUR/USD Market Signal')).toBeInTheDocument();
    // Gold's ML panel must not leak into FX pages.
    expect(screen.queryByText('ML Direction Signal')).not.toBeInTheDocument();
    expect(screen.getByText('Technical Readout')).toBeInTheDocument();
  });

  it('redirects unknown slugs to the default market instead of a dead end', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(makeSignal());

    renderAt('/markets/bogus');

    await waitFor(() => expect(screen.getByText('XAU/USD Market Signal')).toBeInTheDocument());
    expect(apiMocks.fetchMarketSignal).toHaveBeenCalledWith('xau');
  });
});

describe('MarketSignalPage — price freshness', () => {
  it('shows the as-of date without a stale badge when the newest row is recent', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(makeSignal());

    renderAt('/markets/xau');

    await waitFor(() => expect(screen.getByText(/As of 2026-08-11/)).toBeInTheDocument());
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
    // Model freshness is surfaced, never hidden.
    expect(screen.getByText(/Model trained on data through/)).toBeInTheDocument();
  });

  it('flags the spot price as stale when the backend says so', async () => {
    apiMocks.fetchMarketSignal.mockResolvedValue(
      makeSignal({ freshness: { asOf: '2026-01-30', stale: true } }),
    );

    renderAt('/markets/xau');

    // The badge must be visually distinct (uppercase styling) and present.
    const badge = await screen.findByText('stale');
    expect(badge).toBeInTheDocument();
    expect(screen.getByText(/As of 2026-01-30/)).toBeInTheDocument();
  });

  it('renders per-section errors when the whole request fails', async () => {
    apiMocks.fetchMarketSignal.mockRejectedValue(new Error('backend unreachable'));

    renderAt('/markets/xau');

    // The page folds one failed fetch into every section's status — on XAU that's
    // technicals, direction/technicalSignal (combined into one error), fundamentals, and news.
    await waitFor(() => expect(screen.getAllByText(/backend unreachable/)).toHaveLength(4));
  });
});
