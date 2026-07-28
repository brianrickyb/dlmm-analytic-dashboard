import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerScreenerRoutes } from './screener.js';
import { BybitUnavailableError } from '../services/bybit.js';
import { CoinGeckoUnavailableError } from '../services/coingecko.js';

describe('GET /api/screener/majors', () => {
  it('returns the majors result on success', async () => {
    const app = Fastify();
    const majorsResult = { pairs: [], topLongSymbols: [], topShortSymbols: [] };
    const bybitService = { getMajors: vi.fn().mockResolvedValue(majorsResult) };
    registerScreenerRoutes(app, { bybitService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/majors' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(majorsResult);
  });

  it('returns 503 when Bybit is unavailable', async () => {
    const app = Fastify();
    const bybitService = { getMajors: vi.fn().mockRejectedValue(new BybitUnavailableError('down')) };
    registerScreenerRoutes(app, { bybitService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/majors' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Market positioning data is unavailable right now.' });
  });
});

describe('GET /api/screener/trending', () => {
  it('returns the trending coins on success', async () => {
    const app = Fastify();
    const coins = [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', marketCapRank: 1, priceUsd: 63000, priceChangePct24h: -2.1 }];
    const coinGeckoService = { getTrending: vi.fn().mockResolvedValue(coins) };
    registerScreenerRoutes(app, { coinGeckoService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/trending' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ coins });
  });

  it('returns 503 when CoinGecko is unavailable', async () => {
    const app = Fastify();
    const coinGeckoService = { getTrending: vi.fn().mockRejectedValue(new CoinGeckoUnavailableError('down')) };
    registerScreenerRoutes(app, { coinGeckoService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/trending' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Trending data is unavailable right now.' });
  });
});
