import type { FastifyInstance } from 'fastify';
import { createMeteoraService, MeteoraUnavailableError, type PoolWithStats, type PoolSnapshot } from '../services/meteora.js';

interface MeteoraServiceLike {
  getPools(): Promise<PoolWithStats[]>;
  getPoolByAddress(address: string): Promise<PoolWithStats | null>;
  getPoolHistory(address: string, days: number): Promise<PoolSnapshot[]>;
}

export function registerPoolsRoutes(app: FastifyInstance, deps: { meteoraService?: MeteoraServiceLike } = {}): void {
  const meteoraService = deps.meteoraService ?? createMeteoraService();

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
}
