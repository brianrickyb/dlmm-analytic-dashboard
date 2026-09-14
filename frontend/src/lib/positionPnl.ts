import { calculateRangeIL } from './il';
import { netYieldFromFees } from './yield';
import type { Position, PositionCostBasis } from '../types/liquidity';

export interface PositionPnl {
  impermanentLossPct: number;
  depositValueQuote: number;
  netYieldQuote: number;
  netYieldPct: number;
}

export function computePositionPnl(position: Position, costBasis: PositionCostBasis): PositionPnl {
  const il = calculateRangeIL({
    entryPrice: costBasis.entryPrice,
    currentPrice: position.currentPrice,
    lowerPrice: position.lowerPrice,
    upperPrice: position.upperPrice,
  });

  const depositValueQuote = costBasis.depositXAmount * costBasis.entryPrice + costBasis.depositYAmount;
  const { netYield, netYieldPct } = netYieldFromFees({
    feesEarned: position.fees.valueInQuote,
    depositValue: depositValueQuote,
    impermanentLossPct: il.impermanentLossPct,
  });

  return { impermanentLossPct: il.impermanentLossPct, depositValueQuote, netYieldQuote: netYield, netYieldPct };
}
