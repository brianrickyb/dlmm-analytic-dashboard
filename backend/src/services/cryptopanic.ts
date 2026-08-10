export interface NewsMatch {
  title: string;
  url: string;
  publishedAt: string;
}

export interface CryptoPanicServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  apiKey?: string;
}

const DEFAULT_CACHE_TTL_MS = 90 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — "no news found" changes far less often than a real hit does
const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;
const POSTS_URL = 'https://cryptopanic.com/api/v1/posts/';
const DEFAULT_TOKEN_NEWS_LIMIT = 3;
const DEFAULT_TOKEN_NEWS_WINDOW_HOURS = 7 * 24;

// This service is deliberately best-effort and must never throw, unlike its sibling services
// (bybit.ts/coingecko.ts/geckoterminal.ts) — news is a nice-to-have enrichment, not a data source
// the route depends on, so every failure path here resolves to `null` instead of propagating.
export function createCryptoPanicService(deps: CryptoPanicServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const apiKey = deps.apiKey ?? process.env.CRYPTOPANIC_API_KEY;
  const cache = new Map<string, { expiresAt: number; data: NewsMatch | null }>();
  const tokenCache = new Map<string, { expiresAt: number; data: NewsMatch[] }>();

  async function getRecentNewsForSymbol(symbol: string): Promise<NewsMatch | null> {
    if (!apiKey) return null;

    const cached = cache.get(symbol);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const result = await fetchNews(symbol);
    const ttl = result === null ? NEGATIVE_CACHE_TTL_MS : cacheTtlMs;
    cache.set(symbol, { expiresAt: now() + ttl, data: result });
    return result;
  }

  async function fetchNews(symbol: string): Promise<NewsMatch | null> {
    let response: Response;
    try {
      const url = `${POSTS_URL}?auth_token=${encodeURIComponent(apiKey!)}&currencies=${encodeURIComponent(symbol)}`;
      response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    const results = (payload as { results?: unknown })?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const first = results[0] as Record<string, unknown>;
    const publishedAt = typeof first.published_at === 'string' ? first.published_at : null;
    const title = typeof first.title === 'string' ? first.title : null;
    const url = typeof first.url === 'string' ? first.url : null;
    if (!publishedAt || !title || !url) return null;

    const publishedAtMs = Date.parse(publishedAt);
    if (Number.isNaN(publishedAtMs)) return null;
    if (now() - publishedAtMs > FRESHNESS_WINDOW_MS) return null;

    return { title, url, publishedAt };
  }

  async function getRecentNewsForToken(
    symbol: string,
    options: { limit?: number; windowHours?: number } = {},
  ): Promise<NewsMatch[]> {
    if (!apiKey) return [];

    const limit = options.limit ?? DEFAULT_TOKEN_NEWS_LIMIT;
    const windowHours = options.windowHours ?? DEFAULT_TOKEN_NEWS_WINDOW_HOURS;
    const cacheKey = `${symbol}:${limit}:${windowHours}`;

    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const result = await fetchTokenNews(symbol, limit, windowHours);
    const ttl = result.length === 0 ? NEGATIVE_CACHE_TTL_MS : cacheTtlMs;
    tokenCache.set(cacheKey, { expiresAt: now() + ttl, data: result });
    return result;
  }

  async function fetchTokenNews(symbol: string, limit: number, windowHours: number): Promise<NewsMatch[]> {
    let response: Response;
    try {
      const url = `${POSTS_URL}?auth_token=${encodeURIComponent(apiKey!)}&currencies=${encodeURIComponent(symbol)}`;
      response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      return [];
    }
    if (!response.ok) return [];

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return [];
    }

    const results = (payload as { results?: unknown })?.results;
    if (!Array.isArray(results)) return [];

    const windowMs = windowHours * 60 * 60 * 1000;
    const matches: NewsMatch[] = [];
    for (const raw of results) {
      const item = raw as Record<string, unknown>;
      const publishedAt = typeof item.published_at === 'string' ? item.published_at : null;
      const title = typeof item.title === 'string' ? item.title : null;
      const url = typeof item.url === 'string' ? item.url : null;
      if (!publishedAt || !title || !url) continue;

      const publishedAtMs = Date.parse(publishedAt);
      if (Number.isNaN(publishedAtMs)) continue;
      if (now() - publishedAtMs > windowMs) continue;

      matches.push({ title, url, publishedAt });
      if (matches.length >= limit) break;
    }
    return matches;
  }

  return { getRecentNewsForSymbol, getRecentNewsForToken };
}
