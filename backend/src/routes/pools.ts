import type { FastifyInstance } from 'fastify';
import { createMeteoraService, MeteoraUnavailableError, type PoolWithStats, type PoolSnapshot } from '../services/meteora.js';
import { createCryptoPanicService, type NewsMatch } from '../services/cryptopanic.js';

interface MeteoraServiceLike {
  getPools(): Promise<PoolWithStats[]>;
  getPoolByAddress(address: string): Promise<PoolWithStats | null>;
  getPoolHistory(address: string, days: number): Promise<PoolSnapshot[]>;
}

interface CryptoPanicServiceLike {
  getRecentNewsForToken(symbol: string, options?: { limit?: number; windowHours?: number }): Promise<NewsMatch[]>;
}

const STABLECOIN_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDP', 'FDUSD']);

export function registerPoolsRoutes(app: FastifyInstance, deps: { meteoraService?: MeteoraServiceLike; cryptoPanicService?: CryptoPanicServiceLike } = {}): void {
  const meteoraService = deps.meteoraService ?? createMeteoraService();
  const cryptoPanicService = deps.cryptoPanicService ?? createCryptoPanicService();

  app.get('/api/pools', async (_request, reply) => {
    try {
      const pools = await meteoraService.getPools();
      return { pools };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });

  app.get('/api/pools/:poolAddress', async (request, reply) => {
    const { poolAddress } = request.params as { poolAddress: string };
    try {
      const pool = await meteoraService.getPoolByAddress(poolAddress);
      if (!pool) {
        reply.code(404);
        return { error: 'Pool not found.' };
      }
      return { pool };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });

  app.get('/api/pools/:poolAddress/history', async (request, reply) => {
    const { poolAddress } = request.params as { poolAddress: string };
    const { days: daysParam } = request.query as { days?: string };
    const days = daysParam ? Number(daysParam) : 90;

    if (!Number.isInteger(days) || days <= 0 || days > 90) {
      reply.code(400);
      return { error: 'days must be an integer between 1 and 90.' };
    }

    try {
      const pool = await meteoraService.getPoolByAddress(poolAddress);
      if (!pool) {
        reply.code(404);
        return { error: 'Pool not found.' };
      }
      const snapshots = await meteoraService.getPoolHistory(poolAddress, days);
      return { snapshots };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });

  app.get('/api/pools/:poolAddress/news', async (request, reply) => {
    const { poolAddress } = request.params as { poolAddress: string };
    try {
      const pool = await meteoraService.getPoolByAddress(poolAddress);
      if (!pool) {
        reply.code(404);
        return { error: 'Pool not found.' };
      }

      const symbols = [pool.tokenX.symbol, pool.tokenY.symbol].filter(
        (symbol) => !STABLECOIN_SYMBOLS.has(symbol.toUpperCase()),
      );

      const tokens = await Promise.all(
        symbols.map(async (symbol) => ({
          symbol,
          articles: await cryptoPanicService.getRecentNewsForToken(symbol),
        })),
      );

      return { tokens };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });
}
