export interface PairPositioning {
  symbol: string;
  buyRatio: number;
  sellRatio: number;
  fundingRate: number;
  price24hPct: number;
  sparkline: number[];
}

export interface MajorsResponse {
  pairs: PairPositioning[];
  topLongSymbols: string[];
  topShortSymbols: string[];
}

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  marketCapRank: number | null;
  priceUsd: number;
  priceChangePct24h: number;
  sparkline: number[];
}

export interface NewsMatch {
  title: string;
  url: string;
  publishedAt: string;
}

export interface PumpCandidate {
  poolId: string;
  network: string;
  dex: string;
  symbol: string;
  priceChangePct6h: number;
  volumeUsd24h: number;
  poolCreatedAt: string;
  poolUrl: string;
  news: NewsMatch | null;
}
