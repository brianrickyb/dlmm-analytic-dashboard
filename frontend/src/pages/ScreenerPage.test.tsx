import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScreenerPage } from './ScreenerPage';
import type { MajorsResponse, PumpCandidate, TrendingCoin } from '../types/screener';

const apiMocks = vi.hoisted(() => ({
  fetchMajors: vi.fn(),
  fetchTrending: vi.fn(),
  fetchPumpWatch: vi.fn(),
}));

vi.mock('../lib/api/screener', () => apiMocks);

vi.mock('../components/TradingViewTickerTape', () => ({
  TradingViewTickerTape: () => <div data-testid="ticker-tape-placeholder" />,
}));

function makeMajors(): MajorsResponse {
  return {
    pairs: [
      { symbol: 'BTCUSDT', buyRatio: 0.6, sellRatio: 0.4, fundingRate: 0.0001, price24hPct: 1.2, sparkline: [100, 101, 102] },
      { symbol: 'ETHUSDT', buyRatio: 0.4, sellRatio: 0.6, fundingRate: -0.0002, price24hPct: -0.8, sparkline: [50, 49, 48] },
    ],
    topLongSymbols: ['BTCUSDT'],
    topShortSymbols: ['ETHUSDT'],
  };
}

function makeTrending(): TrendingCoin[] {
  return [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', marketCapRank: 1, priceUsd: 63000, priceChangePct24h: -2.1, sparkline: [1, 2, 3] },
    { id: 'some-dog-coin', name: 'DogCoin', symbol: 'DOG', marketCapRank: null, priceUsd: 0.001, priceChangePct24h: 40, sparkline: [1, 2] },
  ];
}

function makePumpWatch(): PumpCandidate[] {
  return [
    {
      poolId: 'a', network: 'solana', dex: 'raydium', symbol: 'FOO', priceChangePct6h: 40,
      volumeUsd24h: 100_000, poolCreatedAt: '2026-08-30T00:00:00Z', poolUrl: 'https://example.com/a', news: null,
    },
  ];
}

function renderPage() {
  apiMocks.fetchMajors.mockResolvedValue(makeMajors());
  apiMocks.fetchTrending.mockResolvedValue(makeTrending());
  apiMocks.fetchPumpWatch.mockResolvedValue(makePumpWatch());
  return render(<ScreenerPage />);
}

describe('ScreenerPage — search filter', () => {
  it('shows every panel with its rows once data loads', async () => {
    renderPage();

    expect(await screen.findByText('BTCUSDT')).toBeInTheDocument();
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('DOG')).toBeInTheDocument();
    expect(screen.getByText('FOO')).toBeInTheDocument();
  });

  it('filters rows in all three panels by symbol as the user types', async () => {
    renderPage();
    await screen.findByText('BTCUSDT');

    const search = screen.getByRole('searchbox', { name: /search symbol/i });
    fireEvent.change(search, { target: { value: 'btc' } });

    await waitFor(() => {
      expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
      expect(screen.queryByText('ETHUSDT')).not.toBeInTheDocument();
      expect(screen.getByText('BTC')).toBeInTheDocument();
      expect(screen.queryByText('DOG')).not.toBeInTheDocument();
      expect(screen.queryByText('FOO')).not.toBeInTheDocument();
    });
  });
});
