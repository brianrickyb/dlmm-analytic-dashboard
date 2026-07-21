import type { PoolSnapshot } from '../types/pool';
import { calculateRangeIL } from './il';

export interface NetYieldInput {
  depositUsd: number;
  entryDate: string; // ISO date, must match a snapshot in `series`
  lowerPrice: number;
  upperPrice: number;
  series: PoolSnapshot[]; // full snapshot history for the pool, chronological
}

export interface NetYieldResult {
  daysHeld: number;
  daysInRange: number;
  feesEarnedUsd: number;
  impermanentLossPct: number;
  impermanentLossUsd: number;
  netYieldUsd: number;
  netYieldPct: number;
}

/**
 * Fees are only earned on days the pool's active price sits inside the
 * simulated position's range — a bin-based LP earns nothing once price moves
 * out of its bins. Each day's share of pool fees is approximated by the
 * deposit's share of pool TVL that day (proportional-share approximation;
 * a real position's share also depends on exactly which bins it seeded).
 */
export function calculateNetYield({ depositUsd, entryDate, lowerPrice, upperPrice, series }: NetYieldInput): NetYieldResult {
  const entryIndex = series.findIndex((s) => s.snapshotAt >= entryDate);
  // If entryDate is after every snapshot we have, there's no history for this
  // position yet — treat it as "just entered as of the latest snapshot" (0
  // elapsed days) rather than silently backdating to the start of the series.
  const heldSnapshots = entryIndex >= 0 ? series.slice(entryIndex) : series.slice(-1);
  const entrySnapshot = heldSnapshots[0];

  let feesEarnedUsd = 0;
  let daysInRange = 0;

  for (const day of heldSnapshots) {
    const inRange = day.currentPrice >= lowerPrice && day.currentPrice <= upperPrice;
    if (inRange) {
      daysInRange += 1;
      const poolShare = depositUsd / day.tvlUsd;
      feesEarnedUsd += day.fees24hUsd * poolShare;
    }
  }

  const latest = series[series.length - 1];
  const il = calculateRangeIL({
    entryPrice: entrySnapshot.currentPrice,
    currentPrice: latest.currentPrice,
    lowerPrice,
    upperPrice,
  });

  const impermanentLossUsd = (depositUsd * -il.impermanentLossPct) / 100;
  const netYieldUsd = feesEarnedUsd - impermanentLossUsd;

  return {
    daysHeld: heldSnapshots.length,
    daysInRange,
    feesEarnedUsd,
    impermanentLossPct: il.impermanentLossPct,
    impermanentLossUsd,
    netYieldUsd,
    netYieldPct: (netYieldUsd / depositUsd) * 100,
  };
}
