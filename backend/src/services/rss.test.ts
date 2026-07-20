import { describe, expect, it, vi } from 'vitest';
import { createNewsService, FEED_SOURCES, AllFeedsUnavailableError } from './rss.js';

function fakeParser(byUrl: Record<string, { items: { title?: string; link?: string; guid?: string; pubDate?: string }[] } | Error>) {
  return {
    parseURL: vi.fn(async (url: string) => {
      const result = byUrl[url];
      if (result instanceof Error) throw result;
      if (!result) throw new Error(`no fixture for ${url}`);
      return result;
    }),
  };
}

const [coindesk, cointelegraph, theblock, decrypt] = FEED_SOURCES;

describe('createNewsService — merge, dedupe, sort', () => {
  it('merges items from all feeds, dedupes by URL, and sorts newest-first', async () => {
    const parser = fakeParser({
      [coindesk.url]: {
        items: [{ title: 'Old CoinDesk story', link: 'https://coindesk.example/old', pubDate: '2026-07-01T00:00:00Z' }],
      },
      [cointelegraph.url]: {
        items: [
          { title: 'Fresh Cointelegraph story', link: 'https://cointelegraph.example/new', pubDate: '2026-07-20T00:00:00Z' },
          // duplicate of a CoinDesk story by URL (cross-posted)
          { title: 'Old CoinDesk story (syndicated)', link: 'https://coindesk.example/old', pubDate: '2026-07-01T00:00:00Z' },
        ],
      },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
    });

    const service = createNewsService({ parser });
    const posts = await service.fetchNews({});

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Fresh Cointelegraph story');
    expect(posts[1].title).toBe('Old CoinDesk story');
  });
});

describe('createNewsService — partial and total failure', () => {
  it('returns articles from the feeds that succeed when others fail', async () => {
    const parser = fakeParser({
      [coindesk.url]: new Error('ETIMEDOUT'),
      [cointelegraph.url]: { items: [{ title: 'Still works', link: 'https://cointelegraph.example/1', pubDate: '2026-07-20T00:00:00Z' }] },
      [theblock.url]: new Error('ETIMEDOUT'),
      [decrypt.url]: { items: [] },
    });

    const service = createNewsService({ parser });
    const posts = await service.fetchNews({});

    expect(posts).toEqual([expect.objectContaining({ title: 'Still works' })]);
  });

  it('throws AllFeedsUnavailableError when every feed fails', async () => {
    const parser = fakeParser({
      [coindesk.url]: new Error('down'),
      [cointelegraph.url]: new Error('down'),
      [theblock.url]: new Error('down'),
      [decrypt.url]: new Error('down'),
    });

    const service = createNewsService({ parser });

    await expect(service.fetchNews({})).rejects.toBeInstanceOf(AllFeedsUnavailableError);
  });
});

describe('createNewsService — caching', () => {
  it('reuses the cached merge for the same source within the TTL', async () => {
    const parser = fakeParser({
      [coindesk.url]: { items: [{ title: 'A', link: 'https://a.example', pubDate: '2026-07-20T00:00:00Z' }] },
      [cointelegraph.url]: { items: [] },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
    });
    let currentTime = 1_000_000;
    const service = createNewsService({ parser, now: () => currentTime, cacheTtlMs: 60_000 });

    await service.fetchNews({});
    currentTime += 30_000;
    await service.fetchNews({});

    expect(parser.parseURL).toHaveBeenCalledTimes(4); // one call per feed, only on the first fetchNews
  });

  it('re-fetches once the TTL has expired', async () => {
    const parser = fakeParser({
      [coindesk.url]: { items: [] },
      [cointelegraph.url]: { items: [] },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
    });
    let currentTime = 1_000_000;
    const service = createNewsService({ parser, now: () => currentTime, cacheTtlMs: 60_000 });

    await service.fetchNews({});
    currentTime += 60_001;
    await service.fetchNews({});

    expect(parser.parseURL).toHaveBeenCalledTimes(8); // 4 feeds x 2 fetches
  });

  it('does not re-fetch when only the currencies filter changes', async () => {
    const parser = fakeParser({
      [coindesk.url]: { items: [{ title: 'Solana update', link: 'https://a.example', pubDate: '2026-07-20T00:00:00Z' }] },
      [cointelegraph.url]: { items: [] },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
    });
    const service = createNewsService({ parser });

    await service.fetchNews({});
    await service.fetchNews({ currencies: 'SOL' });

    expect(parser.parseURL).toHaveBeenCalledTimes(4);
  });
});

describe('createNewsService — source filter', () => {
  it('only fetches the requested source feed', async () => {
    const parser = fakeParser({
      [coindesk.url]: { items: [{ title: 'CoinDesk only', link: 'https://a.example', pubDate: '2026-07-20T00:00:00Z' }] },
    });
    const service = createNewsService({ parser });

    const posts = await service.fetchNews({ source: coindesk.key });

    expect(parser.parseURL).toHaveBeenCalledTimes(1);
    expect(parser.parseURL).toHaveBeenCalledWith(coindesk.url);
    expect(posts).toEqual([expect.objectContaining({ title: 'CoinDesk only' })]);
  });
});

describe('createNewsService — currency keyword filter', () => {
  it('matches a currency code via its alias in the title', async () => {
    const parser = fakeParser({
      [coindesk.url]: {
        items: [
          { title: 'Solana network upgrade announced', link: 'https://a.example', pubDate: '2026-07-20T00:00:00Z' },
          { title: 'Unrelated market roundup', link: 'https://b.example', pubDate: '2026-07-20T00:00:00Z' },
        ],
      },
      [cointelegraph.url]: { items: [] },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
    });
    const service = createNewsService({ parser });

    const posts = await service.fetchNews({ currencies: 'SOL' });

    expect(posts).toEqual([expect.objectContaining({ title: 'Solana network upgrade announced' })]);
  });
});
