import { useTradingViewWidget } from '../lib/useTradingViewWidget';

const SCRIPT_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

interface TradingViewChartProps {
  symbol: string;
  height?: number;
}

export function TradingViewChart({ symbol, height = 480 }: TradingViewChartProps) {
  // TradingView's widget config renders inside a cross-origin iframe, so it can't read this
  // app's CSS custom properties -- these hex/rgba values are hand-picked to approximate the
  // dark-terminal palette in frontend/src/index.css (--card, --border), not a stray hardcoded
  // color that slipped past the token migration.
  const containerRef = useTradingViewWidget(SCRIPT_SRC, {
    autosize: true,
    symbol,
    interval: 'D',
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: 'en',
    backgroundColor: '#0d1410',
    gridColor: 'rgba(26, 43, 30, 0.5)',
    hide_top_toolbar: false,
    hide_legend: false,
    allow_symbol_change: false,
    support_host: 'https://www.tradingview.com',
  });

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--card)', height: `${height}px` }}
    />
  );
}
