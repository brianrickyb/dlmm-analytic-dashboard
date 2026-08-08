import { createRequire } from 'node:module';
import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import type BN from 'bn.js';

// @meteora-ag/dlmm@1.9.14 ships a broken dist/index.d.ts (raw JS/IDL data
// leaked into the type declarations, breaking TS's parse of the DLMM class)
// AND a broken ESM entry (dist/index.mjs throws ERR_UNSUPPORTED_DIR_IMPORT on
// an @coral-xyz/anchor subpath at import time). The CJS build (dist/index.js)
// works correctly at runtime; createRequire loads that build directly,
// sidestepping both bugs. Minimal hand-written types below cover only the
// surface this project actually calls.
const require = createRequire(import.meta.url);

export enum StrategyType {
  Spot = 0,
  Curve = 1,
  BidAsk = 2,
}

export interface InitializePositionAndAddLiquidityParams {
  positionPubKey: PublicKey;
  totalXAmount: BN;
  totalYAmount: BN;
  strategy: { minBinId: number; maxBinId: number; strategyType: StrategyType };
  user: PublicKey;
  slippage?: number;
}

export interface DlmmPool {
  initializePositionAndAddLiquidityByStrategy(params: InitializePositionAndAddLiquidityParams): Promise<Transaction>;
}

export interface OnChainLbPosition {
  publicKey: PublicKey;
}

export interface OnChainPositionInfo {
  lbPairPositionsData: OnChainLbPosition[];
}

interface DlmmStatic {
  create(connection: Connection, poolAddress: PublicKey): Promise<DlmmPool>;
  getAllLbPairPositionsByUser(connection: Connection, userPubKey: PublicKey): Promise<Map<string, OnChainPositionInfo>>;
}

export function loadDlmmSdk(): DlmmStatic {
  return require('@meteora-ag/dlmm') as DlmmStatic;
}
