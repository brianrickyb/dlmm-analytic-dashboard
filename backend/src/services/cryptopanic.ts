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
const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;
const POSTS_URL = 'https://cryptopanic.com/api/v1/posts/';

export function createCryptoPanicService(deps: CryptoPanicServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const apiKey = deps.apiKey ?? process.env.CRYPTOPANIC_API_KEY;
  const cache = new Map<string, { expiresAt: number; data: NewsMatch | null }>();

  async function getRecentNewsForSymbol(symbol: string): Promise<NewsMatch | null> {
    if (!apiKey) return null;

    const cached = cache.get(symbol);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const result = await fetchNews(symbol);
    cache.set(symbol, { expiresAt: now() + cacheTtlMs, data: result });
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

  return { getRecentNewsForSymbol };
}
