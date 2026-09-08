import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerPositionsRoutes, getCachedCostBasis, saveCostBasis, type OnChainPosition, type PositionCostBasis } from './positions.js';

const wallet = '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q';

describe('GET /api/positions', () => {
  it('returns on-chain positions for the given wallet', async () => {
    const positions: OnChainPosition[] = [
      {
        poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
        positionAddress: '95Er1xjjbQkYwgtqAe5s3kYaH4WooferaWVXkd3Apnbz',
        lowerBinId: -100,
        upperBinId: 100,
        activeBinId: 0,
        currentPrice: 1000,
        lowerPrice: 900,
        upperPrice: 1100,
        liquidity: { xAmount: 5, yAmount: 500, valueInQuote: 5500 },
        fees: { xAmount: 0.01, yAmount: 1, valueInQuote: 11 },
      },
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

describe('GET /api/positions/:positionAddress/cost-basis', () => {
  const positionAddress = '95Er1xjjbQkYwgtqAe5s3kYaH4WooferaWVXkd3Apnbz';
  const poolAddress = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';

  it('returns the cost basis when one is resolvable', async () => {
    const costBasis: PositionCostBasis = {
      entryDate: '2026-06-01',
      entryPrice: 1000,
      depositXAmount: 5,
      depositYAmount: 500,
      txSignature: 'sig1',
    };
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => costBasis });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: true, costBasis });
  });

  it('returns available: false when cost basis cannot be resolved', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => null });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: false });
  });

  it('returns 400 when the pool query parameter is missing or invalid', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => null });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis` });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when positionAddress is not a valid public key', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => null });

    const response = await app.inject({ method: 'GET', url: `/api/positions/not-a-pubkey/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(400);
  });

  it('returns 503 when Solana RPC is unavailable', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, {
      fetchPositions: async () => [],
      fetchCostBasis: async () => {
        throw new (await import('../lib/dlmmError.js')).SolanaUnavailableError();
      },
    });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(503);
  });
});

describe('getCachedCostBasis / saveCostBasis Supabase error handling', () => {
  function fakeSupabaseAdmin(opts: {
    maybeSingle?: { data: unknown; error: { message: string } | null };
    insert?: { error: { message: string } | null };
  }): SupabaseClient {
    const select = () => ({
      eq: () => ({
        maybeSingle: async () => opts.maybeSingle ?? { data: null, error: null },
      }),
    });
    const insert = async () => opts.insert ?? { error: null };
    return { from: () => ({ select, insert }) } as unknown as SupabaseClient;
  }

  it('getCachedCostBasis logs and treats a Supabase read error as a cache miss instead of throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabaseAdmin = fakeSupabaseAdmin({ maybeSingle: { data: null, error: { message: 'db down' } } });

    const result = await getCachedCostBasis(supabaseAdmin, 'some-position');

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('[positions] failed reading position_cost_basis cache', { message: 'db down' });
    errorSpy.mockRestore();
  });

  it('saveCostBasis logs a failed write instead of leaving it silently invisible', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabaseAdmin = fakeSupabaseAdmin({ insert: { error: { message: 'db down' } } });
    const costBasis: PositionCostBasis = {
      entryDate: '2026-06-01',
      entryPrice: 1000,
      depositXAmount: 5,
      depositYAmount: 500,
      txSignature: 'sig1',
    };

    await expect(saveCostBasis(supabaseAdmin, 'position-1', 'pool-1', costBasis)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith('[positions] failed to persist position_cost_basis', { message: 'db down' });
    errorSpy.mockRestore();
  });
});
