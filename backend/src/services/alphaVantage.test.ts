import { describe, expect, it, vi } from 'vitest';
import { createAlphaVantageService, AlphaVantageUnavailableError } from './alphaVantage.js';

function fakeGoldResponse(rows: { date: string; value: string }[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ name: 'Gold', interval: 'daily', unit: 'dollars', data: rows }),
  } as Response);
}

describe('createAlphaVantageService — no API key', () => {
  it('throws AlphaVantageUnavailableError without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createAlphaVantageService({ fetchImpl, apiKey: undefined });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createAlphaVantageService — success', () => {
  it('parses the daily history into GoldSnapshot rows', async () => {
    const fetchImpl = fakeGoldResponse([
      { date: '2026-02-01', value: '4900.50' },
      { date: '2026-02-02', value: '4915.25' },
    ]);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getDailyHistory();

    expect(result).toEqual([
      { date: '2026-02-01', value: 4900.5 },
      { date: '2026-02-02', value: 4915.25 },
    ]);
  });

  it('skips rows with a non-numeric value rather than failing the whole batch', async () => {
    const fetchImpl = fakeGoldResponse([
      { date: '2026-02-01', value: '4900.50' },
      { date: '2026-02-02', value: 'N/A' },
    ]);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getDailyHistory();

    expect(result).toEqual([{ date: '2026-02-01', value: 4900.5 }]);
  });

  it('skips null and non-object entries in the data array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Gold',
        interval: 'daily',
        unit: 'dollars',
        data: [
          { date: '2026-02-01', value: '4900.50' },
          null,
          'invalid',
          123,
          { date: '2026-02-02', value: '4915.25' },
        ],
      }),
    } as Response);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getDailyHistory();

    expect(result).toEqual([
      { date: '2026-02-01', value: 4900.5 },
      { date: '2026-02-02', value: 4915.25 },
    ]);
  });
});

describe('createAlphaVantageService — failure handling', () => {
  it('throws AlphaVantageUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
  });

  it('throws AlphaVantageUnavailableError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
  });

  it('throws AlphaVantageUnavailableError when the response is missing the data field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Gold' }),
    } as Response);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
  });

  it('caches a terminal failure and rethrows without re-hitting the network within the failure TTL', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    let currentTime = 1_000_000;
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key', now: () => currentTime });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
    currentTime += 30 * 60 * 1000; // +30min, within the 1h failure TTL
    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the failure TTL has expired', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    let currentTime = 1_000_000;
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key', now: () => currentTime });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
    currentTime += 60 * 60 * 1000 + 1; // just past the 1h failure TTL
    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('createAlphaVantageService — caching', () => {
  it('reuses the cached history within the 24h TTL', async () => {
    const fetchImpl = fakeGoldResponse([{ date: '2026-02-01', value: '4900.50' }]);
    let currentTime = 1_000_000;
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key', now: () => currentTime });

    await service.getDailyHistory();
    currentTime += 60 * 60 * 1000; // +1h, well within the 24h TTL
    await service.getDailyHistory();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the 24h TTL has expired', async () => {
    const fetchImpl = fakeGoldResponse([{ date: '2026-02-01', value: '4900.50' }]);
    let currentTime = 1_000_000;
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key', now: () => currentTime });

    await service.getDailyHistory();
    currentTime += 24 * 60 * 60 * 1000 + 1;
    await service.getDailyHistory();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
