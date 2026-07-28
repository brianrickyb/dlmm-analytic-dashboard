import type { TrendingCoin } from '../types/screener';
import { formatPercent } from '../lib/format';

interface TrendingWatchProps {
  status: 'loading' | 'error' | 'ready';
  coins: TrendingCoin[];
  errorMessage?: string;
  onRetry: () => void;
}

export function TrendingWatch({ status, coins, errorMessage, onRetry }: TrendingWatchProps) {
  if (status === 'loading') {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load trending coins.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded border px-3 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <p className="border-b px-4 py-2 text-xs" style={{ borderColor: 'var(--gridline)', color: 'var(--text-muted)' }}>
        Search-interest signal from CoinGecko — not a return-potential score. Sorted smallest/most speculative market
        cap first.
      </p>
      <ul>
        {coins.map((coin) => (
          <li
            key={coin.id}
            className="flex items-center justify-between px-4 py-2 text-sm"
            style={{ borderBottom: '1px solid var(--gridline)' }}
          >
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {coin.name}
              </span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{coin.symbol}</span>
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {coin.marketCapRank !== null ? `rank #${coin.marketCapRank}` : 'unranked'}
              </span>
            </div>
            <span
              className="tabular-nums font-medium"
              style={{ color: coin.priceChangePct24h >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
            >
              {formatPercent(coin.priceChangePct24h)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
