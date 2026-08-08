import type { TrendingCoin } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
import { PillButton } from './PillButton';

interface TrendingWatchProps {
  status: 'loading' | 'error' | 'ready';
  coins: TrendingCoin[];
  errorMessage?: string;
  onRetry: () => void;
}

export function TrendingWatch({ status, coins, errorMessage, onRetry }: TrendingWatchProps) {
  if (status === 'loading') {
    return (
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 w-40 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load trending coins.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Search-interest signal from CoinGecko — not a return-potential score. Sorted smallest/most speculative market
        cap first.
      </p>
      <div className="flex flex-wrap gap-2">
        {coins.map((coin) => (
          <div key={coin.id} className="min-w-[160px] rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {coin.symbol}
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: coin.priceChangePct24h >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
              >
                {formatPercent(coin.priceChangePct24h)}
              </span>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {coin.name} · {coin.marketCapRank !== null ? <Tooltip termKey="marketCapRank">rank #{coin.marketCapRank}</Tooltip> : 'unranked'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
