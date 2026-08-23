export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DirectionResult {
  direction: 'bullish' | 'bearish';
  confidence: number;
  /** Date (YYYY-MM-DD) of the newest row in the model's training data, when reported. */
  modelDataThrough?: string;
}

export interface MlSentiment {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
}

export interface FredObservation {
  date: string;
  value: number;
}

export interface FredSummary {
  fedFundsRate: FredObservation | null;
  realYield10y: FredObservation | null;
  cpi: FredObservation | null;
  dollarIndex: FredObservation | null;
}

export interface MarketNewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  mlSentiment: MlSentiment | null;
}

export interface PriceFreshness {
  /** ISO date (YYYY-MM-DD) of the newest row behind `price`; null when there is no price. */
  asOf: string | null;
  /** True when that row is more than a week older than the server's current date. */
  stale: boolean;
}

export type SectionResult<T> = { data: T; error?: undefined } | { data: null; error: string };

export interface MarketSignalResponse {
  price: PriceRow | null;
  freshness: PriceFreshness;
  direction: SectionResult<DirectionResult>;
  news: SectionResult<MarketNewsPost[]>;
  fundamentals: SectionResult<FredSummary>;
}
