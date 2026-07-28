export interface PairPositioning {
  symbol: string;
  buyRatio: number;
  sellRatio: number;
  fundingRate: number;
  price24hPct: number;
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
}
