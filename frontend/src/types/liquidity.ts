export interface PositionAmounts {
  xAmount: number;
  yAmount: number;
  valueInQuote: number;
}

export interface Position {
  poolAddress: string;
  positionAddress: string;
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: PositionAmounts;
  fees: PositionAmounts;
}

export interface PositionCostBasis {
  entryDate: string;
  entryPrice: number;
  depositXAmount: number;
  depositYAmount: number;
  txSignature: string;
}

export interface BuildTxResponse {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
}
