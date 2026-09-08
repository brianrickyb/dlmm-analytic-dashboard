export function getPricePerToken(binId: number, binStep: number, decimalsX: number, decimalsY: number): number {
  const rawPrice = Math.pow(1 + binStep / 10_000, binId);
  return rawPrice * Math.pow(10, decimalsX - decimalsY);
}

export interface PositionAmounts {
  xAmount: number;
  yAmount: number;
  valueInQuote: number;
}

export interface PositionSummary {
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: PositionAmounts;
  fees: PositionAmounts;
}

export interface ComputePositionSummaryInput {
  lowerBinId: number;
  upperBinId: number;
  activeId: number;
  binStep: number;
  decimalsX: number;
  decimalsY: number;
  totalXAmount: string;
  totalYAmount: string;
  feeX: string;
  feeY: string;
}

function toAmounts(rawX: string, rawY: string, decimalsX: number, decimalsY: number, currentPrice: number): PositionAmounts {
  const xAmount = Number(rawX) / 10 ** decimalsX;
  const yAmount = Number(rawY) / 10 ** decimalsY;
  return { xAmount, yAmount, valueInQuote: xAmount * currentPrice + yAmount };
}

export function computePositionSummary(input: ComputePositionSummaryInput): PositionSummary {
  const currentPrice = getPricePerToken(input.activeId, input.binStep, input.decimalsX, input.decimalsY);
  const lowerPrice = getPricePerToken(input.lowerBinId, input.binStep, input.decimalsX, input.decimalsY);
  const upperPrice = getPricePerToken(input.upperBinId, input.binStep, input.decimalsX, input.decimalsY);

  return {
    lowerBinId: input.lowerBinId,
    upperBinId: input.upperBinId,
    activeBinId: input.activeId,
    currentPrice,
    lowerPrice,
    upperPrice,
    liquidity: toAmounts(input.totalXAmount, input.totalYAmount, input.decimalsX, input.decimalsY, currentPrice),
    fees: toAmounts(input.feeX, input.feeY, input.decimalsX, input.decimalsY, currentPrice),
  };
}
