import { describe, expect, it } from 'vitest';
import { calculateNetYield } from './yield';
import type { PoolSnapshot } from '../types/pool';

function snapshot(overrides: Partial<PoolSnapshot>): PoolSnapshot {
  return {
    poolId: 'test-pool',
    snapshotAt: '2026-01-01T00:00:00Z',
    tvlUsd: 1_000_000,
    volume24hUsd: 0,
    fees24hUsd: 0,
    feeApr24h: 0,
    activeBinId: 0,
    currentPrice: 100,
    ...overrides,
  };
}

// Range [90, 120]. Days 0,1,3,4 sit inside it; day 2 (price 130) is outside.
const SERIES: PoolSnapshot[] = [
  snapshot({ snapshotAt: '2026-01-01T00:00:00Z', currentPrice: 100, tvlUsd: 1_000_000, fees24hUsd: 1000 }),
  snapshot({ snapshotAt: '2026-01-02T00:00:00Z', currentPrice: 105, tvlUsd: 1_000_000, fees24hUsd: 1000 }),
  snapshot({ snapshotAt: '2026-01-03T00:00:00Z', currentPrice: 130, tvlUsd: 1_000_000, fees24hUsd: 1000 }),
  snapshot({ snapshotAt: '2026-01-04T00:00:00Z', currentPrice: 110, tvlUsd: 2_000_000, fees24hUsd: 2000 }),
  snapshot({ snapshotAt: '2026-01-05T00:00:00Z', currentPrice: 115, tvlUsd: 1_000_000, fees24hUsd: 1500 }),
];

describe('calculateNetYield — fee accrual only on in-range days', () => {
  it('counts days in range and sums fees proportional to the deposit share of that day\'s TVL', () => {
    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2026-01-01T00:00:00Z',
      lowerPrice: 90,
      upperPrice: 120,
      series: SERIES,
    });

    expect(result.daysHeld).toBe(5);
    expect(result.daysInRange).toBe(4); // day index 2 (price 130) is out of range

    // day0: 10000/1_000_000 * 1000 = 10
    // day1: 10000/1_000_000 * 1000 = 10
    // day2: out of range -> 0
    // day3: 10000/2_000_000 * 2000 = 10
    // day4: 10000/1_000_000 * 1500 = 15
    expect(result.feesEarnedUsd).toBeCloseTo(45, 6);
  });

  it('earns zero fees when every day is out of range', () => {
    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2026-01-01T00:00:00Z',
      lowerPrice: 1,
      upperPrice: 2, // far below every price in the series
      series: SERIES,
    });

    expect(result.daysInRange).toBe(0);
    expect(result.feesEarnedUsd).toBe(0);
  });
});

describe('calculateNetYield — net yield combines fees and IL correctly', () => {
  it('computes impermanentLossUsd and netYieldUsd consistent with calculateRangeIL', () => {
    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2026-01-01T00:00:00Z',
      lowerPrice: 90,
      upperPrice: 120,
      series: SERIES,
    });

    // Entry price 100, exit price 115, range [90,120] — hand-derived via the
    // concentrated-IL formula in il.ts: IL ≈ -1.819%.
    expect(result.impermanentLossPct).toBeCloseTo(-1.819, 2);
    expect(result.impermanentLossUsd).toBeCloseTo(181.9, 1);
    expect(result.netYieldUsd).toBeCloseTo(result.feesEarnedUsd - result.impermanentLossUsd, 6);
    expect(result.netYieldPct).toBeCloseTo((result.netYieldUsd / 10_000) * 100, 6);
  });
});

describe('calculateNetYield — entry date matching', () => {
  it('starts accrual from the snapshot exactly matching entryDate', () => {
    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2026-01-02T00:00:00Z', // matches day index 1 exactly
      lowerPrice: 90,
      upperPrice: 120,
      series: SERIES,
    });

    expect(result.daysHeld).toBe(4); // days 1..4, day 0 excluded
  });

  it('picks the first snapshot on or after an entryDate that falls between two snapshots', () => {
    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2026-01-01T12:00:00Z', // between day 0 and day 1
      lowerPrice: 90,
      upperPrice: 120,
      series: SERIES,
    });

    expect(result.daysHeld).toBe(4); // starts at day 1, same as matching day 1 exactly
  });

  it('treats an entryDate after every snapshot as just-entered (0 elapsed days, last snapshot only)', () => {
    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2099-01-01T00:00:00Z',
      lowerPrice: 90,
      upperPrice: 120,
      series: SERIES,
    });

    expect(result.daysHeld).toBe(1);
    expect(result.impermanentLossPct).toBeCloseTo(0, 10); // entry price === current price (same snapshot)
  });
});
