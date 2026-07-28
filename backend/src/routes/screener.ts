import type { FastifyInstance } from 'fastify';
import { createBybitService, BybitUnavailableError, type MajorsResult } from '../services/bybit.js';
import { createCoinGeckoService, CoinGeckoUnavailableError, type TrendingCoin } from '../services/coingecko.js';

interface BybitServiceLike {
  getMajors(): Promise<MajorsResult>;
}
interface CoinGeckoServiceLike {
  getTrending(): Promise<TrendingCoin[]>;
}

export function registerScreenerRoutes(
  app: FastifyInstance,
  deps: { bybitService?: BybitServiceLike; coinGeckoService?: CoinGeckoServiceLike } = {},
): void {
  const bybitService = deps.bybitService ?? createBybitService();
  const coinGeckoService = deps.coinGeckoService ?? createCoinGeckoService();

  app.get('/api/screener/majors', async (_request, reply) => {
    try {
      return await bybitService.getMajors();
    } catch (err) {
      if (err instanceof BybitUnavailableError) {
        reply.code(503);
        return { error: 'Market positioning data is unavailable right now.' };
      }
      throw err;
    }
  });

  app.get('/api/screener/trending', async (_request, reply) => {
    try {
      const coins = await coinGeckoService.getTrending();
      return { coins };
    } catch (err) {
      if (err instanceof CoinGeckoUnavailableError) {
        reply.code(503);
        return { error: 'Trending data is unavailable right now.' };
      }
      throw err;
    }
  });
}
