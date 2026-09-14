export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  marketCapRank: number | null;
  priceUsd: number;
  priceChangePct24h: number;
  /** 7-day price sparkline, oldest first. Empty when the markets lookup fails -- decorative, not critical. */
  sparkline: number[];
}

export class CoinGeckoUnavailableError extends Error {}

export interface CoinGeckoServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const TRENDING_URL = 'https://api.coingecko.com/api/v3/search/trending';
const MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';

function parseTrending(payload: unknown): TrendingCoin[] | null {
  if (typeof payload !== 'object' || payload === null || !('coins' in payload)) return null;
  const coins = (payload as { coins: unknown }).coins;
  if (!Array.isArray(coins)) return null;

  const result: TrendingCoin[] = [];
  for (const raw of coins) {
    const item = (raw as Record<string, unknown> | undefined)?.item as Record<string, unknown> | undefined;
    if (!item) return null;
    const data = item.data as Record<string, unknown> | undefined;
    const priceChangeObj = data?.price_change_percentage_24h as Record<string, unknown> | undefined;
    const priceChange = priceChangeObj?.usd;

    if (
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.symbol !== 'string' ||
      typeof data?.price !== 'number' ||
      typeof priceChange !== 'number'
    ) {
      return null;
    }

    result.push({
      id: item.id,
      name: item.name,
      symbol: item.symbol,
      marketCapRank: typeof item.market_cap_rank === 'number' ? item.market_cap_rank : null,
      priceUsd: data.price,
      priceChangePct24h: priceChange,
      sparkline: [],
    });
  }
  return result;
}

function sortByMarketCapRankDesc(coins: TrendingCoin[]): TrendingCoin[] {
  return [...coins].sort((a, b) => {
    if (a.marketCapRank === null && b.marketCapRank === null) return 0;
    if (a.marketCapRank === null) return -1;
    if (b.marketCapRank === null) return 1;
    return b.marketCapRank - a.marketCapRank;
  });
}

async function fetchSparklines(fetchImpl: typeof fetch, ids: string[]): Promise<Map<string, number[]>> {
  if (ids.length === 0) return new Map();

  const params = new URLSearchParams({ vs_currency: 'usd', ids: ids.join(','), sparkline: 'true' });
  let response: Response;
  try {
    response = await fetchImpl(`${MARKETS_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return new Map();
  }
  if (!response.ok) return new Map();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new Map();
  }
  if (!Array.isArray(payload)) return new Map();

  const map = new Map<string, number[]>();
  for (const raw of payload) {
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string') continue;
    const sparkline = item.sparkline_in_7d as Record<string, unknown> | undefined;
    const prices = sparkline?.price;
    if (Array.isArray(prices)) {
      map.set(item.id, prices.filter((p): p is number => typeof p === 'number'));
    }
  }
  return map;
}

export function createCoinGeckoService(deps: CoinGeckoServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  let cache: { expiresAt: number; data: TrendingCoin[] } | null = null;

  async function getTrending(): Promise<TrendingCoin[]> {
    if (cache && cache.expiresAt > now()) {
      return cache.data;
    }

    let response: Response;
    try {
      response = await fetchImpl(TRENDING_URL, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      throw new CoinGeckoUnavailableError('Failed to reach CoinGecko trending endpoint', { cause: err });
    }

    if (!response.ok) {
      throw new CoinGeckoUnavailableError(`CoinGecko returned status ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new CoinGeckoUnavailableError('CoinGecko response was not valid JSON', { cause: err });
    }

    const coins = parseTrending(payload);
    if (coins === null) {
      throw new CoinGeckoUnavailableError('CoinGecko response missing expected fields');
    }

    const sparklineMap = await fetchSparklines(fetchImpl, coins.map((c) => c.id));
    const withSparkline = coins.map((c) => ({ ...c, sparkline: sparklineMap.get(c.id) ?? [] }));

    const sorted = sortByMarketCapRankDesc(withSparkline);
    cache = { expiresAt: now() + cacheTtlMs, data: sorted };
    return sorted;
  }

  return { getTrending };
}
