export type Strategy = 'Spot' | 'Curve' | 'BidAsk';

export interface Token {
  mintAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

export interface Pool {
  id: string;
  poolAddress: string;
  name: string;
  tokenX: Token;
  tokenY: Token;
  binStep: number;
  baseFeeBps: number;
  isActive: boolean;
}

/** Mirrors pool_latest_stats — denormalized "current state" row. */
export interface PoolLatestStats {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  activeBinId: number;
  currentPrice: number;
}

export interface PoolWithStats extends Pool {
  stats: PoolLatestStats;
}

/** Mirrors one row of pool_snapshots — a single point on the history chart. */
export interface PoolSnapshot {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  activeBinId: number;
  currentPrice: number;
}
