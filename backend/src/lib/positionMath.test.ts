import { describe, expect, it } from 'vitest';
import { computePositionSummary, getPricePerToken } from './positionMath.js';

describe('getPricePerToken', () => {
  it('is 1 at bin 0 when both tokens have equal decimals', () => {
    expect(getPricePerToken(0, 10, 6, 6)).toBeCloseTo(1, 10);
  });

  it('adjusts for a decimals difference between token X and token Y', () => {
    // binStep 10 (0.10%), binId 0 -> raw price 1; decimalsX=9 (SOL), decimalsY=6 (USDC)
    // -> pricePerToken = 1 * 10^(9-6) = 1000
    expect(getPricePerToken(0, 10, 9, 6)).toBeCloseTo(1000, 6);
  });

  it('compounds binStep by binId, matching (1 + binStep/10000)^binId', () => {
    const price = getPricePerToken(100, 10, 6, 6);
    expect(price).toBeCloseTo(Math.pow(1.001, 100), 10);
  });
});

describe('computePositionSummary', () => {
  it('computes decimals-adjusted liquidity, fees, and prices for an in-range position', () => {
    const summary = computePositionSummary({
      lowerBinId: -100,
      upperBinId: 100,
      activeId: 0,
      binStep: 10,
      decimalsX: 9,
      decimalsY: 6,
      totalXAmount: String(5 * 10 ** 9), // 5 tokens of X
      totalYAmount: String(500 * 10 ** 6), // 500 tokens of Y
      feeX: String(0.01 * 10 ** 9),
      feeY: String(1 * 10 ** 6),
    });

    expect(summary.lowerBinId).toBe(-100);
    expect(summary.upperBinId).toBe(100);
    expect(summary.activeBinId).toBe(0);
    expect(summary.currentPrice).toBeCloseTo(1000, 6); // bin 0, decimals 9 vs 6
    expect(summary.liquidity.xAmount).toBeCloseTo(5, 10);
    expect(summary.liquidity.yAmount).toBeCloseTo(500, 10);
    // valueInQuote = xAmount * currentPrice + yAmount = 5*1000 + 500 = 5500
    expect(summary.liquidity.valueInQuote).toBeCloseTo(5500, 6);
    expect(summary.fees.xAmount).toBeCloseTo(0.01, 10);
    expect(summary.fees.yAmount).toBeCloseTo(1, 10);
    // feesValueInQuote = 0.01*1000 + 1 = 11
    expect(summary.fees.valueInQuote).toBeCloseTo(11, 6);
  });

  it('computes lowerPrice/upperPrice from the bin range, independent of the active bin', () => {
    const summary = computePositionSummary({
      lowerBinId: 50,
      upperBinId: 150,
      activeId: 100,
      binStep: 10,
      decimalsX: 6,
      decimalsY: 6,
      totalXAmount: '0',
      totalYAmount: '0',
      feeX: '0',
      feeY: '0',
    });

    expect(summary.lowerPrice).toBeCloseTo(Math.pow(1.001, 50), 10);
    expect(summary.upperPrice).toBeCloseTo(Math.pow(1.001, 150), 10);
    expect(summary.currentPrice).toBeCloseTo(Math.pow(1.001, 100), 10);
  });
});
