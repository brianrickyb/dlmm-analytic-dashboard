import { describe, expect, it, vi } from 'vitest';
import { createCoinGeckoService } from './coingecko.js';

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
