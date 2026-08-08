import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerLiquidityRoutes, toSdkSlippagePercent } from './liquidity.js';
import { SolanaUnavailableError, PoolNotFoundError } from '../lib/dlmmError.js';

describe('toSdkSlippagePercent', () => {
  it('converts the API contract\'s "slippageBps=100 means 1%" into the percent the SDK expects', () => {
    // Regression test: the SDK's `slippage` param is a percentage, not basis
    // points. Passing 100 through unconverted (the bug this guards against)
    // would tell the SDK "100%", disabling the active-bin drift guard.
    expect(toSdkSlippagePercent(100)).toBe(1);
  });

  it('converts the minimum (1 bps) and maximum (2000 bps) allowed values', () => {
    expect(toSdkSlippagePercent(1)).toBe(0.01);
    expect(toSdkSlippagePercent(2000)).toBe(20);
  });
});

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
