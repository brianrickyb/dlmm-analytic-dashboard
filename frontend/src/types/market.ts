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

export type SectionResult<T> = { data: T; error?: undefined } | { data: null; error: string };

export interface MarketSignalResponse {
  price: PriceRow | null;
  direction: SectionResult<DirectionResult>;
  news: SectionResult<MarketNewsPost[]>;
  fundamentals: SectionResult<FredSummary>;
}
