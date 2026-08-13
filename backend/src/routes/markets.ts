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

  app.get('/api/markets/:symbol/history', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    if (!SUPPORTED_SYMBOLS.has(symbol)) {
      reply.code(404);
      return { error: 'Unsupported market symbol.' };
    }
    const history = await xauHistoryService.getFullHistory();
    return { history };
  });

  app.get('/api/markets/:symbol/signal', async (request, reply) => {
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

    const direction: SectionResult<DirectionResult> =
      directionSettled.status === 'fulfilled'
        ? { data: directionSettled.value }
        : { data: null, error: 'Direction signal is unavailable right now.' };

    let news: SectionResult<Array<Omit<NewsPost, 'sentiment'> & { sentiment: SentimentResult | null }>>;
    if (newsSettled.status === 'fulfilled') {
      const articles = newsSettled.value.slice(0, NEWS_ARTICLE_LIMIT);
      const withSentiment = await Promise.all(
        articles.map(async (article) => ({
          ...article,
          sentiment: await mlService.getSentiment(article.title).catch(() => null),
        })),
      );
      news = { data: withSentiment };
    } else {
      news = { data: null, error: 'News is unavailable right now.' };
    }

    const fundamentals: SectionResult<FredSummary> =
      fundamentalsSettled.status === 'fulfilled'
        ? { data: fundamentalsSettled.value }
        : { data: null, error: 'Fundamentals are unavailable right now.' };

    return { price, direction, news, fundamentals };
  });
}
