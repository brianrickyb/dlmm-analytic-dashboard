import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';
import { loadDlmmSdk } from './dlmmSdk.js';
import { parseDepositFromMessage } from './depositInstruction.js';

const DLMM = loadDlmmSdk();
const coder = new BorshInstructionCoder(DLMM.IDL as never);
const PROGRAM_ID = PublicKey.unique();
const POSITION = PublicKey.unique();

// add_liquidity_by_strategy2's IDL account order: position, lb_pair,
// bin_array_bitmap_extension, user_token_x, user_token_y, reserve_x, reserve_y,
// token_x_mint, token_y_mint, sender, token_x_program, token_y_program,
// event_authority, program (14 accounts, position first).
function buildMessage(ixData: Buffer, positionAtIndex1: boolean) {
  const filler = Array.from({ length: 13 }, () => PublicKey.unique());
  const accountKeys = [PROGRAM_ID, positionAtIndex1 ? POSITION : PublicKey.unique(), ...filler];
  return {
    instructions: [
      {
        programIdIndex: 0,
        accounts: Array.from({ length: 14 }, (_, i) => i + 1),
        data: bs58.encode(ixData),
      },
    ],
    accountKeys,
  };
}

describe('parseDepositFromMessage', () => {
  it('extracts amountX/amountY/activeId from an add_liquidity_by_strategy2 instruction targeting this position', () => {
    const data = coder.encode('add_liquidity_by_strategy2', {
      liquidity_parameter: {
        amount_x: new BN(123_456_789),
        amount_y: new BN(987_654_321),
        active_id: -55,
        max_active_bin_slippage: 5,
        strategy_parameters: {
          min_bin_id: -100,
          max_bin_id: 100,
          strategy_type: { SpotBalanced: {} },
          parameteres: new Array(64).fill(0),
        },
      },
      remaining_accounts_info: { slices: [] },
    });
    const message = buildMessage(data, true);

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toEqual({ amountX: '123456789', amountY: '987654321', activeId: -55 });
  });

  it('returns null when the instruction targets a different position', () => {
    const data = coder.encode('add_liquidity_by_strategy2', {
      liquidity_parameter: {
        amount_x: new BN(1),
        amount_y: new BN(1),
        active_id: 0,
        max_active_bin_slippage: 5,
        strategy_parameters: { min_bin_id: -1, max_bin_id: 1, strategy_type: { SpotBalanced: {} }, parameteres: new Array(64).fill(0) },
      },
      remaining_accounts_info: { slices: [] },
    });
    const message = buildMessage(data, false);

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });

  it('returns activeId: null for the legacy add_liquidity2 variant, which has no active_id field', () => {
    const data = coder.encode('add_liquidity2', {
      liquidity_parameter: { amount_x: new BN(10), amount_y: new BN(20), bin_liquidity_dist: [] },
      remaining_accounts_info: { slices: [] },
    });
    const message = buildMessage(data, true);

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toEqual({ amountX: '10', amountY: '20', activeId: null });
  });

  it('ignores instructions from a different program', () => {
    const message = {
      instructions: [{ programIdIndex: 0, accounts: [1], data: bs58.encode(Buffer.from([1, 2, 3])) }],
      accountKeys: [PublicKey.unique(), POSITION],
    };

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(), // does not match accountKeys[0] above
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });

  it('returns null when no instruction in the message matches', () => {
    const result = parseDepositFromMessage({ instructions: [], accountKeys: [] }, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });

  it('returns null instead of throwing for a versioned (MessageV0) message, which has no instructions/accountKeys', () => {
    // MessageV0 exposes .compiledInstructions/.staticAccountKeys instead of the
    // legacy .instructions/.accountKeys this function decodes. Full versioned
    // support would need address-lookup-table resolution (out of scope); this
    // just confirms the mismatch is treated as "cost basis unavailable"
    // rather than throwing.
    const messageV0Shaped = { compiledInstructions: [], staticAccountKeys: [] } as unknown as Parameters<typeof parseDepositFromMessage>[0];

    const result = parseDepositFromMessage(messageV0Shaped, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });
});
