export interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  currencies: string[];
  votes: {
    positive: number;
    negative: number;
    important: number;
  };
}

export interface NewsQuery {
  currencies?: string;
  filter?: string;
}

export class UpstreamUnavailableError extends Error {}
export class UpstreamRejectedError extends Error {}
export class UpstreamMalformedError extends Error {}

export interface NewsServiceDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 4 * 60 * 1000;
const CRYPTOPANIC_POSTS_URL = 'https://cryptopanic.com/api/v1/posts/';

function buildRequestUrl(query: NewsQuery, apiKey: string): string {
  const url = new URL(CRYPTOPANIC_POSTS_URL);
  url.searchParams.set('auth_token', apiKey);
  url.searchParams.set('public', 'true');
  if (query.currencies) url.searchParams.set('currencies', query.currencies);
  if (query.filter) url.searchParams.set('filter', query.filter);
  return url.toString();
}

function parsePosts(payload: unknown): CryptoPanicPost[] | null {
  if (typeof payload !== 'object' || payload === null || !('results' in payload)) return null;
  const results = (payload as { results: unknown }).results;
  if (!Array.isArray(results)) return null;

  const posts: CryptoPanicPost[] = [];
  for (const raw of results) {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const source = r.source as Record<string, unknown> | undefined;
    const votes = r.votes as Record<string, unknown> | undefined;
    const currencies = r.currencies as Array<Record<string, unknown>> | undefined;

    if (
      typeof r.id !== 'number' ||
      typeof r.title !== 'string' ||
      typeof r.url !== 'string' ||
      typeof r.published_at !== 'string' ||
      typeof source?.title !== 'string' ||
      typeof votes?.positive !== 'number' ||
      typeof votes?.negative !== 'number' ||
      typeof votes?.important !== 'number' ||
      !Array.isArray(currencies)
    ) {
      return null;
    }

    posts.push({
      id: r.id,
      title: r.title,
      url: r.url,
      sourceTitle: source.title,
      publishedAt: r.published_at,
      currencies: currencies.map((c) => String(c.code)),
      votes: { positive: votes.positive, negative: votes.negative, important: votes.important },
    });
  }
  return posts;
}

export function createNewsService(deps: NewsServiceDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, { expiresAt: number; data: CryptoPanicPost[] }>();

  function cacheKey(query: NewsQuery): string {
    return `${query.currencies ?? ''}|${query.filter ?? ''}`;
  }

  async function fetchNews(query: NewsQuery): Promise<CryptoPanicPost[]> {
    const key = cacheKey(query);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const url = buildRequestUrl(query, deps.apiKey);
    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch (err) {
      throw new UpstreamUnavailableError('CryptoPanic request failed', { cause: err });
    }

    if (response.status === 401 || response.status === 429) {
      throw new UpstreamRejectedError(`CryptoPanic rejected the request (status ${response.status})`);
    }
    if (!response.ok) {
      throw new UpstreamUnavailableError(`CryptoPanic returned status ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new UpstreamMalformedError('CryptoPanic response was not valid JSON', { cause: err });
    }

    const posts = parsePosts(payload);
    if (posts === null) {
      throw new UpstreamMalformedError('CryptoPanic response missing expected fields');
    }

    cache.set(key, { expiresAt: now() + cacheTtlMs, data: posts });
    return posts;
  }

  return { fetchNews };
}
