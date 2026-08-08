export interface Position {
  id: string;
  walletAddress: string;
  poolAddress: string;
  txSignature: string;
  createdAt: string;
}

export interface BuildTxResponse {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
}
