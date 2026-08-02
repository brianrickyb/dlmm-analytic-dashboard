import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAccountRoutes } from './account.js';

describe('GET /api/account/me', () => {
  it("returns the authenticated user's email on success", async () => {
    const app = Fastify();
    registerAccountRoutes(app, {
      verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/me',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'me@example.com' });
  });

  it('returns 401 when no token is provided', async () => {
    const app = Fastify();
    registerAccountRoutes(app, {
      verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/account/me' });

    expect(response.statusCode).toBe(401);
  });

  it('returns 500 when Supabase configuration is missing', async () => {
    const app = Fastify();
    registerAccountRoutes(app, {});

    const response = await app.inject({ method: 'GET', url: '/api/account/me' });

    expect(response.statusCode).toBe(500);
  });
});
