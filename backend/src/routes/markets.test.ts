import Fastify from 'fastify';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { registerMarketsRoutes } from './markets.js';

const SAMPLE_HISTORY = [
  { date: '2026-08-10', open: 4000, high: 4010, low: 3990, close: 4005, volume: 1000 },
  { date: '2026-08-11', open: 4005, high: 4020, low: 4000, close: 4015, volume: 1100 },
];

// Deterministic clock: two days after the newest sample row -- comfortably inside
// PRICE_STALE_AFTER_DAYS, so the default fixtures exercise the "fresh" path.
const DEFAULT_NOW = () => Date.parse('2026-08-13T00:00:00Z');

function fakeDeps(overrides: Partial<Parameters<typeof registerMarketsRoutes>[1]> = {}) {
  return {
    now: DEFAULT_NOW,
    mlService: {
      getDirection: vi.fn().mockResolvedValue({ direction: 'bullish', confidence: 0.7 }),
      getSentiment: vi.fn().mockResolvedValue({ sentiment: 'positive', score: 0.8 }),
    },
    marketHistoryService: {
      getXauMergedHistory: vi.fn().mockResolvedValue({ rows: SAMPLE_HISTORY, estimatedFrom: null }),
      getLiveFullHistory: vi.fn().mockResolvedValue({
        rows: SAMPLE_HISTORY.map((row) => ({ ...row, close: row.close / 4000 })),
        estimatedFrom: null,
      }),
    },
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
  it('returns the merged price history for xau, flagging no synthetic tail when all rows are real', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/history' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.history).toEqual(SAMPLE_HISTORY);
    expect(body.estimatedFrom).toBeNull();
    expect(body.market).toEqual({ key: 'xau', pair: 'XAU/USD', label: 'Gold' });
    expect(deps.marketHistoryService.getXauMergedHistory).toHaveBeenCalledTimes(1);
  });

  it('passes the synthetic-tail boundary through so clients can tell estimates from real OHLCV', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps({
      marketHistoryService: {
        getXauMergedHistory: vi.fn().mockResolvedValue({ rows: SAMPLE_HISTORY, estimatedFrom: '2026-01-31' }),
        getLiveFullHistory: vi.fn(),
      },
    }));

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/history' });

    expect(response.json().estimatedFrom).toBe('2026-01-31');
  });

  it('routes FX symbols to the Yahoo-backed live history by their Yahoo symbol', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/eurusd/history' });

    expect(response.statusCode).toBe(200);
    expect(response.json().market.pair).toBe('EUR/USD');
    expect(deps.marketHistoryService.getLiveFullHistory).toHaveBeenCalledWith('EURUSD=X');
  });

  it('returns 404 for an unsupported symbol', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps());

    const response = await app.inject({ method: 'GET', url: '/api/markets/nasdaq/history' });

    expect(response.statusCode).toBe(404);
  });

  it('degrades to 503 when the history service fails entirely', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps({
      marketHistoryService: {
        getXauMergedHistory: vi.fn().mockRejectedValue(new Error('every provider down')),
        getLiveFullHistory: vi.fn().mockRejectedValue(new Error('yahoo down')),
      },
    }));

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/history' });

    expect(response.statusCode).toBe(503);
    expect(typeof response.json().error).toBe('string');
  });
});

describe('GET /api/markets/:symbol/signal — xau (direction model market)', () => {
  it('returns 200 with every section populated when all upstreams succeed', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.price).toEqual(SAMPLE_HISTORY[SAMPLE_HISTORY.length - 1]);
    // Newest sample row is 2 days old on the injected clock -> fresh.
    expect(body.freshness).toEqual({ asOf: '2026-08-11', stale: false });
    expect(body.direction).toEqual({ data: { direction: 'bullish', confidence: 0.7 } });
    // Technical readout is computed locally and always present alongside ML.
    expect(body.technical.data).not.toBeNull();
    expect(body.fundamentals.data.fedFundsRate).toEqual({ date: '2026-08-12', value: 5.33 });
    expect(body.news.data).toHaveLength(1);
    expect(body.news.data[0].mlSentiment).toEqual({ sentiment: 'positive', score: 0.8 });
    // the pre-existing NewsPost.sentiment string (keyword classifier, used by the News page)
    // must survive untouched — the route must not overwrite it with the ML result.
    expect(body.news.data[0].sentiment).toBe('positive');
    expect(deps.mlService.getDirection).toHaveBeenCalledWith(SAMPLE_HISTORY);
    expect(deps.newsService.fetchNews).toHaveBeenCalledWith({ currencies: 'XAU' });
  });

  it('marks the price stale once the newest row is older than a week', async () => {
    const app = Fastify();
    // 35 days after the newest sample row -- every live provider being down
    // leaves the merged history frozen at the static CSV end; this is exactly that state.
    registerMarketsRoutes(app, fakeDeps({ now: () => Date.parse('2026-09-15T00:00:00Z') }));

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.json().freshness).toEqual({ asOf: '2026-08-11', stale: true });
  });

  it('sends only the trailing DIRECTION_INPUT_ROWS window to ml-service instead of the full series', async () => {
    const longHistory = Array.from({ length: 300 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 9, 1) + i * 86_400_000).toISOString().slice(0, 10),
      open: 4000, high: 4010, low: 3990, close: 4005 + i, volume: 1000,
    }));
    const app = Fastify();
    const deps = fakeDeps({
      marketHistoryService: {
        getXauMergedHistory: vi.fn().mockResolvedValue({ rows: longHistory, estimatedFrom: null }),
        getLiveFullHistory: vi.fn(),
      },
    });
    registerMarketsRoutes(app, deps);

    await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(deps.mlService.getDirection).toHaveBeenCalledTimes(1);
    // fakeDeps' overrides spread widens the property to a union; the mock is guaranteed here.
    const sentRows = (deps.mlService.getDirection as Mock).mock.calls[0][0];
    expect(sentRows).toHaveLength(260);
    expect(sentRows[0]).toEqual(longHistory[longHistory.length - 260]); // oldest kept row
    expect(sentRows[sentRows.length - 1]).toEqual(longHistory[longHistory.length - 1]);

    // The spot price still comes from the FULL history, not the truncated window.
    const body = (await app.inject({ method: 'GET', url: '/api/markets/xau/signal' })).json();
    expect(body.price).toEqual(longHistory[longHistory.length - 1]);
  });

  it('caches sentiment per article id across requests so FinBERT is not re-inferred on every poll', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });
    await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(deps.mlService.getSentiment).toHaveBeenCalledTimes(1); // one article, inferred once
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
    expect(body.technical.data).not.toBeNull();
  });
});

describe('GET /api/markets/:symbol/signal — forex markets (no direction model)', () => {
  it('never calls the XAU-calibrated direction model and explains why in the section error', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/eurusd/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(deps.mlService.getDirection).not.toHaveBeenCalled();
    expect(body.direction.data).toBeNull();
    expect(body.direction.error).toMatch(/XAU\/USD/i);
    expect(body.market).toEqual({ key: 'eurusd', pair: 'EUR/USD', label: 'Euro' });
    // Everything else still works for FX pairs.
    expect(body.price.close).toBeCloseTo(SAMPLE_HISTORY[1].close / 4000, 10);
    expect(body.technical.data).not.toBeNull();
    expect(body.fundamentals.data).not.toBeNull();
  });

  it('filters news with the market-specific currency aliases', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    await app.inject({ method: 'GET', url: '/api/markets/usdjpy/signal' });

    expect(deps.newsService.fetchNews).toHaveBeenCalledWith({ currencies: 'JPY' });
  });

  it('returns 404 for an unsupported symbol', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps());

    const response = await app.inject({ method: 'GET', url: '/api/markets/nasdaq/signal' });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/markets/:symbol/signal — shared degradation behavior', () => {
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
});
