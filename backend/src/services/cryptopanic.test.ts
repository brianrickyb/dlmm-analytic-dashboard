import { describe, expect, it, vi } from 'vitest';
import { createNewsService } from './cryptopanic.js';

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
