import { describe, expect, it, vi } from 'vitest';
import { createFredService, FredUnavailableError } from './fred.js';

function fredResponseFor(seriesToValue: Record<string, { date: string; value: string } | null>) {
  return vi.fn(async (url: string) => {
    const seriesId = new URL(url).searchParams.get('series_id')!;
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
  it('throws FredUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getSummary()).rejects.toBeInstanceOf(FredUnavailableError);
  });

  it('throws FredUnavailableError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as Response);
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getSummary()).rejects.toBeInstanceOf(FredUnavailableError);
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
