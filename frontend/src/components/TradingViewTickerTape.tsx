import { useTradingViewWidget } from '../lib/useTradingViewWidget';

const SCRIPT_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';

// The coins this dashboard actually cares about (Solana DLMM pools) plus gold, tying back to
// the Gold Signal page -- not a generic top-of-market list.
const SYMBOLS = [
  { proName: 'BINANCE:BTCUSDT', title: 'BTC' },
  { proName: 'BINANCE:ETHUSDT', title: 'ETH' },
  { proName: 'BINANCE:SOLUSDT', title: 'SOL' },
  { proName: 'OANDA:XAUUSD', title: 'Gold' },
];

export function TradingViewTickerTape() {
  const containerRef = useTradingViewWidget(SCRIPT_SRC, {
    symbols: SYMBOLS,
    colorTheme: 'dark',
    locale: 'en',
    isTransparent: false,
    displayMode: 'adaptive',
  });

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    />
  );
}
