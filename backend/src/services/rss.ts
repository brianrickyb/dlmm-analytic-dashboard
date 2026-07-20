import Parser from 'rss-parser';

export interface NewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
}

export interface NewsQuery {
  currencies?: string;
  source?: string;
}

export class AllFeedsUnavailableError extends Error {}

export interface FeedSource {
  key: string;
  title: string;
  url: string;
}

export const FEED_SOURCES: FeedSource[] = [
  { key: 'coindesk', title: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { key: 'cointelegraph', title: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { key: 'theblock', title: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { key: 'decrypt', title: 'Decrypt', url: 'https://decrypt.co/feed' },
];

/**
 * Aliases used for coarse keyword matching against RSS titles — RSS has no
 * structured per-article coin tags, so this is a deliberately approximate
 * substitute (see the news feed design doc's "Data source" trade-offs).
 */
const CURRENCY_ALIASES: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth'],
  SOL: ['solana', 'sol'],
  USDC: ['usdc', 'usd coin'],
  JUP: ['jupiter'],
  BONK: ['bonk'],
  JLP: ['jlp'],
  JTO: ['jito'],
  WIF: ['dogwifhat', '$wif'],
  PYTH: ['pyth network', 'pyth'],
};

interface RssParserLike {
  parseURL(url: string): Promise<{ items: { title?: string; link?: string; guid?: string; pubDate?: string; isoDate?: string }[] }>;
}

export interface NewsServiceDeps {
  parser?: RssParserLike;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 4 * 60 * 1000;

function matchesCurrencies(title: string, currencies: string): boolean {
  const codes = currencies
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) return true;

  const haystack = title.toLowerCase();
  return codes.some((code) => {
    const aliases = CURRENCY_ALIASES[code] ?? [code.toLowerCase()];
    return aliases.some((alias) => haystack.includes(alias));
  });
}

export function createNewsService(deps: NewsServiceDeps = {}) {
  const parser = deps.parser ?? new Parser();
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, { expiresAt: number; data: NewsPost[] }>();

  async function fetchOneFeed(feed: FeedSource): Promise<NewsPost[]> {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items ?? []).map((item, index) => ({
      id: item.guid ?? item.link ?? `${feed.key}-${index}`,
      title: item.title ?? '(untitled)',
      url: item.link ?? feed.url,
      sourceTitle: feed.title,
      publishedAt: item.pubDate ?? item.isoDate ?? new Date(0).toISOString(),
    }));
  }

  async function getMergedFeed(source: string | undefined): Promise<NewsPost[]> {
    const cacheKey = source ?? '';
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const feedsToFetch = source ? FEED_SOURCES.filter((f) => f.key === source) : FEED_SOURCES;
    const settled = await Promise.allSettled(feedsToFetch.map(fetchOneFeed));
    const succeeded = settled.filter((r): r is PromiseFulfilledResult<NewsPost[]> => r.status === 'fulfilled');

    if (succeeded.length === 0) {
      throw new AllFeedsUnavailableError('All RSS feeds failed to load.');
    }

    let merged = succeeded.flatMap((r) => r.value);

    const seenUrls = new Set<string>();
    merged = merged.filter((post) => {
      if (seenUrls.has(post.url)) return false;
      seenUrls.add(post.url);
      return true;
    });

    merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    cache.set(cacheKey, { expiresAt: now() + cacheTtlMs, data: merged });
    return merged;
  }

  async function fetchNews(query: NewsQuery): Promise<NewsPost[]> {
    const merged = await getMergedFeed(query.source);
    if (!query.currencies) return merged;
    return merged.filter((post) => matchesCurrencies(post.title, query.currencies!));
  }

  return { fetchNews };
}
