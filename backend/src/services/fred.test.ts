import { describe, expect, it, vi } from 'vitest';
import { createFredService, FredUnavailableError } from './fred.js';

function fredResponseFor(seriesToValue: Record<string, { date: string; value: string } | null>) {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = String(url);
    const seriesId = new URL(urlStr).searchParams.get('series_id')!;
    const point = seriesToValue[seriesId];
    return {
      ok: true,
      status: 200,
      json: async () => ({ observations: point ? [point] : [] }),
    } as Response;
  });
}

describe('createFredService — no API key', () => {
  it('throws FredUnavailableError without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createFredService({ fetchImpl, apiKey: undefined });

    await expect(service.getSummary()).rejects.toBeInstanceOf(FredUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createFredService — success', () => {
  it('fetches and parses all four series', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '5.33' },
      DFII10: { date: '2026-08-12', value: '1.85' },
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result).toEqual({
      fedFundsRate: { date: '2026-08-12', value: 5.33 },
      realYield10y: { date: '2026-08-12', value: 1.85 },
      cpi: { date: '2026-07-01', value: 312.5 },
      dollarIndex: { date: '2026-08-12', value: 121.4 },
    });
  });

  it('returns null for a series with no observations instead of failing the whole summary', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '5.33' },
      DFII10: null,
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result.realYield10y).toBeNull();
    expect(result.fedFundsRate).not.toBeNull();
  });

  it('treats a "." value (FRED\'s not-yet-released marker) as null for that series', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '.' },
      DFII10: { date: '2026-08-12', value: '1.85' },
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result.fedFundsRate).toBeNull();
  });
});

describe('createFredService — failure handling', () => {
  it('returns all nulls when all series network requests fail', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result).toEqual({
      fedFundsRate: null,
      realYield10y: null,
      cpi: null,
      dollarIndex: null,
    });
  });

  it('returns all nulls on non-ok response for all series', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as Response);
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result).toEqual({
      fedFundsRate: null,
      realYield10y: null,
      cpi: null,
      dollarIndex: null,
    });
  });

  it('gracefully degrades to null for failed series while returning values for successful ones', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      const seriesId = new URL(urlStr).searchParams.get('series_id')!;
      if (seriesId === 'DTWEXBGS') {
        // Dollar index fails with network error
        throw new Error('ECONNREFUSED');
      }
      // Other three series succeed
      const responses: Record<string, { date: string; value: string }> = {
        DFF: { date: '2026-08-12', value: '5.33' },
        DFII10: { date: '2026-08-12', value: '1.85' },
        CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      };
      const point = responses[seriesId];
      return {
        ok: true,
        status: 200,
        json: async () => ({ observations: point ? [point] : [] }),
      } as Response;
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result).toEqual({
      fedFundsRate: { date: '2026-08-12', value: 5.33 },
      realYield10y: { date: '2026-08-12', value: 1.85 },
      cpi: { date: '2026-07-01', value: 312.5 },
      dollarIndex: null, // failed series returns null
    });
  });
});

describe('createFredService — all-null summary caching', () => {
  it('caches an all-null summary for the short TTL only, retrying after it expires', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    let currentTime = 1_000_000;
    const service = createFredService({ fetchImpl, apiKey: 'test-key', now: () => currentTime, cacheTtlMs: 6 * 60 * 60 * 1000 });

    const first = await service.getSummary();
    expect(first).toEqual({ fedFundsRate: null, realYield10y: null, cpi: null, dollarIndex: null });
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    // +1min: still within the 5min all-null TTL -- no new fetches.
    currentTime += 60 * 1000;
    await service.getSummary();
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    // +6min total: past the 5min all-null TTL -- fetches again.
    currentTime += 5 * 60 * 1000;
    await service.getSummary();
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });
});

describe('createFredService — caching', () => {
  it('reuses the cached summary within the TTL', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '5.33' },
      DFII10: { date: '2026-08-12', value: '1.85' },
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    let currentTime = 1_000_000;
    const service = createFredService({ fetchImpl, apiKey: 'test-key', now: () => currentTime, cacheTtlMs: 60_000 });

    await service.getSummary();
    currentTime += 30_000;
    await service.getSummary();

    expect(fetchImpl).toHaveBeenCalledTimes(4); // one call per series, only on the first getSummary
  });
});
