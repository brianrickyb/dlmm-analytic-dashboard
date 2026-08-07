import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAccountRoutes } from './account.js';

describe('GET /api/account/me', () => {
  it("returns the authenticated user's email and premium status on success", async () => {
    const app = Fastify();
    registerAccountRoutes(app, {
      verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
      subscriptionsService: { isPremium: async () => true },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/me',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'me@example.com', isPremium: true });
  });

  it('returns isPremium: false when the user has no active subscription', async () => {
    const app = Fastify();
    registerAccountRoutes(app, {
      verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
      subscriptionsService: { isPremium: async () => false },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/me',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'me@example.com', isPremium: false });
  });

  it('returns isPremium: false when no subscriptions service is configured', async () => {
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
    expect(response.json()).toEqual({ email: 'me@example.com', isPremium: false });
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
