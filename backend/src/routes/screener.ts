import type { FastifyInstance } from 'fastify';
import { createBybitService, BybitUnavailableError, type MajorsResult } from '../services/bybit.js';
import { createCoinGeckoService, CoinGeckoUnavailableError, type TrendingCoin } from '../services/coingecko.js';
import { createGeckoTerminalService, GeckoTerminalUnavailableError, type PumpCandidate } from '../services/geckoterminal.js';
import { createCryptoPanicService, type NewsMatch } from '../services/cryptopanic.js';

interface BybitServiceLike {
  getMajors(): Promise<MajorsResult>;
}
interface CoinGeckoServiceLike {
  getTrending(): Promise<TrendingCoin[]>;
}
interface GeckoTerminalServiceLike {
  getPumpCandidates(): Promise<PumpCandidate[]>;
}
interface CryptoPanicServiceLike {
  getRecentNewsForSymbol(symbol: string): Promise<NewsMatch | null>;
}

export interface PumpWatchItem extends PumpCandidate {
  news: NewsMatch | null;
}

export function registerScreenerRoutes(
  app: FastifyInstance,
  deps: {
    bybitService?: BybitServiceLike;
    coinGeckoService?: CoinGeckoServiceLike;
    geckoTerminalService?: GeckoTerminalServiceLike;
    cryptoPanicService?: CryptoPanicServiceLike;
  } = {},
): void {
  const bybitService = deps.bybitService ?? createBybitService();
  const coinGeckoService = deps.coinGeckoService ?? createCoinGeckoService();
  const geckoTerminalService = deps.geckoTerminalService ?? createGeckoTerminalService();
  const cryptoPanicService = deps.cryptoPanicService ?? createCryptoPanicService();

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

  app.get('/api/screener/pump-watch', async (_request, reply) => {
    try {
      const candidates = await geckoTerminalService.getPumpCandidates();
      const items: PumpWatchItem[] = await Promise.all(
        candidates.map(async (candidate) => ({
          ...candidate,
          news: await cryptoPanicService.getRecentNewsForSymbol(candidate.symbol),
        })),
      );
      return { items };
    } catch (err) {
      if (err instanceof GeckoTerminalUnavailableError) {
        reply.code(503);
        return { error: 'Pump watch data is unavailable right now.' };
      }
      throw err;
    }
  });
}
