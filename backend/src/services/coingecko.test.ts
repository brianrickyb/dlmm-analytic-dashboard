import { describe, expect, it, vi } from 'vitest';
import { createCoinGeckoService, CoinGeckoUnavailableError } from './coingecko.js';

function coinItem(overrides: { id: string; name: string; symbol: string; marketCapRank: number | null; price: number; changePct: number }) {
  return {
    item: {
      id: overrides.id,
      name: overrides.name,
      symbol: overrides.symbol,
      market_cap_rank: overrides.marketCapRank,
      data: {
        price: overrides.price,
        price_change_percentage_24h: { usd: overrides.changePct },
      },
    },
  };
}

function fakeFetchOnce(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('createCoinGeckoService — parsing and sorting', () => {
  it('parses the trending response into TrendingCoin[]', async () => {
    const body = {
      coins: [coinItem({ id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', marketCapRank: 1, price: 63000, changePct: -2.1 })],
    };
    const fetchImpl = fakeFetchOnce(body);
    const service = createCoinGeckoService({ fetchImpl });

    const coins = await service.getTrending();

    expect(coins).toEqual([
      { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', marketCapRank: 1, priceUsd: 63000, priceChangePct24h: -2.1 },
    ]);
  });

  it('sorts by market-cap rank descending, with unranked (null) coins first', async () => {
    const body = {
      coins: [
        coinItem({ id: 'big', name: 'Big', symbol: 'BIG', marketCapRank: 5, price: 1, changePct: 0 }),
        coinItem({ id: 'small', name: 'Small', symbol: 'SML', marketCapRank: 500, price: 1, changePct: 0 }),
        coinItem({ id: 'brand-new', name: 'Brand New', symbol: 'NEW', marketCapRank: null, price: 1, changePct: 0 }),
        coinItem({ id: 'medium', name: 'Medium', symbol: 'MED', marketCapRank: 100, price: 1, changePct: 0 }),
      ],
    };
    const fetchImpl = fakeFetchOnce(body);
    const service = createCoinGeckoService({ fetchImpl });

    const coins = await service.getTrending();

    expect(coins.map((c) => c.id)).toEqual(['brand-new', 'small', 'medium', 'big']);
  });
});

describe('createCoinGeckoService — error classification', () => {
  it('throws CoinGeckoUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createCoinGeckoService({ fetchImpl });

    await expect(service.getTrending()).rejects.toBeInstanceOf(CoinGeckoUnavailableError);
  });

  it('throws CoinGeckoUnavailableError on a 429 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createCoinGeckoService({ fetchImpl });

    await expect(service.getTrending()).rejects.toBeInstanceOf(CoinGeckoUnavailableError);
  });

  it('throws CoinGeckoUnavailableError on a 500 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const service = createCoinGeckoService({ fetchImpl });

    await expect(service.getTrending()).rejects.toBeInstanceOf(CoinGeckoUnavailableError);
  });

  it('throws CoinGeckoUnavailableError when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);
    const service = createCoinGeckoService({ fetchImpl });

    await expect(service.getTrending()).rejects.toBeInstanceOf(CoinGeckoUnavailableError);
  });

  it('throws CoinGeckoUnavailableError when the response is missing the coins field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ oops: true }) } as Response);
    const service = createCoinGeckoService({ fetchImpl });

    await expect(service.getTrending()).rejects.toBeInstanceOf(CoinGeckoUnavailableError);
  });
});

describe('createCoinGeckoService — caching', () => {
  it('reuses the cached result within the TTL', async () => {
    const fetchImpl = fakeFetchOnce({ coins: [] });
    let currentTime = 1_000_000;
    const service = createCoinGeckoService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000 });

    await service.getTrending();
    currentTime += 30_000;
    await service.getTrending();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakeFetchOnce({ coins: [] });
    let currentTime = 1_000_000;
    const service = createCoinGeckoService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000 });

    await service.getTrending();
    currentTime += 60_001;
    await service.getTrending();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
