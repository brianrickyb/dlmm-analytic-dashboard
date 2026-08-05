import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createRequireAuth } from './requireAuth.js';
import type { AuthResult } from './requireAuth.js';

function buildApp(verifyToken: ((token: string) => Promise<AuthResult>) | undefined) {
  const app = Fastify();
  const requireAuth = createRequireAuth(verifyToken);
  app.get('/protected', { preHandler: requireAuth }, async (request) => {
    return { email: request.user!.email };
  });
  return app;
}

describe('createRequireAuth', () => {
  it('returns 500 when verifyToken is not configured', async () => {
    const app = buildApp(undefined);

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Server is missing Supabase configuration.' });
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const app = buildApp(async () => ({ kind: 'ok', user: { id: '1', email: 'a@b.com' } }));

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Missing bearer token.' });
  });

  it('returns 401 when the Authorization header is not a Bearer token', async () => {
    const app = buildApp(async () => ({ kind: 'ok', user: { id: '1', email: 'a@b.com' } }));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc123' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when verifyToken reports the token is invalid', async () => {
    const app = buildApp(async () => ({ kind: 'invalid' }));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer bad-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid or expired session.' });
  });

  it('returns 503 when verifyToken reports the auth service is unavailable', async () => {
    const app = buildApp(async () => ({ kind: 'unavailable' }));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer some-token' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Auth service is unavailable right now.' });
  });

  it('attaches the user to the request and lets the route handler run when the token is valid', async () => {
    const app = buildApp(async (token) => {
      expect(token).toBe('good-token');
      return { kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'me@example.com' });
  });
});
