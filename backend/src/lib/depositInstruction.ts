import { BorshInstructionCoder } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';

// Deliberately excludes add_liquidity_one_side / add_liquidity_by_strategy_one_side /
// add_liquidity_one_side_precise(2): these decode to a different shape (a single
// `amount` field, or an outer `parameter` key instead of `liquidity_parameter`, or a
// compressed `bins[]` array) that this function doesn't parse. A position whose only
// deposit used one of these returns null here — deriveCostBasis's caller already
// treats that as "cost basis unavailable" rather than extracting a wrong number.
const DEPOSIT_INSTRUCTION_NAMES = new Set([
  'add_liquidity',
  'add_liquidity2',
  'add_liquidity_by_strategy',
  'add_liquidity_by_strategy2',
  'add_liquidity_by_weight',
  'add_liquidity_by_weight2',
]);

export interface DepositInstructionAmounts {
  amountX: string;
  amountY: string;
  activeId: number | null;
}

export interface DepositMessage {
  instructions: { programIdIndex: number; accounts: number[]; data: string }[];
  accountKeys: PublicKey[];
}

interface IdlInstructionDef {
  name: string;
  accounts: { name: string }[];
}

interface DlmmIdl {
  instructions: IdlInstructionDef[];
}

interface LiquidityParameter {
  amount_x: { toString(): string };
  amount_y: { toString(): string };
  active_id?: number;
}

export function parseDepositFromMessage(
  message: DepositMessage,
  options: { idl: unknown; programId: string; positionAddress: string },
): DepositInstructionAmounts | null {
  // getTransaction can return a versioned (v0) transaction whose message is
  // MessageV0 (.compiledInstructions/.staticAccountKeys), not the legacy
  // Message shape (.instructions/.accountKeys) this function decodes. This
  // app's own build-tx flow only ever creates legacy transactions, but a
  // position's earliest deposit could have come from Meteora's own UI, which
  // may use versioned transactions. Full versioned support would need
  // address-lookup-table resolution — out of scope here — so this is a
  // defensive guard: treat a non-legacy message as "cost basis unavailable"
  // rather than throwing (which the caller would otherwise misreport as a
  // Solana RPC outage instead of a clean "unavailable").
  if (!Array.isArray(message.instructions) || !Array.isArray(message.accountKeys)) return null;

  const idl = options.idl as DlmmIdl;
  const coder = new BorshInstructionCoder(options.idl as never);

  for (const ix of message.instructions) {
    const programId = message.accountKeys[ix.programIdIndex];
    if (!programId || programId.toBase58() !== options.programId) continue;

    const decoded = coder.decode(ix.data, 'base58');
    if (!decoded || !DEPOSIT_INSTRUCTION_NAMES.has(decoded.name)) continue;

    const idlIx = idl.instructions.find((i) => i.name === decoded.name);
    if (!idlIx) continue;
    const positionIndex = idlIx.accounts.findIndex((a) => a.name === 'position');
    if (positionIndex === -1) continue;

    const positionAccountKey = message.accountKeys[ix.accounts[positionIndex]];
    if (!positionAccountKey || positionAccountKey.toBase58() !== options.positionAddress) continue;

    const data = decoded.data as Record<string, unknown>;
    const params = data.liquidity_parameter as LiquidityParameter | undefined;
    if (!params || params.amount_x === undefined || params.amount_y === undefined) continue;

    return {
      amountX: params.amount_x.toString(),
      amountY: params.amount_y.toString(),
      activeId: typeof params.active_id === 'number' ? params.active_id : null,
    };
  }

  return null;
}
