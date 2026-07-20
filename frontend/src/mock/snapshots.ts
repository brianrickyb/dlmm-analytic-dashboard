import type { PoolLatestStats, PoolSnapshot, PoolWithStats } from '../types/pool';
import { pools } from './pools';

const DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) so mock charts are stable across reloads. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PoolProfile {
  poolId: string;
  basePrice: number;
  baseTvlUsd: number;
  baseVolumeUsd: number;
  priceVolatility: number; // daily stdev as fraction of price
  activeBinBase: number;
}

const profiles: PoolProfile[] = [
  { poolId: 'pool-sol-usdc', basePrice: 165, baseTvlUsd: 4_200_000, baseVolumeUsd: 9_800_000, priceVolatility: 0.03, activeBinBase: 3120 },
  { poolId: 'pool-jup-usdc', basePrice: 0.85, baseTvlUsd: 1_100_000, baseVolumeUsd: 2_400_000, priceVolatility: 0.05, activeBinBase: 890 },
  { poolId: 'pool-bonk-sol', basePrice: 0.0000135, baseTvlUsd: 620_000, baseVolumeUsd: 900_000, priceVolatility: 0.08, activeBinBase: -410 },
  { poolId: 'pool-jlp-usdc', basePrice: 3.9, baseTvlUsd: 2_800_000, baseVolumeUsd: 1_200_000, priceVolatility: 0.015, activeBinBase: 1450 },
  { poolId: 'pool-jto-sol', basePrice: 0.0185, baseTvlUsd: 540_000, baseVolumeUsd: 980_000, priceVolatility: 0.06, activeBinBase: 210 },
  { poolId: 'pool-wif-sol', basePrice: 0.0145, baseTvlUsd: 780_000, baseVolumeUsd: 1_200_000, priceVolatility: 0.1, activeBinBase: -95 },
  { poolId: 'pool-pyth-usdc', basePrice: 0.32, baseTvlUsd: 410_000, baseVolumeUsd: 720_000, priceVolatility: 0.055, activeBinBase: 640 },
  { poolId: 'pool-jup-sol', basePrice: 0.0051, baseTvlUsd: 350_000, baseVolumeUsd: 610_000, priceVolatility: 0.06, activeBinBase: -1180 },
];

function generateSnapshots(profile: PoolProfile): PoolSnapshot[] {
  const rand = mulberry32(hashSeed(profile.poolId));
  const snapshots: PoolSnapshot[] = [];
  const now = Date.now();

  let price = profile.basePrice;
  let tvl = profile.baseTvlUsd;
  let volume = profile.baseVolumeUsd;
  let activeBin = profile.activeBinBase;

  for (let i = DAYS; i >= 0; i--) {
    const gaussian = (rand() + rand() + rand() - 1.5) / 1.5; // cheap approx normal in [-1,1]
    price = Math.max(price * (1 + gaussian * profile.priceVolatility), profile.basePrice * 0.2);
    tvl = Math.max(tvl * (1 + gaussian * 0.02 + (rand() - 0.5) * 0.015), profile.baseTvlUsd * 0.3);
    volume = Math.max(volume * (1 + (rand() - 0.5) * 0.25), profile.baseVolumeUsd * 0.15);
    activeBin += Math.round(gaussian * 6);

    const fees24hUsd = volume * (profileFeeRate(profile) + Math.abs(gaussian) * 0.0003);
    const feeApr24h = (fees24hUsd / tvl) * 365 * 100;

    snapshots.push({
      poolId: profile.poolId,
      snapshotAt: new Date(now - i * MS_PER_DAY).toISOString(),
      tvlUsd: round2(tvl),
      volume24hUsd: round2(volume),
      fees24hUsd: round2(fees24hUsd),
      feeApr24h: round2(feeApr24h),
      activeBinId: activeBin,
      currentPrice: price,
    });
  }

  return snapshots;
}

function profileFeeRate(profile: PoolProfile): number {
  const pool = pools.find((p) => p.id === profile.poolId);
  return (pool?.baseFeeBps ?? 20) / 10_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const snapshotsByPool = new Map<string, PoolSnapshot[]>(profiles.map((p) => [p.poolId, generateSnapshots(p)]));

export function getSnapshots(poolId: string): PoolSnapshot[] {
  return snapshotsByPool.get(poolId) ?? [];
}

export function getLatestStats(poolId: string): PoolLatestStats {
  const series = getSnapshots(poolId);
  const last = series[series.length - 1];
  return {
    poolId: last.poolId,
    snapshotAt: last.snapshotAt,
    tvlUsd: last.tvlUsd,
    volume24hUsd: last.volume24hUsd,
    fees24hUsd: last.fees24hUsd,
    feeApr24h: last.feeApr24h,
    activeBinId: last.activeBinId,
    currentPrice: last.currentPrice,
  };
}

export function getPoolsWithStats(): PoolWithStats[] {
  return pools.map((pool) => ({ ...pool, stats: getLatestStats(pool.id) }));
}
