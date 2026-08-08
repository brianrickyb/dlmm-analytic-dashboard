export interface Position {
  poolAddress: string;
  positionAddress: string;
}

export interface BuildTxResponse {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
}
