import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerNewsRoutes } from './news.js';
import { AllFeedsUnavailableError } from '../services/rss.js';

describe('GET /api/news', () => {
  it('returns posts from the news service on success', async () => {
    const app = Fastify();
    const newsService = { fetchNews: vi.fn().mockResolvedValue([{ id: '1', title: 'Hello', url: 'https://a.example', sourceTitle: 'CoinDesk', publishedAt: '2026-07-20T00:00:00Z' }]) };
    registerNewsRoutes(app, { newsService });

    const response = await app.inject({ method: 'GET', url: '/api/news?currencies=BTC&source=coindesk' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ posts: [{ id: '1', title: 'Hello', url: 'https://a.example', sourceTitle: 'CoinDesk', publishedAt: '2026-07-20T00:00:00Z' }] });
    expect(newsService.fetchNews).toHaveBeenCalledWith({ currencies: 'BTC', source: 'coindesk' });
  });

  it('returns 503 when every RSS feed is unavailable', async () => {
    const app = Fastify();
    const newsService = { fetchNews: vi.fn().mockRejectedValue(new AllFeedsUnavailableError('all down')) };
    registerNewsRoutes(app, { newsService });

    const response = await app.inject({ method: 'GET', url: '/api/news' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'News feeds are unavailable right now.' });
  });
});
