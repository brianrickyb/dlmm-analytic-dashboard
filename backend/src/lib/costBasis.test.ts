import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { describe, expect, it, vi } from 'vitest';
import { loadDlmmSdk } from './dlmmSdk.js';
import { deriveCostBasis } from './costBasis.js';

const DLMM = loadDlmmSdk();
const coder = new BorshInstructionCoder(DLMM.IDL as never);
const PROGRAM_ID = PublicKey.unique();
const POSITION = PublicKey.unique();
const POOL = 'poolAddress111111111111111111111111111111';

function depositMessage(activeId: number | null) {
  const data = activeId === null
    ? coder.encode('add_liquidity2', {
        liquidity_parameter: { amount_x: new BN(5_000_000_000), amount_y: new BN(500_000_000), bin_liquidity_dist: [] },
        remaining_accounts_info: { slices: [] },
      })
    : coder.encode('add_liquidity_by_strategy2', {
        liquidity_parameter: {
          amount_x: new BN(5_000_000_000),
          amount_y: new BN(500_000_000),
          active_id: activeId,
          max_active_bin_slippage: 5,
          strategy_parameters: { min_bin_id: -100, max_bin_id: 100, strategy_type: { SpotBalanced: {} }, parameteres: new Array(64).fill(0) },
        },
        remaining_accounts_info: { slices: [] },
      });
  const filler = Array.from({ length: 13 }, () => PublicKey.unique());
  return {
    instructions: [{ programIdIndex: 0, accounts: Array.from({ length: 14 }, (_, i) => i + 1), data: bs58.encode(data) }],
    accountKeys: [PROGRAM_ID, POSITION, ...filler],
  };
}

const BASE_INPUT = {
  positionAddress: POSITION.toBase58(),
  poolAddress: POOL,
  programId: PROGRAM_ID.toBase58(),
  idl: DLMM.IDL,
  binStep: 10,
  decimalsX: 9,
  decimalsY: 6,
};

describe('deriveCostBasis', () => {
  it('derives entry price from the deposit instruction\'s own active_id, without calling getPoolHistory', async () => {
    const getPoolHistory = vi.fn();
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'newest' }, { signature: 'oldest' }]),
      getTransaction: vi.fn().mockImplementation(async (sig: string) => {
        if (sig !== 'oldest') return null;
        return { blockTime: Date.parse('2026-06-01T00:00:00Z') / 1000, transaction: { message: depositMessage(0) } };
      }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory }, BASE_INPUT);

    expect(result).not.toBeNull();
    expect(result!.entryDate).toBe('2026-06-01');
    expect(result!.entryPrice).toBeCloseTo(1000, 6); // bin 0, decimalsX=9, decimalsY=6
    expect(result!.depositXAmount).toBeCloseTo(5, 10); // 5_000_000_000 / 1e9
    expect(result!.depositYAmount).toBeCloseTo(500, 10); // 500_000_000 / 1e6
    expect(result!.txSignature).toBe('oldest');
    expect(getPoolHistory).not.toHaveBeenCalled();
  });

  it('falls back to getPoolHistory when the deposit instruction has no active_id (legacy variant)', async () => {
    const getPoolHistory = vi.fn().mockResolvedValue([
      { snapshotAt: '2026-05-31T00:00:00.000Z', currentPrice: 950 },
      { snapshotAt: '2026-06-01T00:00:00.000Z', currentPrice: 970 },
    ]);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'oldest' }]),
      getTransaction: vi.fn().mockResolvedValue({
        blockTime: Date.parse('2026-06-01T00:00:00Z') / 1000,
        transaction: { message: depositMessage(null) },
      }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory }, BASE_INPUT);

    expect(result).not.toBeNull();
    expect(result!.entryPrice).toBe(970);
    expect(getPoolHistory).toHaveBeenCalledWith(POOL, expect.any(Number));
  });

  it('returns null when getPoolHistory has no snapshot for the entry day', async () => {
    const getPoolHistory = vi.fn().mockResolvedValue([{ snapshotAt: '2026-01-01T00:00:00.000Z', currentPrice: 100 }]);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'oldest' }]),
      getTransaction: vi.fn().mockResolvedValue({
        blockTime: Date.parse('2026-06-01T00:00:00Z') / 1000,
        transaction: { message: depositMessage(null) },
      }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory }, BASE_INPUT);

    expect(result).toBeNull();
  });

  it('returns null when there are no signatures for the position', async () => {
    const connection = { getSignaturesForAddress: vi.fn().mockResolvedValue([]), getTransaction: vi.fn() };

    const result = await deriveCostBasis({ connection, getPoolHistory: vi.fn() }, BASE_INPUT);

    expect(result).toBeNull();
  });

  it('returns null when the signature page is maxed out (possibly more history beyond it)', async () => {
    const signatures = Array.from({ length: 1000 }, (_, i) => ({ signature: `sig${i}` }));
    const connection = { getSignaturesForAddress: vi.fn().mockResolvedValue(signatures), getTransaction: vi.fn() };

    const result = await deriveCostBasis({ connection, getPoolHistory: vi.fn() }, BASE_INPUT);

    expect(result).toBeNull();
    expect(connection.getTransaction).not.toHaveBeenCalled();
  });

  it('returns null when the oldest transaction has no deposit instruction for this position', async () => {
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'oldest' }]),
      getTransaction: vi.fn().mockResolvedValue({ blockTime: 1000, transaction: { message: { instructions: [], accountKeys: [] } } }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory: vi.fn() }, BASE_INPUT);

    expect(result).toBeNull();
  });
});
