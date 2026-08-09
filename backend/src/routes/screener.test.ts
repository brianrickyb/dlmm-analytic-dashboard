import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerScreenerRoutes } from './screener.js';
import { BybitUnavailableError } from '../services/bybit.js';
import { CoinGeckoUnavailableError } from '../services/coingecko.js';
import { GeckoTerminalUnavailableError } from '../services/geckoterminal.js';

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

describe('GET /api/screener/pump-watch', () => {
  it('returns items combining candidates with per-symbol news', async () => {
    const app = Fastify();
    const candidates = [
      { poolId: 'a', network: 'solana', dex: 'pump-fun', symbol: 'FOO', priceChangePct6h: 40, volumeUsd24h: 100000, poolCreatedAt: '2026-08-09T00:00:00Z', poolUrl: 'https://www.geckoterminal.com/solana/pools/a' },
      { poolId: 'b', network: 'solana', dex: 'raydium', symbol: 'BAR', priceChangePct6h: 30, volumeUsd24h: 200000, poolCreatedAt: '2026-08-09T00:00:00Z', poolUrl: 'https://www.geckoterminal.com/solana/pools/b' },
    ];
    const geckoTerminalService = { getPumpCandidates: vi.fn().mockResolvedValue(candidates) };
    const news: Record<string, { title: string; url: string; publishedAt: string } | null> = {
      FOO: { title: 'FOO pumps', url: 'https://example.com/foo', publishedAt: '2026-08-09T11:00:00Z' },
      BAR: null,
    };
    const cryptoPanicService = { getRecentNewsForSymbol: vi.fn(async (symbol: string) => news[symbol] ?? null) };
    registerScreenerRoutes(app, { geckoTerminalService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/pump-watch' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        { ...candidates[0], news: news.FOO },
        { ...candidates[1], news: null },
      ],
    });
  });

  it('returns 503 when GeckoTerminal is unavailable', async () => {
    const app = Fastify();
    const geckoTerminalService = { getPumpCandidates: vi.fn().mockRejectedValue(new GeckoTerminalUnavailableError('down')) };
    const cryptoPanicService = { getRecentNewsForSymbol: vi.fn() };
    registerScreenerRoutes(app, { geckoTerminalService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/pump-watch' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Pump watch data is unavailable right now.' });
  });

  it('still returns a candidate with news: null when CryptoPanic has nothing for it', async () => {
    const app = Fastify();
    const candidates = [
      { poolId: 'a', network: 'solana', dex: 'pump-fun', symbol: 'FOO', priceChangePct6h: 40, volumeUsd24h: 100000, poolCreatedAt: '2026-08-09T00:00:00Z', poolUrl: 'https://www.geckoterminal.com/solana/pools/a' },
    ];
    const geckoTerminalService = { getPumpCandidates: vi.fn().mockResolvedValue(candidates) };
    const cryptoPanicService = { getRecentNewsForSymbol: vi.fn().mockResolvedValue(null) };
    registerScreenerRoutes(app, { geckoTerminalService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/pump-watch' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [{ ...candidates[0], news: null }] });
  });
});
