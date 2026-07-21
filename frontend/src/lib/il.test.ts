import { describe, expect, it } from 'vitest';
import { calculateRangeIL } from './il';

// A very wide range approximates an unbounded (classic constant-product) position —
// used to check the concentrated formula reduces to the textbook v2 IL formula.
const FULL_RANGE = { lowerPrice: 1e-6, upperPrice: 1e6 };

describe('calculateRangeIL — exact reference values', () => {
  it('is zero when price has not moved, regardless of range width', () => {
    expect(calculateRangeIL({ entryPrice: 100, currentPrice: 100, ...FULL_RANGE }).impermanentLossPct).toBeCloseTo(0, 10);
    expect(calculateRangeIL({ entryPrice: 100, currentPrice: 100, lowerPrice: 90, upperPrice: 110 }).impermanentLossPct).toBeCloseTo(0, 10);
  });

  it('matches the classic 2*sqrt(r)/(1+r) - 1 formula for a full-range position when price doubles', () => {
    // Textbook value for r=2: 2*sqrt(2)/3 - 1 ≈ -5.719%
    const result = calculateRangeIL({ entryPrice: 100, currentPrice: 200, ...FULL_RANGE });
    expect(result.inRange).toBe(true);
    expect(result.impermanentLossPct).toBeCloseTo(-5.719, 2);
  });

  it('matches the classic formula when price falls by half', () => {
    // r=0.5: 2*sqrt(0.5)/1.5 - 1 ≈ -5.719% (symmetric around r=1 for the classic formula)
    const result = calculateRangeIL({ entryPrice: 100, currentPrice: 50, ...FULL_RANGE });
    expect(result.impermanentLossPct).toBeCloseTo(-5.719, 2);
  });
});

describe('calculateRangeIL — range width amplifies loss', () => {
  it('produces a larger loss for a narrower range than a full range, at the same price move', () => {
    const wide = calculateRangeIL({ entryPrice: 100, currentPrice: 110, ...FULL_RANGE });
    const narrow = calculateRangeIL({ entryPrice: 100, currentPrice: 110, lowerPrice: 80, upperPrice: 125 });

    expect(wide.inRange).toBe(true);
    expect(narrow.inRange).toBe(true);
    expect(narrow.impermanentLossPct).toBeLessThan(wide.impermanentLossPct);
    expect(narrow.impermanentLossPct).toBeLessThan(0);
  });

  it('gets worse as the range narrows further, for a fixed price move', () => {
    const medium = calculateRangeIL({ entryPrice: 100, currentPrice: 110, lowerPrice: 70, upperPrice: 143 });
    const narrow = calculateRangeIL({ entryPrice: 100, currentPrice: 110, lowerPrice: 90, upperPrice: 111 });

    expect(narrow.impermanentLossPct).toBeLessThan(medium.impermanentLossPct);
  });
});

describe('calculateRangeIL — out of range above the upper bound', () => {
  it('is continuous at the upper boundary (no jump discontinuity)', () => {
    const atBoundary = calculateRangeIL({ entryPrice: 100, currentPrice: 110, lowerPrice: 90, upperPrice: 110 });
    const justAbove = calculateRangeIL({ entryPrice: 100, currentPrice: 110.0001, lowerPrice: 90, upperPrice: 110 });

    expect(atBoundary.inRange).toBe(true);
    expect(justAbove.inRange).toBe(false);
    expect(justAbove.impermanentLossPct).toBeCloseTo(atBoundary.impermanentLossPct, 2);
  });

  it('worsens monotonically the further price rises past the upper bound', () => {
    const near = calculateRangeIL({ entryPrice: 100, currentPrice: 120, lowerPrice: 90, upperPrice: 110 });
    const far = calculateRangeIL({ entryPrice: 100, currentPrice: 200, lowerPrice: 90, upperPrice: 110 });

    expect(near.inRange).toBe(false);
    expect(far.inRange).toBe(false);
    expect(far.impermanentLossPct).toBeLessThan(near.impermanentLossPct);
  });
});

describe('calculateRangeIL — out of range below the lower bound', () => {
  it('is continuous at the lower boundary (no jump discontinuity)', () => {
    const atBoundary = calculateRangeIL({ entryPrice: 100, currentPrice: 90, lowerPrice: 90, upperPrice: 110 });
    const justBelow = calculateRangeIL({ entryPrice: 100, currentPrice: 89.999, lowerPrice: 90, upperPrice: 110 });

    expect(atBoundary.inRange).toBe(true);
    expect(justBelow.inRange).toBe(false);
    expect(justBelow.impermanentLossPct).toBeCloseTo(atBoundary.impermanentLossPct, 2);
  });

  it('scales the frozen position value linearly with price once below the range', () => {
    const a = calculateRangeIL({ entryPrice: 100, currentPrice: 50, lowerPrice: 90, upperPrice: 110 });
    const b = calculateRangeIL({ entryPrice: 100, currentPrice: 25, lowerPrice: 90, upperPrice: 110 });

    expect(a.inRange).toBe(false);
    expect(b.inRange).toBe(false);
    // Below the range the position is 100% base asset, so lpValueRatio / priceRatio is constant.
    const ratioA = a.lpValueRatio / a.priceRatio;
    const ratioB = b.lpValueRatio / b.priceRatio;
    expect(ratioB).toBeCloseTo(ratioA, 10);
  });
});
