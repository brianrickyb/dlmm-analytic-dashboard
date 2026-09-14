import { describe, expect, it } from 'vitest';
import { computePositionPnl } from './positionPnl';
import type { Position, PositionCostBasis } from '../types/liquidity';

function position(overrides: Partial<Position> = {}): Position {
  return {
    poolAddress: 'pool1',
    positionAddress: 'pos1',
    lowerBinId: -100,
    upperBinId: 100,
    activeBinId: 0,
    currentPrice: 115,
    lowerPrice: 90,
    upperPrice: 120,
    liquidity: { xAmount: 50, yAmount: 5000, valueInQuote: 10750 },
    fees: { xAmount: 0, yAmount: 45, valueInQuote: 45 },
    ...overrides,
  };
}

function costBasis(overrides: Partial<PositionCostBasis> = {}): PositionCostBasis {
  return { entryDate: '2026-01-01', entryPrice: 100, depositXAmount: 50, depositYAmount: 5000, txSignature: 'sig', ...overrides };
}

describe('computePositionPnl', () => {
  it('matches the hand-derived il.ts/yield.ts reference numbers (entry 100 -> current 115, range [90,120], deposit $10,000-equivalent)', () => {
    const result = computePositionPnl(position(), costBasis());

    // Same inputs as il.test.ts/yield.test.ts's hand-verified example: IL ~ -1.819%.
    expect(result.impermanentLossPct).toBeCloseTo(-1.819, 2);
    // depositValueQuote = 50*100 + 5000 = 10000
    expect(result.depositValueQuote).toBeCloseTo(10_000, 6);
    // netYieldQuote = feesEarned(45) - impermanentLossValue(~181.9) ~ -136.9
    expect(result.netYieldQuote).toBeCloseTo(45 - 181.9, 0);
    expect(result.netYieldPct).toBeCloseTo(((45 - 181.9) / 10_000) * 100, 1);
  });

  it('produces zero IL and netYield === feesEarned when current price equals entry price', () => {
    const result = computePositionPnl(position({ currentPrice: 100, fees: { xAmount: 0, yAmount: 20, valueInQuote: 20 } }), costBasis());

    expect(result.impermanentLossPct).toBeCloseTo(0, 6);
    expect(result.netYieldQuote).toBeCloseTo(20, 6);
  });
});
