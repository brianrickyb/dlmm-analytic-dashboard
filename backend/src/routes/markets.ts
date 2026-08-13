import type { FastifyInstance } from 'fastify';
import { createMlService, type DirectionResult, type PriceRow, type SentimentResult } from '../services/mlService.js';
import { createXauHistoryService } from '../services/xauHistory.js';
import { createFredService, type FredSummary } from '../services/fred.js';
import { createNewsService, type NewsPost } from '../services/rss.js';

interface MlServiceLike {
  getDirection(prices: PriceRow[]): Promise<DirectionResult>;
  getSentiment(text: string): Promise<SentimentResult>;
}
interface XauHistoryServiceLike {
  getFullHistory(): Promise<PriceRow[]>;
}
interface FredServiceLike {
  getSummary(): Promise<FredSummary>;
}
interface NewsServiceLike {
  fetchNews(query: { currencies?: string; source?: string }): Promise<NewsPost[]>;
}

type SectionResult<T> = { data: T; error?: undefined } | { data: null; error: string };

const SUPPORTED_SYMBOLS = new Set(['xau']);
const NEWS_ARTICLE_LIMIT = 5;

function reasonMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function registerMarketsRoutes(
  app: FastifyInstance,
  deps: {
    mlService?: MlServiceLike;
    xauHistoryService?: XauHistoryServiceLike;
    fredService?: FredServiceLike;
    newsService?: NewsServiceLike;
  } = {},
): void {
  const mlService = deps.mlService ?? createMlService();
  const xauHistoryService = deps.xauHistoryService ?? createXauHistoryService();
  const fredService = deps.fredService ?? createFredService();
  const newsService = deps.newsService ?? createNewsService();

  // News headlines are cached ~4 minutes in rss.ts, but FinBERT sentiment
  // inference is the expensive part — cache results per article so identical
  // headlines aren't re-inferred by ml-service on every /signal poll. Scoped
  // to this registration (not a bare module-level singleton) so each
  // registerMarketsRoutes call — e.g. one per test — gets its own cache.
  const sentimentCache = new Map<string, SentimentResult>();

  // /signal fans out to 6 RSS feeds, a large POST into ml-service, and up to
  // 5 FinBERT inferences (~2.6s measured latency); /history ships ~520KB per
  // call. Bounded per-IP so a dashboard page polling on mount can't turn this
  // into an upstream-hammering loop, matching liquidity.ts/positions.ts.
  const routeOptions = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/api/markets/:symbol/history', routeOptions, async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    if (!SUPPORTED_SYMBOLS.has(symbol)) {
      reply.code(404);
      return { error: 'Unsupported market symbol.' };
    }
    const history = await xauHistoryService.getFullHistory();
    // The underlying data changes at most once a day; an hour is a simple,
    // reasonable compromise to stop every chart mount re-transferring the
    // full multi-decade daily series.
    reply.header('Cache-Control', 'public, max-age=3600');
    return { history };
  });

  app.get('/api/markets/:symbol/signal', routeOptions, async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    if (!SUPPORTED_SYMBOLS.has(symbol)) {
      reply.code(404);
      return { error: 'Unsupported market symbol.' };
    }

    const history = await xauHistoryService.getFullHistory();
    const price = history.length > 0 ? history[history.length - 1] : null;

    const [directionSettled, newsSettled, fundamentalsSettled] = await Promise.allSettled([
      mlService.getDirection(history),
      newsService.fetchNews({ currencies: 'XAU' }),
      fredService.getSummary(),
    ]);

    let direction: SectionResult<DirectionResult>;
    if (directionSettled.status === 'fulfilled') {
      direction = { data: directionSettled.value };
    } else {
      request.log.warn(
        { err: directionSettled.reason },
        `direction section degraded: ${reasonMessage(directionSettled.reason)}`,
      );
      direction = { data: null, error: 'Direction signal is unavailable right now.' };
    }

    let news: SectionResult<Array<NewsPost & { mlSentiment: SentimentResult | null }>>;
    if (newsSettled.status === 'fulfilled') {
      const articles = newsSettled.value.slice(0, NEWS_ARTICLE_LIMIT);
      const withSentiment = await Promise.all(
        articles.map(async (article) => {
          const cached = sentimentCache.get(article.id);
          if (cached) {
            return { ...article, mlSentiment: cached };
          }
          const mlSentiment = await mlService.getSentiment(article.title).catch((err: unknown) => {
            request.log.warn({ err }, `sentiment section degraded: ${reasonMessage(err)}`);
            return null;
          });
          if (mlSentiment) {
            sentimentCache.set(article.id, mlSentiment);
          }
          return { ...article, mlSentiment };
        }),
      );
      news = { data: withSentiment };
    } else {
      request.log.warn({ err: newsSettled.reason }, `news section degraded: ${reasonMessage(newsSettled.reason)}`);
      news = { data: null, error: 'News is unavailable right now.' };
    }

    let fundamentals: SectionResult<FredSummary>;
    if (fundamentalsSettled.status === 'fulfilled') {
      fundamentals = { data: fundamentalsSettled.value };
    } else {
      request.log.warn(
        { err: fundamentalsSettled.reason },
        `fundamentals section degraded: ${reasonMessage(fundamentalsSettled.reason)}`,
      );
      fundamentals = { data: null, error: 'Fundamentals are unavailable right now.' };
    }

    return { price, direction, news, fundamentals };
  });
}
