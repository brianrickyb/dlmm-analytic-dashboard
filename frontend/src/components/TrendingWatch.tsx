import type { TrendingCoin } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
import { PillButton } from './PillButton';
import { ScreenerTable, type ScreenerColumn } from './ScreenerTable';
import { Sparkline } from './Sparkline';

interface TrendingWatchProps {
  status: 'loading' | 'error' | 'ready';
  coins: TrendingCoin[];
  errorMessage?: string;
  onRetry: () => void;
}

const columns: ScreenerColumn<TrendingCoin>[] = [
  {
    key: 'symbol',
    header: 'Coin',
    width: '1.6fr',
    render: (coin) => (
      <div>
        <span className="font-semibold" style={{ color: 'var(--text)' }}>
          {coin.symbol}
        </span>
        <span className="ml-1.5 text-xs" style={{ color: 'var(--muted)' }}>
          {coin.name} · {coin.marketCapRank !== null ? <Tooltip termKey="marketCapRank">rank #{coin.marketCapRank}</Tooltip> : 'unranked'}
        </span>
      </div>
    ),
  },
  {
    key: 'sparkline',
    header: '7d',
    width: '80px',
    render: (coin) => <Sparkline data={coin.sparkline} />,
  },
  {
    key: 'priceUsd',
    header: 'Price',
    align: 'right',
    sortable: true,
    sortValue: (coin) => coin.priceUsd,
    render: (coin) => (
      <span className="tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        ${coin.priceUsd < 1 ? coin.priceUsd.toFixed(6) : coin.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
    ),
  },
  {
    key: 'priceChangePct24h',
    header: '24h Change',
    align: 'right',
    sortable: true,
    sortValue: (coin) => coin.priceChangePct24h,
    render: (coin) => (
      <span
        className="tabular-nums font-semibold"
        style={{ color: coin.priceChangePct24h >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}
      >
        {formatPercent(coin.priceChangePct24h)}
      </span>
    ),
  },
];

export function TrendingWatch({ status, coins, errorMessage, onRetry }: TrendingWatchProps) {
  if (status === 'loading') {
    return (
      <div className="h-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Failed to load trending coins.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Search-interest signal from CoinGecko — not a return-potential score. Sorted smallest/most speculative market
        cap first.
      </p>
      <ScreenerTable columns={columns} rows={coins} rowKey={(coin) => coin.id} emptyMessage="No trending coins match your search." />
    </div>
  );
}
