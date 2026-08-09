import { describe, expect, it, vi } from 'vitest';
import { createGeckoTerminalService, GeckoTerminalUnavailableError } from './geckoterminal.js';

const FIXED_NOW = new Date('2026-08-09T12:00:00Z').getTime();

function hoursAgoIso(hours: number): string {
  return new Date(FIXED_NOW - hours * 3_600_000).toISOString();
}

function buildRawPool(overrides: {
  symbol?: string;
  network?: string;
  dex?: string;
  address?: string;
  ageHours?: number;
  priceChangeH6?: string;
  volumeH24?: string;
}) {
  const network = overrides.network ?? 'solana';
  const address = overrides.address ?? 'ADDR1';
  return {
    id: `${network}_${address}`,
    type: 'pool',
    attributes: {
      name: `${overrides.symbol ?? 'FOO'} / USDC`,
      address,
      pool_created_at: hoursAgoIso(overrides.ageHours ?? 10),
      price_change_percentage: { h6: overrides.priceChangeH6 ?? '30' },
      volume_usd: { h24: overrides.volumeH24 ?? '100000' },
    },
    relationships: {
      network: { data: { id: network } },
      dex: { data: { id: overrides.dex ?? 'pump-fun' } },
    },
  };
}

function fakeFetchPages(pages: unknown[][]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/page=(\d+)/);
    const pageNum = pageMatch ? Number(pageMatch[1]) : 1;
    const data = pages[pageNum - 1] ?? [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
}

describe('createGeckoTerminalService — heuristic filtering', () => {
  it('keeps a pool that passes all three rules', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ symbol: 'FOO', ageHours: 10, priceChangeH6: '30', volumeH24: '100000' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ symbol: 'FOO', priceChangePct6h: 30, volumeUsd24h: 100000 });
    expect(candidates[0].poolUrl).toBe('https://www.geckoterminal.com/solana/pools/ADDR1');
  });

  it('drops a pool older than 72 hours', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ ageHours: 100 })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(0);
  });

  it('keeps a pool exactly at the 72-hour boundary', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ ageHours: 72 })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(1);
  });

  it('drops a pool with 6h price change below 25%', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ priceChangeH6: '24.9' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(0);
  });

  it('keeps a pool exactly at the 25% price-change boundary', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ priceChangeH6: '25' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(1);
  });

  it('drops a pool with 24h volume below $50,000', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ volumeH24: '49999' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(0);
  });

  it('sorts by 6h price change descending and caps at 15', async () => {
    const pools = Array.from({ length: 20 }, (_, i) =>
      buildRawPool({ symbol: `SYM${i}`, address: `ADDR${i}`, priceChangeH6: String(30 + i) }),
    );
    const fetchImpl = fakeFetchPages([pools]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(15);
    expect(candidates[0].symbol).toBe('SYM19'); // highest price change (30+19=49)
    expect(candidates[0].priceChangePct6h).toBe(49);
    expect(candidates[14].priceChangePct6h).toBe(35); // 15th-highest kept value; 34 and below (5 pools) are dropped
  });
});

describe('createGeckoTerminalService — pagination', () => {
  it('stops paginating once a page returns zero pools', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ symbol: 'FOO' })], []]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    await service.getPumpCandidates();

    // 2 calls (page 1 with a pool, page 2 empty stops it) per endpoint, and both
    // new_pools and trending_pools are paginated.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("stops (not throws) when a later page fails, keeping earlier pages' candidates", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) return { ok: true, status: 200, json: async () => ({ data: [buildRawPool({ symbol: 'FOO' })] }) } as Response;
      throw new Error('network down');
    });
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].symbol).toBe('FOO');
  });
});

describe('createGeckoTerminalService — dedupe across endpoints', () => {
  it('collapses a pool with the same id returned by both new_pools and trending_pools into one candidate', async () => {
    const pool = buildRawPool({ symbol: 'DUPE', address: 'ADDRDUPE' });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      const pageMatch = url.match(/page=(\d+)/);
      const pageNum = pageMatch ? Number(pageMatch[1]) : 1;
      if (pageNum !== 1) return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      // Both endpoints happen to surface the same pool id on their respective page 1.
      return { ok: true, status: 200, json: async () => ({ data: [pool] }) } as Response;
    });
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].poolId).toBe(pool.id);
  });
});

describe('createGeckoTerminalService — total failure', () => {
  it('throws GeckoTerminalUnavailableError when page 1 network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    await expect(service.getPumpCandidates()).rejects.toBeInstanceOf(GeckoTerminalUnavailableError);
  });

  it('throws GeckoTerminalUnavailableError when page 1 returns a non-ok status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    await expect(service.getPumpCandidates()).rejects.toBeInstanceOf(GeckoTerminalUnavailableError);
  });
});

describe('createGeckoTerminalService — caching', () => {
  it('reuses the cached result within the TTL', async () => {
    const fetchImpl = fakeFetchPages([[]]);
    let currentTime = FIXED_NOW;
    const service = createGeckoTerminalService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000 });

    await service.getPumpCandidates();
    currentTime += 30_000;
    await service.getPumpCandidates();

    // 1 call per endpoint (page 1 empty stops pagination immediately) on the first,
    // uncached fetch; the second call is served entirely from cache.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakeFetchPages([[]]);
    let currentTime = FIXED_NOW;
    const service = createGeckoTerminalService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000 });

    await service.getPumpCandidates();
    currentTime += 90_001;
    await service.getPumpCandidates();

    // 2 endpoint calls per (uncached) getPumpCandidates() invocation, invoked twice.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
