import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerPoolsRoutes } from './pools.js';
import { MeteoraUnavailableError } from '../services/meteora.js';

function fakePool(poolAddress: string) {
  return { id: poolAddress, poolAddress, name: 'FOO-BAR', tokenX: {} as any, tokenY: {} as any, binStep: 20, baseFeeBps: 3, isActive: true, stats: { poolId: poolAddress, snapshotAt: '2026-08-10T00:00:00Z', tvlUsd: 1_000_000, volume24hUsd: 200_000, fees24hUsd: 100, feeApr24h: 36.5, currentPrice: 1.5 } };
}

describe('GET /api/pools', () => {
  it('returns the curated pool list on success', async () => {
    const app = Fastify();
    const pools = [fakePool('A')];
    const meteoraService = { getPools: vi.fn().mockResolvedValue(pools), getPoolByAddress: vi.fn(), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pools });
  });

  it('returns 503 when Meteora is unavailable', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn().mockRejectedValue(new MeteoraUnavailableError('down')), getPoolByAddress: vi.fn(), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Pool data is unavailable right now.' });
  });
});

describe('GET /api/pools/:poolAddress', () => {
  it('returns the pool when found', async () => {
    const app = Fastify();
    const pool = fakePool('A');
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pool });
  });

  it('returns 404 when the pool is not in the curated set', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(null), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/NOPE' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Pool not found.' });
  });
});

describe('GET /api/pools/:poolAddress/history', () => {
  it('returns snapshots when the pool is found', async () => {
    const app = Fastify();
    const pool = fakePool('A');
    const snapshots = [{ poolId: 'A', snapshotAt: '2026-08-09T00:00:00.000Z', tvlUsd: 1, volume24hUsd: 1, fees24hUsd: 1, feeApr24h: 1, currentPrice: 1 }];
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn().mockResolvedValue(snapshots) };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/history?days=30' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ snapshots });
    expect(meteoraService.getPoolHistory).toHaveBeenCalledWith('A', 30);
  });

  it('defaults days to 90 when not provided', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(fakePool('A')), getPoolHistory: vi.fn().mockResolvedValue([]) };
    registerPoolsRoutes(app, { meteoraService });

    await app.inject({ method: 'GET', url: '/api/pools/A/history' });

    expect(meteoraService.getPoolHistory).toHaveBeenCalledWith('A', 90);
  });

  it('returns 400 for an out-of-range days value', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn(), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/history?days=9999' });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the pool is not found', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(null), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/NOPE/history' });

    expect(response.statusCode).toBe(404);
  });
});
