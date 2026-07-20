import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerNewsRoutes } from './news.js';

describe('GET /api/news', () => {
  it('returns 500 when CRYPTOPANIC_API_KEY is not configured', async () => {
    const app = Fastify();
    registerNewsRoutes(app, { apiKey: undefined });

    const response = await app.inject({ method: 'GET', url: '/api/news' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Server is missing CRYPTOPANIC_API_KEY.' });
  });
});
