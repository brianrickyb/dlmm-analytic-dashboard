import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerPositionsRoutes } from './positions.js';

const validBody = {
  walletAddress: '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q',
  poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  txSignature: '5'.repeat(88),
};

function fakeSupabase(overrides: Partial<{ insertError: { code: string; message: string } | null; rows: unknown[] }> = {}) {
  const insertError = overrides.insertError ?? null;
  const rows = overrides.rows ?? [];
  return {
    from: () => ({
      insert: () => ({ error: insertError }),
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  } as unknown as never;
}

describe('POST /api/positions', () => {
  it('inserts a position when the signature verifies on-chain', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => true });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: validBody });

    expect(response.statusCode).toBe(200);
  });

  it('returns 422 when the signature does not verify on-chain', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => false });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: validBody });

    expect(response.statusCode).toBe(422);
  });

  it('returns 400 on an invalid body', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => true });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: { ...validBody, walletAddress: 'bad' } });

    expect(response.statusCode).toBe(400);
  });

  it('returns 200 (idempotent) when the signature was already recorded', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, {
      supabase: fakeSupabase({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
      verifySignature: async () => true,
    });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: validBody });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /api/positions', () => {
  it('returns rows for the given wallet', async () => {
    const rows = [
      {
        id: '1',
        wallet_address: validBody.walletAddress,
        pool_address: validBody.poolAddress,
        tx_signature: validBody.txSignature,
        created_at: '2026-08-08T00:00:00Z',
      },
    ];
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase({ rows }), verifySignature: async () => true });

    const response = await app.inject({ method: 'GET', url: `/api/positions?wallet=${validBody.walletAddress}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ positions: rows });
  });

  it('returns 400 when wallet query param is missing', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => true });

    const response = await app.inject({ method: 'GET', url: '/api/positions' });

    expect(response.statusCode).toBe(400);
  });
});
