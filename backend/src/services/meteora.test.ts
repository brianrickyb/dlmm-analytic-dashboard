import { describe, expect, it, vi } from 'vitest';
import { createMeteoraService, MeteoraUnavailableError } from './meteora.js';

function buildRawPool(overrides: {
  address?: string;
  name?: string;
  symbolX?: string;
  symbolY?: string;
  tvl?: number;
  volume24h?: number;
  fees24h?: number;
  basFeePct?: number;
  isBlacklisted?: boolean;
}) {
  return {
    address: overrides.address ?? 'ADDR1',
    name: overrides.name ?? 'FOO-BAR',
    created_at: 1783657634000,
    is_blacklisted: overrides.isBlacklisted ?? false,
    token_x: { address: 'MINTX', name: 'Foo', symbol: overrides.symbolX ?? 'FOO', decimals: 6 },
    token_y: { address: 'MINTY', name: 'Bar', symbol: overrides.symbolY ?? 'BAR', decimals: 6 },
    tvl: overrides.tvl ?? 1_000_000,
    current_price: 1.5,
    pool_config: { bin_step: 20, base_fee_pct: overrides.basFeePct ?? 0.03 },
    volume: { '24h': overrides.volume24h ?? 200_000 },
    fees: { '24h': overrides.fees24h ?? 100 },
  };
}

function fakeFetchPools(pools: unknown[]) {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: pools }) }) as Response);
}

function fakeSupabaseAdmin(tvlRows: { pool_address: string; day: string; tvl_usd: number }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, address: string) => ({
          gte: (_col2: string, since: string) => {
            const data = tvlRows.filter((r) => r.pool_address === address && r.day >= since);
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
  } as any;
}

describe('createMeteoraService — getPools field mapping', () => {
  it('maps a well-formed raw pool into PoolWithStats', async () => {
    const fetchImpl = fakeFetchPools([buildRawPool({ tvl: 1_000_000, fees24h: 1000, basFeePct: 0.03 })]);
    const service = createMeteoraService({ fetchImpl, now: () => 1_700_000_000_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    const pools = await service.getPools();

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      id: 'ADDR1',
      poolAddress: 'ADDR1',
      name: 'FOO-BAR',
      binStep: 20,
      baseFeeBps: 3, // 0.03% * 100
      isActive: true,
    });
    // feeApr24h = (1000/1_000_000)*365*100 = 36.5
    expect(pools[0].stats.feeApr24h).toBeCloseTo(36.5, 6);
    expect(pools[0].stats.currentPrice).toBe(1.5);
  });

  it('skips a malformed pool row instead of failing the whole batch', async () => {
    const malformed = { address: 'BAD', name: 'Bad Pool' }; // missing everything else
    const fetchImpl = fakeFetchPools([buildRawPool({ address: 'GOOD' }), malformed]);
    const service = createMeteoraService({ fetchImpl, now: () => 1_700_000_000_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    const pools = await service.getPools();

    expect(pools).toHaveLength(1);
    expect(pools[0].poolAddress).toBe('GOOD');
  });

  it('sorts by TVL descending and caps at 50', async () => {
    const raw = Array.from({ length: 60 }, (_, i) => buildRawPool({ address: `ADDR${i}`, tvl: 1000 + i }));
    const fetchImpl = fakeFetchPools(raw);
    const service = createMeteoraService({ fetchImpl, now: () => 1_700_000_000_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    const pools = await service.getPools();

    expect(pools).toHaveLength(50);
    expect(pools[0].poolAddress).toBe('ADDR59'); // highest tvl (1000+59)
    expect(pools[0].stats.tvlUsd).toBe(1059);
  });
});

describe('createMeteoraService — getPools total failure', () => {
  it('throws MeteoraUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createMeteoraService({ fetchImpl, supabaseAdmin: fakeSupabaseAdmin([]) });

    await expect(service.getPools()).rejects.toBeInstanceOf(MeteoraUnavailableError);
  });

  it('throws MeteoraUnavailableError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const service = createMeteoraService({ fetchImpl, supabaseAdmin: fakeSupabaseAdmin([]) });

    await expect(service.getPools()).rejects.toBeInstanceOf(MeteoraUnavailableError);
  });
});

describe('createMeteoraService — getPools caching', () => {
  it('reuses the cached result within the TTL', async () => {
    const fetchImpl = fakeFetchPools([buildRawPool({})]);
    let currentTime = 1_700_000_000_000;
    const service = createMeteoraService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    await service.getPools();
    currentTime += 30_000;
    await service.getPools();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakeFetchPools([buildRawPool({})]);
    let currentTime = 1_700_000_000_000;
    const service = createMeteoraService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    await service.getPools();
    currentTime += 60_001;
    await service.getPools();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('createMeteoraService — getPoolHistory merge logic', () => {
  function fakeFetchHistory(opts: {
    ohlcv: { timestamp_str: string; close: number }[];
    volumeHistory: { timestamp_str: string; volume: number; fees: number }[];
  }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/ohlcv')) {
        return { ok: true, status: 200, json: async () => ({ data: opts.ohlcv }) } as Response;
      }
      if (url.includes('/volume/history')) {
        return { ok: true, status: 200, json: async () => ({ data: opts.volumeHistory }) } as Response;
      }
      throw new Error(`unexpected URL in test: ${url}`);
    });
  }

  it('only includes days present in price, volume, AND our own TVL table', async () => {
    const fetchImpl = fakeFetchHistory({
      ohlcv: [
        { timestamp_str: '2026-08-01T00:00:00+00:00', close: 10 },
        { timestamp_str: '2026-08-02T00:00:00+00:00', close: 11 },
        { timestamp_str: '2026-08-03T00:00:00+00:00', close: 12 },
      ],
      volumeHistory: [
        { timestamp_str: '2026-08-01T00:00:00+00:00', volume: 1000, fees: 5 },
        { timestamp_str: '2026-08-02T00:00:00+00:00', volume: 2000, fees: 6 },
        { timestamp_str: '2026-08-03T00:00:00+00:00', volume: 3000, fees: 7 },
      ],
    });
    // TVL only exists for 08-02 and 08-03 — 08-01 should be excluded from the result.
    const supabaseAdmin = fakeSupabaseAdmin([
      { pool_address: 'ADDR1', day: '2026-08-02', tvl_usd: 500_000 },
      { pool_address: 'ADDR1', day: '2026-08-03', tvl_usd: 600_000 },
    ]);
    const service = createMeteoraService({ fetchImpl, now: () => Date.parse('2026-08-10T00:00:00Z'), supabaseAdmin });

    const snapshots = await service.getPoolHistory('ADDR1', 90);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ snapshotAt: '2026-08-02T00:00:00.000Z', tvlUsd: 500_000, currentPrice: 11, volume24hUsd: 2000, fees24hUsd: 6 });
    expect(snapshots[1]).toMatchObject({ snapshotAt: '2026-08-03T00:00:00.000Z', tvlUsd: 600_000, currentPrice: 12, volume24hUsd: 3000, fees24hUsd: 7 });
    // feeApr24h for 08-02: (6/500_000)*365*100
    expect(snapshots[0].feeApr24h).toBeCloseTo((6 / 500_000) * 365 * 100, 6);
  });

  it('returns an empty array when there is no TVL history yet for a pool', async () => {
    const fetchImpl = fakeFetchHistory({
      ohlcv: [{ timestamp_str: '2026-08-09T00:00:00+00:00', close: 10 }],
      volumeHistory: [{ timestamp_str: '2026-08-09T00:00:00+00:00', volume: 1000, fees: 5 }],
    });
    const supabaseAdmin = fakeSupabaseAdmin([]); // no rows for this pool at all
    const service = createMeteoraService({ fetchImpl, now: () => Date.parse('2026-08-10T00:00:00Z'), supabaseAdmin });

    const snapshots = await service.getPoolHistory('ADDR1', 90);

    expect(snapshots).toEqual([]);
  });

  it('excludes the current UTC day even when price, volume, AND TVL are all present for it', async () => {
    const fetchImpl = fakeFetchHistory({
      ohlcv: [
        { timestamp_str: '2026-08-09T00:00:00+00:00', close: 10 },
        { timestamp_str: '2026-08-10T00:00:00+00:00', close: 11 },
      ],
      volumeHistory: [
        { timestamp_str: '2026-08-09T00:00:00+00:00', volume: 1000, fees: 5 },
        { timestamp_str: '2026-08-10T00:00:00+00:00', volume: 0, fees: 0 },
      ],
    });
    // TVL rows exist for both days, and volume/price also exist for both days —
    // but 2026-08-10 is "today" per `now`, so it must still be excluded.
    const supabaseAdmin = fakeSupabaseAdmin([
      { pool_address: 'ADDR1', day: '2026-08-09', tvl_usd: 500_000 },
      { pool_address: 'ADDR1', day: '2026-08-10', tvl_usd: 510_000 },
    ]);
    const service = createMeteoraService({ fetchImpl, now: () => Date.parse('2026-08-10T05:00:00Z'), supabaseAdmin });

    const snapshots = await service.getPoolHistory('ADDR1', 90);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].snapshotAt).toBe('2026-08-09T00:00:00.000Z');
    expect(snapshots.some((s) => s.snapshotAt.startsWith('2026-08-10'))).toBe(false);
  });

  it('caches the merged result per address+days key', async () => {
    const fetchImpl = fakeFetchHistory({ ohlcv: [], volumeHistory: [] });
    let currentTime = Date.parse('2026-08-10T00:00:00Z');
    const service = createMeteoraService({ fetchImpl, now: () => currentTime, historyCacheTtlMs: 300_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    await service.getPoolHistory('ADDR1', 90);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    currentTime += 100_000;
    await service.getPoolHistory('ADDR1', 90);

    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });
});
