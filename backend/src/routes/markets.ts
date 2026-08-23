import type { FastifyInstance } from 'fastify';
import { createMlService, type DirectionResult, type PriceRow, type SentimentResult } from '../services/mlService.js';
import { createXauHistoryService, type XauFullHistory } from '../services/xauHistory.js';
import { createFredService, type FredSummary } from '../services/fred.js';
import { createNewsService, type NewsPost } from '../services/rss.js';

interface MlServiceLike {
  getDirection(prices: PriceRow[]): Promise<DirectionResult>;
  getSentiment(text: string): Promise<SentimentResult>;
}
interface XauHistoryServiceLike {
  getFullHistory(): Promise<XauFullHistory>;
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

// ml-service's four features are rolling windows whose longest lookback is
// MA_LONG_PERIOD = 50 rows (ml-service training/features.py), and gap-segmentation
// can split the series into shorter segments. 260 rows (~one trading year) keeps
// several multiples of that warmup intact while cutting the direction POST payload
// from the full multi-decade series (~520KB) to ~25KB.
//
// Why truncation is safe despite RSI being recursively seeded (the concern
// documented on ml-service DirectionRequest): Wilder smoothing has weight
// (1 - 1/14)^k on data k rows back, so after 260 rows the seeding carries
// ~4e-9 relative influence — numerically identical to full-segment computation.
// The 50-row minimum is where that weight is still ~2.5%, which is exactly what
// the ml-service schema warns against.
const DIRECTION_INPUT_ROWS = 260;

// Gold trades roughly Mon-Fri with occasional holiday gaps, so up to ~4 quiet days
// is normal. Beyond a week the "spot price" shown in the UI is not current by any
// reasonable reading and must be labeled stale (e.g. Alpha Vantage down/premium-
// blocked means the merged history ends at the static CSV forever).
const PRICE_STALE_AFTER_DAYS = 7;

function utcDayStartMs(dateIso: string): number {
  return Date.parse(`${dateIso}T00:00:00Z`);
}

function isPriceStale(priceDate: string, at: Date): boolean {
  const todayUtcMidnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  return (todayUtcMidnight - utcDayStartMs(priceDate)) / 86_400_000 > PRICE_STALE_AFTER_DAYS;
}

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
    now?: () => number;
  } = {},
): void {
  const mlService = deps.mlService ?? createMlService();
  const xauHistoryService = deps.xauHistoryService ?? createXauHistoryService();
  const fredService = deps.fredService ?? createFredService();
  const newsService = deps.newsService ?? createNewsService();
  const now = deps.now ?? Date.now;

  // News headlines are cached ~4 minutes in rss.ts, but FinBERT sentiment
  // inference is the expensive part — cache results per article so identical
  // headlines aren't re-inferred by ml-service on every /signal poll. The cache
  // is TTL-bounded AND size-capped: RSS rotates articles out, but without a cap
  // old article ids would accumulate forever in this long-lived server process.
  // Scoped to this registration (not a bare module-level singleton) so each
  // registerMarketsRoutes call — e.g. one per test — gets its own cache.
  const SENTIMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const SENTIMENT_CACHE_MAX_ENTRIES = 512;
  const sentimentCache = new Map<string, { result: SentimentResult; expiresAt: number }>();

  function getCachedSentiment(articleId: string): SentimentResult | null {
    const entry = sentimentCache.get(articleId);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      sentimentCache.delete(articleId);
      return null;
    }
    return entry.result;
  }

  function setCachedSentiment(articleId: string, result: SentimentResult): void {
    // Delete-then-set refreshes insertion order so Map iteration order stays
    // least-recently-set first, which is what eviction below walks.
    sentimentCache.delete(articleId);
    if (sentimentCache.size >= SENTIMENT_CACHE_MAX_ENTRIES) {
      for (const [key, entry] of sentimentCache) {
        if (entry.expiresAt <= now()) sentimentCache.delete(key);
      }
    }
    while (sentimentCache.size >= SENTIMENT_CACHE_MAX_ENTRIES) {
      const oldest = sentimentCache.keys().next();
      if (oldest.done) break;
      sentimentCache.delete(oldest.value);
    }
    sentimentCache.set(articleId, { result, expiresAt: now() + SENTIMENT_CACHE_TTL_MS });
  }

  // /signal fans out to 6 RSS feeds, a large POST into ml-service, and up to
  // 5 FinBERT inferences (~2.6s measured latency); /history ships the full
  // multi-decade daily series per call. Bounded per-IP so a dashboard page polling
  // on mount can't turn this into an upstream-hammering loop, matching
  // liquidity.ts/positions.ts.
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
    // estimatedFrom lets clients tell apart genuine OHLCV rows from the close-only
    // synthesized tail (see XauFullHistory for why that distinction matters).
    return { history: history.rows, estimatedFrom: history.estimatedFrom };
  });

  app.get('/api/markets/:symbol/signal', routeOptions, async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    if (!SUPPORTED_SYMBOLS.has(symbol)) {
      reply.code(404);
      return { error: 'Unsupported market symbol.' };
    }

    const history = await xauHistoryService.getFullHistory();
    const price = history.rows.length > 0 ? history.rows[history.rows.length - 1] : null;

    // Only send the model the window it can actually use — see DIRECTION_INPUT_ROWS.
    const directionInput = history.rows.slice(-DIRECTION_INPUT_ROWS);

    const [directionSettled, newsSettled, fundamentalsSettled] = await Promise.allSettled([
      mlService.getDirection(directionInput),
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
          const cached = getCachedSentiment(article.id);
          if (cached) {
            return { ...article, mlSentiment: cached };
          }
          const mlSentiment = await mlService.getSentiment(article.title).catch((err: unknown) => {
            request.log.warn({ err }, `sentiment section degraded: ${reasonMessage(err)}`);
            return null;
          });
          if (mlSentiment) {
            setCachedSentiment(article.id, mlSentiment);
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

    return {
      price,
      freshness: {
        asOf: price?.date ?? null,
        stale: price ? isPriceStale(price.date, new Date(now())) : false,
      },
      direction,
      news,
      fundamentals,
    };
  });
}
