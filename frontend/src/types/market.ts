export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketMeta {
  key: string;
  pair: string;
  label: string;
}

/** Deterministic technical readout computed backend-side from daily closes. */
export interface TechnicalReadout {
  /** RSI(14), Wilder smoothing; null while the series is shorter than the warmup. */
  rsi14: number | null;
  /** SMA(10) - SMA(50); sign encodes the crossover state. Null during warmup. */
  maCrossover: number | null;
  /** Percent change over the last 10 daily closes. Null during warmup. */
  momentum10Pct: number | null;
  /** Std-dev of the last 14 daily log returns, in percent. Null during warmup. */
  volatility14Pct: number | null;
}

export interface DirectionResult {
  direction: 'bullish' | 'bearish';
  confidence: number;
  /** Date (YYYY-MM-DD) of the newest row in the model's training data, when reported. */
  modelDataThrough?: string;
}

/** Deterministic directional signal from technical indicators. */
export interface TechnicalSignalResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasons: string[];
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
  market: MarketMeta;
  price: PriceRow | null;
  freshness: PriceFreshness;
  technical: SectionResult<TechnicalReadout>;
  technicalSignal: SectionResult<TechnicalSignalResult>;
  direction: SectionResult<DirectionResult>;
  news: SectionResult<MarketNewsPost[]>;
  fundamentals: SectionResult<FredSummary>;
}
