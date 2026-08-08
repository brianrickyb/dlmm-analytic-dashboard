import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerPositionsRoutes, type OnChainPosition } from './positions.js';

const wallet = '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q';

describe('GET /api/positions', () => {
  it('returns on-chain positions for the given wallet', async () => {
    const positions: OnChainPosition[] = [
      { poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', positionAddress: '95Er1xjjbQkYwgtqAe5s3kYaH4WooferaWVXkd3Apnbz' },
    ];
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => positions });

    const response = await app.inject({ method: 'GET', url: `/api/positions?wallet=${wallet}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ positions });
  });

  it('returns 400 when wallet query param is missing', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [] });

    const response = await app.inject({ method: 'GET', url: '/api/positions' });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when wallet query param is not a valid public key', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [] });

    const response = await app.inject({ method: 'GET', url: '/api/positions?wallet=not-a-pubkey' });

    expect(response.statusCode).toBe(400);
  });

  it('returns 503 when Solana RPC is unavailable', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, {
      fetchPositions: async () => {
        throw new (await import('../lib/dlmmError.js')).SolanaUnavailableError();
      },
    });

    const response = await app.inject({ method: 'GET', url: `/api/positions?wallet=${wallet}` });

    expect(response.statusCode).toBe(503);
  });
});
