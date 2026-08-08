import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerLiquidityRoutes } from './liquidity.js';
import { SolanaUnavailableError, PoolNotFoundError } from '../lib/dlmmError.js';

const validBody = {
  poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  userPublicKey: '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q',
  amountX: '1000000',
  amountY: '1000000',
  minBinId: 100,
  maxBinId: 120,
};

describe('POST /api/liquidity/build-tx', () => {
  it('returns the serialized unsigned transaction on success', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, {
      buildTx: async () => ({ transaction: 'base64tx', blockhash: 'abc', lastValidBlockHeight: 123 }),
    });

    const response = await app.inject({ method: 'POST', url: '/api/liquidity/build-tx', payload: validBody });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transaction: 'base64tx', blockhash: 'abc', lastValidBlockHeight: 123 });
  });

  it('returns 400 on an invalid request body', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, { buildTx: async () => ({ transaction: '', blockhash: '', lastValidBlockHeight: 0 }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/liquidity/build-tx',
      payload: { ...validBody, poolAddress: 'not-a-pubkey' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the pool is not found on-chain', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, {
      buildTx: async () => {
        throw new PoolNotFoundError(validBody.poolAddress);
      },
    });

    const response = await app.inject({ method: 'POST', url: '/api/liquidity/build-tx', payload: validBody });

    expect(response.statusCode).toBe(404);
  });

  it('returns 503 when Solana RPC is unavailable', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, {
      buildTx: async () => {
        throw new SolanaUnavailableError();
      },
    });

    const response = await app.inject({ method: 'POST', url: '/api/liquidity/build-tx', payload: validBody });

    expect(response.statusCode).toBe(503);
  });
});
