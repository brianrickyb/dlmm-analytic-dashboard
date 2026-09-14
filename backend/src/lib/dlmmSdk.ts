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
//
// package.json pins this dependency to an EXACT version (no ^) on purpose:
// the interfaces below are asserted (`as DlmmStatic`), not checked against
// the package's own (broken) types, so a version bump can't be caught by the
// compiler — only dlmmSdk.test.ts's smoke test and re-running the constant/
// method-shape verification this file's history depended on. Upgrading is a
// deliberate act, not an incidental `npm update`.
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

export interface OnChainPositionData {
  lowerBinId: number;
  upperBinId: number;
  totalXAmount: string;
  totalYAmount: string;
  feeX: BN;
  feeY: BN;
  totalClaimedFeeXAmount: BN;
  totalClaimedFeeYAmount: BN;
}

export interface OnChainLbPosition {
  publicKey: PublicKey;
  positionData: OnChainPositionData;
}

export interface OnChainTokenInfo {
  mint: { decimals: number };
}

export interface OnChainLbPair {
  activeId: number;
  binStep: number;
}

export interface OnChainPositionInfo {
  lbPair: OnChainLbPair;
  tokenX: OnChainTokenInfo;
  tokenY: OnChainTokenInfo;
  lbPairPositionsData: OnChainLbPosition[];
}

interface DlmmStatic {
  create(connection: Connection, poolAddress: PublicKey): Promise<DlmmPool>;
  getAllLbPairPositionsByUser(connection: Connection, userPubKey: PublicKey): Promise<Map<string, OnChainPositionInfo>>;
  IDL: unknown;
  LBCLMM_PROGRAM_IDS: Record<string, string>;
}

export function loadDlmmSdk(): DlmmStatic {
  return require('@meteora-ag/dlmm') as DlmmStatic;
}
