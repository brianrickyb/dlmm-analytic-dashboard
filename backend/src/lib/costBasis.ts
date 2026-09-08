import type { PublicKey } from '@solana/web3.js';
import { getPricePerToken } from './positionMath.js';
import { parseDepositFromMessage, type DepositMessage } from './depositInstruction.js';

const SIGNATURE_PAGE_LIMIT = 1000;

export interface CostBasisResult {
  entryDate: string;
  entryPrice: number;
  depositXAmount: number;
  depositYAmount: number;
  txSignature: string;
}

export interface CostBasisConnection {
  getSignaturesForAddress(address: PublicKey, options: { limit: number }): Promise<{ signature: string }[]>;
  getTransaction(
    signature: string,
    options: { maxSupportedTransactionVersion: number },
  ): Promise<{ blockTime: number | null; transaction: { message: DepositMessage } } | null>;
}

export interface PoolHistoryPoint {
  snapshotAt: string;
  currentPrice: number;
}

export interface DeriveCostBasisDeps {
  connection: CostBasisConnection;
  getPoolHistory: (poolAddress: string, days: number) => Promise<PoolHistoryPoint[]>;
  now?: () => number;
}

export interface DeriveCostBasisInput {
  positionAddress: string;
  poolAddress: string;
  programId: string;
  idl: unknown;
  binStep: number;
  decimalsX: number;
  decimalsY: number;
}

function toUtcDay(blockTimeSeconds: number): string {
  return new Date(blockTimeSeconds * 1000).toISOString().slice(0, 10);
}

export async function deriveCostBasis(deps: DeriveCostBasisDeps, input: DeriveCostBasisInput): Promise<CostBasisResult | null> {
  const now = deps.now ?? Date.now;
  const { PublicKey } = await import('@solana/web3.js');

  const signatures = await deps.connection.getSignaturesForAddress(new PublicKey(input.positionAddress), {
    limit: SIGNATURE_PAGE_LIMIT,
  });
  if (signatures.length === 0 || signatures.length >= SIGNATURE_PAGE_LIMIT) return null;

  const oldest = signatures[signatures.length - 1];
  const tx = await deps.connection.getTransaction(oldest.signature, { maxSupportedTransactionVersion: 0 });
  if (!tx || tx.blockTime == null) return null;

  const deposit = parseDepositFromMessage(tx.transaction.message, {
    idl: input.idl,
    programId: input.programId,
    positionAddress: input.positionAddress,
  });
  if (!deposit) return null;

  const entryDate = toUtcDay(tx.blockTime);
  const depositXAmount = Number(deposit.amountX) / 10 ** input.decimalsX;
  const depositYAmount = Number(deposit.amountY) / 10 ** input.decimalsY;

  let entryPrice: number;
  if (deposit.activeId !== null) {
    entryPrice = getPricePerToken(deposit.activeId, input.binStep, input.decimalsX, input.decimalsY);
  } else {
    const daysSinceEntry = Math.ceil((now() - Date.parse(`${entryDate}T00:00:00Z`)) / (24 * 60 * 60 * 1000)) + 2;
    const history = await deps.getPoolHistory(input.poolAddress, Math.max(daysSinceEntry, 1));
    const snapshot = history.find((s) => s.snapshotAt.slice(0, 10) === entryDate);
    if (!snapshot) return null;
    entryPrice = snapshot.currentPrice;
  }

  return { entryDate, entryPrice, depositXAmount, depositYAmount, txSignature: oldest.signature };
}
