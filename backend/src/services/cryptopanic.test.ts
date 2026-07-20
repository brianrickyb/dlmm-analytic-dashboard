import { describe, expect, it, vi } from 'vitest';
import { createNewsService, UpstreamMalformedError, UpstreamRejectedError, UpstreamUnavailableError } from './cryptopanic.js';

const RAW_RESPONSE = {
  results: [
    {
      id: 1,
      title: 'Bitcoin surges past $70k',
      url: 'https://cryptopanic.com/news/1/bitcoin-surges',
      source: { title: 'CoinDesk' },
      published_at: '2026-07-20T05:00:00Z',
      currencies: [{ code: 'BTC' }],
      votes: { positive: 20, negative: 1, important: 3 },
    },
  ],
};

function fakeFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('createNewsService — successful parsing', () => {
  it('parses a CryptoPanic response into CryptoPanicPost[]', async () => {
    const fetchImpl = fakeFetchOnce(RAW_RESPONSE);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    const posts = await service.fetchNews({ currencies: 'BTC' });

    expect(posts).toEqual([
      {
        id: 1,
        title: 'Bitcoin surges past $70k',
        url: 'https://cryptopanic.com/news/1/bitcoin-surges',
        sourceTitle: 'CoinDesk',
        publishedAt: '2026-07-20T05:00:00Z',
        currencies: ['BTC'],
        votes: { positive: 20, negative: 1, important: 3 },
      },
    ]);
  });

  it('calls CryptoPanic with auth_token, public, currencies, and filter query params', async () => {
    const fetchImpl = fakeFetchOnce(RAW_RESPONSE);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await service.fetchNews({ currencies: 'BTC,SOL', filter: 'rising' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://cryptopanic.com/api/v1/posts/');
    expect(calledUrl.searchParams.get('auth_token')).toBe('test-key');
    expect(calledUrl.searchParams.get('public')).toBe('true');
    expect(calledUrl.searchParams.get('currencies')).toBe('BTC,SOL');
    expect(calledUrl.searchParams.get('filter')).toBe('rising');
  });
});

describe('createNewsService — error classification', () => {
  it('throws UpstreamUnavailableError when the network request itself fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('throws UpstreamRejectedError on a 429 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(UpstreamRejectedError);
  });

  it('throws UpstreamRejectedError on a 401 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(UpstreamRejectedError);
  });

  it('throws UpstreamUnavailableError on a 500 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('throws UpstreamMalformedError when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(UpstreamMalformedError);
  });

  it('throws UpstreamMalformedError when the response is missing the results field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ oops: true }) } as Response);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(UpstreamMalformedError);
  });
});

describe('createNewsService — caching', () => {
  it('reuses the cached result for an identical query within the TTL', async () => {
    const fetchImpl = fakeFetchOnce(RAW_RESPONSE);
    let currentTime = 1_000_000;
    const service = createNewsService({
      apiKey: 'test-key',
      fetchImpl,
      now: () => currentTime,
      cacheTtlMs: 60_000,
    });

    await service.fetchNews({ currencies: 'BTC' });
    currentTime += 30_000; // still within the 60s TTL
    await service.fetchNews({ currencies: 'BTC' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakeFetchOnce(RAW_RESPONSE);
    let currentTime = 1_000_000;
    const service = createNewsService({
      apiKey: 'test-key',
      fetchImpl,
      now: () => currentTime,
      cacheTtlMs: 60_000,
    });

    await service.fetchNews({ currencies: 'BTC' });
    currentTime += 60_001; // just past the TTL
    await service.fetchNews({ currencies: 'BTC' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches different query combinations independently', async () => {
    const fetchImpl = fakeFetchOnce(RAW_RESPONSE);
    const service = createNewsService({ apiKey: 'test-key', fetchImpl });

    await service.fetchNews({ currencies: 'BTC' });
    await service.fetchNews({ currencies: 'SOL' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
