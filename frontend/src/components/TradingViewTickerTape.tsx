import { useTradingViewWidget } from '../lib/useTradingViewWidget';
import { PillButton } from './PillButton';

const SCRIPT_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';

// The coins this dashboard actually cares about (Solana DLMM pools) plus gold, tying back to
// the Gold Signal page -- not a generic top-of-market list.
const SYMBOLS = [
  { proName: 'BINANCE:BTCUSDT', title: 'BTC' },
  { proName: 'BINANCE:ETHUSDT', title: 'ETH' },
  { proName: 'BINANCE:SOLUSDT', title: 'SOL' },
  { proName: 'OANDA:XAUUSD', title: 'Gold' },
];

// Matches the ticker tape widget's own rendered height, so the loading/error overlays below
// don't jump the layout once the widget settles.
const TICKER_HEIGHT = 46;

export function TradingViewTickerTape() {
  const { containerRef, status, retry } = useTradingViewWidget(SCRIPT_SRC, {
    symbols: SYMBOLS,
    colorTheme: 'dark',
    locale: 'en',
    isTransparent: false,
    displayMode: 'adaptive',
  });

  return (
    <div className="relative" style={{ height: `${TICKER_HEIGHT}px` }}>
      <div
        ref={containerRef}
        className="tradingview-widget-container h-full overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--border)', background: 'var(--card)', visibility: status === 'ready' ? 'visible' : 'hidden' }}
      />
      {status === 'loading' ? (
        <div className="absolute inset-0 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      ) : null}
      {status === 'error' ? (
        <div
          className="absolute inset-0 flex items-center justify-center gap-3 rounded-xl border px-4 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <p style={{ color: 'var(--red)' }}>Live ticker failed to load.</p>
          <PillButton onClick={retry} className="text-xs">
            Retry
          </PillButton>
        </div>
      ) : null}
    </div>
  );
}
