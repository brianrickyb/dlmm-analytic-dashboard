export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  marketCapRank: number | null;
  priceUsd: number;
  priceChangePct24h: number;
}

export class CoinGeckoUnavailableError extends Error {}

export interface CoinGeckoServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const TRENDING_URL = 'https://api.coingecko.com/api/v3/search/trending';

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

    const sorted = sortByMarketCapRankDesc(coins);
    cache = { expiresAt: now() + cacheTtlMs, data: sorted };
    return sorted;
  }

  return { getTrending };
}
