import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerMarketsRoutes } from './markets.js';

const SAMPLE_HISTORY = [
  { date: '2026-08-10', open: 4000, high: 4010, low: 3990, close: 4005, volume: 1000 },
  { date: '2026-08-11', open: 4005, high: 4020, low: 4000, close: 4015, volume: 1100 },
];

function fakeDeps(overrides: Partial<Parameters<typeof registerMarketsRoutes>[1]> = {}) {
  return {
    mlService: {
      getDirection: vi.fn().mockResolvedValue({ direction: 'bullish', confidence: 0.7 }),
      getSentiment: vi.fn().mockResolvedValue({ sentiment: 'positive', score: 0.8 }),
    },
    xauHistoryService: { getFullHistory: vi.fn().mockResolvedValue(SAMPLE_HISTORY) },
    fredService: {
      getSummary: vi.fn().mockResolvedValue({
        fedFundsRate: { date: '2026-08-12', value: 5.33 },
        realYield10y: { date: '2026-08-12', value: 1.85 },
        cpi: { date: '2026-07-01', value: 312.5 },
        dollarIndex: { date: '2026-08-12', value: 121.4 },
      }),
    },
    newsService: {
      fetchNews: vi.fn().mockResolvedValue([
        {
          id: '1',
          title: 'Gold rallies',
          url: 'https://a.example',
          sourceTitle: 'FXStreet',
          publishedAt: '2026-08-12T00:00:00Z',
          sentiment: 'positive',
        },
      ]),
    },
    ...overrides,
  };
}

describe('GET /api/markets/:symbol/history', () => {
  it('returns the merged price history for xau', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/history' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ history: SAMPLE_HISTORY });
  });

  it('returns 404 for an unsupported symbol', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps());

    const response = await app.inject({ method: 'GET', url: '/api/markets/nasdaq/history' });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/markets/:symbol/signal', () => {
  it('returns 200 with every section populated when all upstreams succeed', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.price).toEqual(SAMPLE_HISTORY[SAMPLE_HISTORY.length - 1]);
    expect(body.direction).toEqual({ data: { direction: 'bullish', confidence: 0.7 } });
    expect(body.fundamentals.data.fedFundsRate).toEqual({ date: '2026-08-12', value: 5.33 });
    expect(body.news.data).toHaveLength(1);
    expect(body.news.data[0].mlSentiment).toEqual({ sentiment: 'positive', score: 0.8 });
    // the pre-existing NewsPost.sentiment string (keyword classifier, used by the News page)
    // must survive untouched — the route must not overwrite it with the ML result.
    expect(body.news.data[0].sentiment).toBe('positive');
    expect(deps.mlService.getDirection).toHaveBeenCalledWith(SAMPLE_HISTORY);
  });

  it('degrades the direction section to an error without failing the whole response', async () => {
    const app = Fastify();
    const deps = fakeDeps({
      mlService: {
        getDirection: vi.fn().mockRejectedValue(new Error('ml-service down')),
        getSentiment: vi.fn().mockResolvedValue({ sentiment: 'neutral', score: 0.5 }),
      },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.direction.data).toBeNull();
    expect(typeof body.direction.error).toBe('string');
    expect(body.fundamentals.data).not.toBeNull(); // other sections still populated
  });

  it('degrades the fundamentals section to an error without failing the whole response', async () => {
    const app = Fastify();
    const deps = fakeDeps({
      fredService: { getSummary: vi.fn().mockRejectedValue(new Error('FRED_API_KEY is not configured')) },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.fundamentals.data).toBeNull();
    expect(typeof body.fundamentals.error).toBe('string');
    expect(body.direction.data).not.toBeNull();
  });

  it('degrades the news section to an error, and skips per-article sentiment when news itself fails', async () => {
    const app = Fastify();
    const deps = fakeDeps({
      newsService: { fetchNews: vi.fn().mockRejectedValue(new Error('all feeds down')) },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.news.data).toBeNull();
    expect(typeof body.news.error).toBe('string');
  });

  it("degrades one article's sentiment to null without failing the news section", async () => {
    const app = Fastify();
    const deps = fakeDeps({
      mlService: {
        getDirection: vi.fn().mockResolvedValue({ direction: 'bullish', confidence: 0.7 }),
        getSentiment: vi.fn().mockRejectedValue(new Error('ml-service sentiment down')),
      },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.news.data).toHaveLength(1);
    expect(body.news.data[0].mlSentiment).toBeNull();
  });

  it('returns 404 for an unsupported symbol', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps());

    const response = await app.inject({ method: 'GET', url: '/api/markets/nasdaq/signal' });

    expect(response.statusCode).toBe(404);
  });
});
