import { describe, expect, it, vi } from 'vitest';
import { runSnapshotPoolTvl } from './snapshotPoolTvl.js';

function fakePool(poolAddress: string, tvlUsd: number) {
  return { id: poolAddress, poolAddress, name: 'X', tokenX: {} as any, tokenY: {} as any, binStep: 1, baseFeeBps: 1, isActive: true, stats: { poolId: poolAddress, snapshotAt: '', tvlUsd, volume24hUsd: 0, fees24hUsd: 0, feeApr24h: 0, currentPrice: 1 } };
}

function fakeSupabaseAdmin(upsertResults: Record<string, { error: { message: string } | null }>) {
  const upsert = vi.fn(async (row: { pool_address: string }) => upsertResults[row.pool_address] ?? { error: null });
  return { from: () => ({ upsert }), _upsert: upsert } as any;
}

describe('runSnapshotPoolTvl', () => {
  it('upserts one row per pool and reports success counts', async () => {
    const meteoraService = { getPools: vi.fn().mockResolvedValue([fakePool('A', 100), fakePool('B', 200)]) };
    const supabaseAdmin = fakeSupabaseAdmin({});

    const result = await runSnapshotPoolTvl({ meteoraService, supabaseAdmin });

    expect(result).toEqual({ succeeded: 2, failed: 0 });
    expect(supabaseAdmin._upsert).toHaveBeenCalledTimes(2);
    expect(supabaseAdmin._upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pool_address: 'A', tvl_usd: 100 }),
      { onConflict: 'pool_address,day' },
    );
  });

  it('continues past one pool failing and still commits the rest', async () => {
    const meteoraService = { getPools: vi.fn().mockResolvedValue([fakePool('A', 100), fakePool('B', 200), fakePool('C', 300)]) };
    const supabaseAdmin = fakeSupabaseAdmin({ B: { error: { message: 'db down' } } });

    const result = await runSnapshotPoolTvl({ meteoraService, supabaseAdmin });

    expect(result).toEqual({ succeeded: 2, failed: 1 });
  });

  it('uses the injected clock\'s date (UTC, YYYY-MM-DD) for every row in the same run', async () => {
    const meteoraService = { getPools: vi.fn().mockResolvedValue([fakePool('A', 100)]) };
    const supabaseAdmin = fakeSupabaseAdmin({});

    await runSnapshotPoolTvl({ meteoraService, supabaseAdmin, now: () => Date.parse('2026-08-10T23:00:00Z') });

    expect(supabaseAdmin._upsert).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-08-10' }), expect.anything());
  });
});
