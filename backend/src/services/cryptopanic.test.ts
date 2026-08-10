import { describe, expect, it, vi } from 'vitest';
import { createCryptoPanicService } from './cryptopanic.js';

const FIXED_NOW = new Date('2026-08-09T12:00:00Z').getTime();

function hoursAgoIso(hours: number): string {
  return new Date(FIXED_NOW - hours * 3_600_000).toISOString();
}

function fakePostsResponse(posts: { title: string; url: string; publishedAt: string }[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      results: posts.map((p) => ({ title: p.title, url: p.url, published_at: p.publishedAt })),
    }),
  } as Response);
}

describe('createCryptoPanicService — no API key configured', () => {
  it('returns null without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: undefined });

    const result = await service.getRecentNewsForSymbol('FOO');

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createCryptoPanicService — freshness', () => {
  it('returns the most recent article when it is fresh (within 48h)', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForSymbol('FOO');

    expect(result).toEqual({ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) });
  });

  it('returns null when the most recent article is older than 48h', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'Old news', url: 'https://example.com/old', publishedAt: hoursAgoIso(49) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForSymbol('FOO');

    expect(result).toBeNull();
  });

  it('returns null when there are no results', async () => {
    const fetchImpl = fakePostsResponse([]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    expect(await service.getRecentNewsForSymbol('FOO')).toBeNull();
  });
});

describe('createCryptoPanicService — best-effort failure handling (never throws)', () => {
  it('returns null when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForSymbol('FOO')).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForSymbol('FOO')).resolves.toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForSymbol('FOO')).resolves.toBeNull();
  });
});

describe('createCryptoPanicService — caching', () => {
  it('reuses the cached result per symbol within the TTL', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) }]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    currentTime += 30_000;
    await service.getRecentNewsForSymbol('FOO');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    // Uses a real-match fixture (not an empty/no-results one) so this exercises the
    // positive-cache TTL (cacheTtlMs) rather than the longer negative-cache TTL that
    // now applies to null ("no news found") results — see the dedicated negative-cache
    // TTL tests below.
    const fetchImpl = fakePostsResponse([{ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) }]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    currentTime += 90_001;
    await service.getRecentNewsForSymbol('FOO');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches independently per symbol', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'X', url: 'https://example.com/x', publishedAt: hoursAgoIso(1) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    await service.getRecentNewsForSymbol('BAR');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches a "no news found" (null) result well past the ordinary TTL', async () => {
    const fetchImpl = fakePostsResponse([]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    currentTime += 90_001; // past the ordinary 90s TTL, but well within the 30-minute negative-cache TTL
    await service.getRecentNewsForSymbol('FOO');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches a "no news found" (null) result once the negative-cache TTL has expired', async () => {
    const fetchImpl = fakePostsResponse([]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    currentTime += 30 * 60 * 1000 + 1; // past the 30-minute negative-cache TTL
    await service.getRecentNewsForSymbol('FOO');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — no API key', () => {
  it('returns an empty array without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: undefined });

    const result = await service.getRecentNewsForToken('SOL');

    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — limit and window', () => {
  it('returns up to the default limit (3) of fresh articles within the default window (7 days)', async () => {
    const fetchImpl = fakePostsResponse([
      { title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) },
      { title: 'Article 2', url: 'https://example.com/2', publishedAt: hoursAgoIso(2) },
      { title: 'Article 3', url: 'https://example.com/3', publishedAt: hoursAgoIso(3) },
      { title: 'Article 4', url: 'https://example.com/4', publishedAt: hoursAgoIso(4) },
    ]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForToken('SOL');

    expect(result).toEqual([
      { title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) },
      { title: 'Article 2', url: 'https://example.com/2', publishedAt: hoursAgoIso(2) },
      { title: 'Article 3', url: 'https://example.com/3', publishedAt: hoursAgoIso(3) },
    ]);
  });

  it('excludes articles older than the window (default 7 days = 168h)', async () => {
    const fetchImpl = fakePostsResponse([
      { title: 'Fresh', url: 'https://example.com/fresh', publishedAt: hoursAgoIso(1) },
      { title: 'Stale', url: 'https://example.com/stale', publishedAt: hoursAgoIso(169) },
    ]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForToken('SOL');

    expect(result).toEqual([{ title: 'Fresh', url: 'https://example.com/fresh', publishedAt: hoursAgoIso(1) }]);
  });

  it('respects custom limit and windowHours options', async () => {
    const fetchImpl = fakePostsResponse([
      { title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) },
      { title: 'Article 2', url: 'https://example.com/2', publishedAt: hoursAgoIso(30) },
    ]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForToken('SOL', { limit: 1, windowHours: 24 });

    expect(result).toEqual([{ title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) }]);
  });

  it('returns an empty array when there are no results', async () => {
    const fetchImpl = fakePostsResponse([]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    expect(await service.getRecentNewsForToken('SOL')).toEqual([]);
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — best-effort failure handling (never throws)', () => {
  it('returns an empty array when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForToken('SOL')).resolves.toEqual([]);
  });

  it('returns an empty array on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForToken('SOL')).resolves.toEqual([]);
  });

  it('returns an empty array when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForToken('SOL')).resolves.toEqual([]);
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — caching', () => {
  it('uses a cache separate from getRecentNewsForSymbol', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'SOL surges', url: 'https://example.com/sol', publishedAt: hoursAgoIso(1) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('SOL');
    await service.getRecentNewsForToken('SOL');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reuses the cached result per (symbol, limit, windowHours) within the TTL', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'SOL surges', url: 'https://example.com/sol', publishedAt: hoursAgoIso(1) }]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForToken('SOL');
    currentTime += 30_000;
    await service.getRecentNewsForToken('SOL');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches an empty-array result well past the ordinary TTL', async () => {
    const fetchImpl = fakePostsResponse([]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForToken('SOL');
    currentTime += 90_001;
    await service.getRecentNewsForToken('SOL');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
