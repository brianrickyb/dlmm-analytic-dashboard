/**
 * Client-side mirror of the backend's MARKET_CONFIGS (backend/src/routes/markets.ts).
 * Keep the two lists in sync -- the backend is the source of truth for what a
 * slug returns; this list drives navigation and display only.
 */
export interface MarketOption {
  key: string;
  pair: string;
  label: string;
  /** TradingView symbol for the embedded chart widget. */
  tvSymbol: string;
  /** Currency the pair is quoted in, for correct spot-price formatting. */
  quoteCurrency: 'USD' | 'JPY';
}

export const DEFAULT_MARKET_KEY = 'xau';

export const MARKET_OPTIONS: MarketOption[] = [
  { key: 'xau', pair: 'XAU/USD', label: 'Gold', tvSymbol: 'OANDA:XAUUSD', quoteCurrency: 'USD' },
  { key: 'eurusd', pair: 'EUR/USD', label: 'Euro', tvSymbol: 'OANDA:EURUSD', quoteCurrency: 'USD' },
  { key: 'gbpusd', pair: 'GBP/USD', label: 'Pound', tvSymbol: 'OANDA:GBPUSD', quoteCurrency: 'USD' },
  { key: 'usdjpy', pair: 'USD/JPY', label: 'Yen', tvSymbol: 'OANDA:USDJPY', quoteCurrency: 'JPY' },
  { key: 'usdchf', pair: 'USD/CHF', label: 'Swiss Franc', tvSymbol: 'OANDA:USDCHF', quoteCurrency: 'USD' },
  { key: 'usdcad', pair: 'USD/CAD', label: 'Canadian Dollar', tvSymbol: 'OANDA:USDCAD', quoteCurrency: 'USD' },
  { key: 'audusd', pair: 'AUD/USD', label: 'Aussie', tvSymbol: 'OANDA:AUDUSD', quoteCurrency: 'USD' },
  { key: 'nzdusd', pair: 'NZD/USD', label: 'Kiwi', tvSymbol: 'OANDA:NZDUSD', quoteCurrency: 'USD' },
  { key: 'dxy', pair: 'DXY', label: 'Dollar Index', tvSymbol: 'TVC:DXY', quoteCurrency: 'USD' },
];

/** Resolves a route param; null when unknown so callers can redirect to the default. */
export function getMarketOption(key?: string): MarketOption | null {
  if (!key) return MARKET_OPTIONS.find((m) => m.key === DEFAULT_MARKET_KEY) ?? null;
  return MARKET_OPTIONS.find((m) => m.key === key.toLowerCase()) ?? null;
}
