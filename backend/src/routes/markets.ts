import type { FastifyInstance } from 'fastify';
import { createMlService, type DirectionResult, type PriceRow, type SentimentResult } from '../services/mlService.js';
import { createMarketHistoryService, XAU_YAHOO_SYMBOL, type MarketFullHistory } from '../services/marketHistory.js';
import { createFredService, type FredSummary } from '../services/fred.js';
import { createNewsService, type NewsPost } from '../services/rss.js';
import { computeTechnicals, type TechnicalReadout } from '../lib/technicals.js';
import { computeTechnicalSignal, type TechnicalSignalResult } from '../lib/technicalSignal.js';

interface MlServiceLike {
  getDirection(prices: PriceRow[]): Promise<DirectionResult>;
  getSentiment(text: string): Promise<SentimentResult>;
}
interface MarketHistoryServiceLike {
  getXauMergedHistory(yahooSymbol?: string): Promise<MarketFullHistory>;
  getLiveFullHistory(yahooSymbol: string): Promise<MarketFullHistory>;
}
interface FredServiceLike {
  getSummary(): Promise<FredSummary>;
}
interface NewsServiceLike {
  fetchNews(query: { currencies?: string; source?: string }): Promise<NewsPost[]>;
}

export interface MarketConfig {
  /** URL slug, e.g. "eurusd" -> /api/markets/eurusd/signal */
  key: string;
  /** Display pair, e.g. "EUR/USD". */
  pair: string;
  label: string;
  /** Underlying symbol on Yahoo Finance's chart endpoint. */
  yahooSymbol: string;
  /** TradingView symbol for the embedded chart widget. */
  tvSymbol: string;
  /** Currency codes used by the RSS keyword filter (see services/rss.ts aliases). */
  newsCurrencies: string[];
  /**
   * Only XAU gets the ml-service direction call: the classifier is trained on
   * 22 years of gold closes and would be dishonest to run on any other series.
   * Other markets still get the deterministic technical readout.
   */
  directionModel: boolean;
}

export const MARKET_CONFIGS: Record<string, MarketConfig> = {
  xau: {
    key: 'xau', pair: 'XAU/USD', label: 'Gold', yahooSymbol: XAU_YAHOO_SYMBOL,
    tvSymbol: 'OANDA:XAUUSD', newsCurrencies: ['XAU'], directionModel: true,
  },
  dxy: {
    key: 'dxy', pair: 'DXY', label: 'Dollar Index', yahooSymbol: 'DX-Y.NYB',
    tvSymbol: 'TVC:DXY', newsCurrencies: ['DXY'], directionModel: false,
  },
  eurusd: {
    key: 'eurusd', pair: 'EUR/USD', label: 'Euro', yahooSymbol: 'EURUSD=X',
    tvSymbol: 'OANDA:EURUSD', newsCurrencies: ['EUR'], directionModel: false,
  },
  gbpusd: {
    key: 'gbpusd', pair: 'GBP/USD', label: 'Pound', yahooSymbol: 'GBPUSD=X',
    tvSymbol: 'OANDA:GBPUSD', newsCurrencies: ['GBP'], directionModel: false,
  },
  usdjpy: {
    key: 'usdjpy', pair: 'USD/JPY', label: 'Yen', yahooSymbol: 'USDJPY=X',
    tvSymbol: 'OANDA:USDJPY', newsCurrencies: ['JPY'], directionModel: false,
  },
  usdchf: {
    key: 'usdchf', pair: 'USD/CHF', label: 'Swiss Franc', yahooSymbol: 'USDCHF=X',
    tvSymbol: 'OANDA:USDCHF', newsCurrencies: ['CHF'], directionModel: false,
  },
  usdcad: {
    key: 'usdcad', pair: 'USD/CAD', label: 'Canadian Dollar', yahooSymbol: 'USDCAD=X',
    tvSymbol: 'OANDA:USDCAD', newsCurrencies: ['CAD'], directionModel: false,
  },
  audusd: {
    key: 'audusd', pair: 'AUD/USD', label: 'Australian Dollar', yahooSymbol: 'AUDUSD=X',
    tvSymbol: 'OANDA:AUDUSD', newsCurrencies: ['AUD'], directionModel: false,
  },
  nzdusd: {
    key: 'nzdusd', pair: 'NZD/USD', label: 'New Zealand Dollar', yahooSymbol: 'NZDUSD=X',
    tvSymbol: 'OANDA:NZDUSD', newsCurrencies: ['NZD'], directionModel: false,
  },
};

type SectionResult<T> = { data: T; error?: undefined } | { data: null; error: string };

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

// Gold/FX trade roughly Mon-Fri with occasional holiday gaps, so up to ~4 quiet
// days is normal. Beyond a week the "spot price" shown in the UI is not current
// by any reasonable reading and must be labeled stale (e.g. every live provider
// down means the merged history ends at the static CSV).
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

async function fetchFullHistory(
  historyService: MarketHistoryServiceLike,
  config: MarketConfig,
): Promise<MarketFullHistory> {
  // Only XAU merges against the static multi-decade CSV; everything else is a
  // straight Yahoo Finance pull.
  if (config.key === 'xau') {
    return historyService.getXauMergedHistory(config.yahooSymbol);
  }
  return historyService.getLiveFullHistory(config.yahooSymbol);
}

export function registerMarketsRoutes(
  app: FastifyInstance,
  deps: {
    mlService?: MlServiceLike;
    marketHistoryService?: MarketHistoryServiceLike;
    fredService?: FredServiceLike;
    newsService?: NewsServiceLike;
    now?: () => number;
  } = {},
): void {
  const mlService = deps.mlService ?? createMlService();
  const marketHistoryService = deps.marketHistoryService ?? createMarketHistoryService();
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

  // /signal fans out to 6 RSS feeds, a large POST into ml-service (XAU), and up
  // to 5 FinBERT inferences (~2.6s measured latency); /history ships a full
  // daily series per call. Bounded per-IP so a dashboard page polling on mount
  // can't turn this into an upstream-hammering loop, matching
  // liquidity.ts/positions.ts.
  const routeOptions = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/api/markets/:symbol/history', routeOptions, async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const config = MARKET_CONFIGS[symbol];
    if (!config) {
      reply.code(404);
      return { error: 'Unsupported market symbol.' };
    }

    let history: MarketFullHistory;
    try {
      history = await fetchFullHistory(marketHistoryService, config);
    } catch (err) {
      request.log.warn({ err }, `history section degraded: ${reasonMessage(err)}`);
      reply.code(503);
      return { error: 'Price history is unavailable right now.' };
    }

    // Live provider data refreshes intraday on the trailing bar, so an hour of
    // edge caching would show visibly old spot prices; 10 minutes matches the
    // upstream service's own success-cache TTL without hammering it.
    reply.header('Cache-Control', 'public, max-age=600');
    // estimatedFrom lets clients tell apart genuine OHLCV rows from close-only
    // estimates (only possible on the XAU Alpha-Vantage-fallback path -- see
    // MarketFullHistory for why that distinction matters).
    return {
      market: { key: config.key, pair: config.pair, label: config.label },
      history: history.rows,
      estimatedFrom: history.estimatedFrom,
    };
  });

  app.get('/api/markets/:symbol/signal', routeOptions, async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const config = MARKET_CONFIGS[symbol];
    if (!config) {
      reply.code(404);
      return { error: 'Unsupported market symbol.' };
    }

    let history: MarketFullHistory;
    try {
      history = await fetchFullHistory(marketHistoryService, config);
    } catch (err) {
      request.log.warn({ err }, `history section degraded: ${reasonMessage(err)}`);
      reply.code(503);
      return { error: 'Price history is unavailable right now.' };
    }

    const price = history.rows.length > 0 ? history.rows[history.rows.length - 1] : null;

    // Deterministic technicals are computed locally from the merged closes --
    // no extra upstream dependency, available for every market.
    let technical: SectionResult<TechnicalReadout>;
    try {
      technical = { data: computeTechnicals(history.rows) };
    } catch (err) {
      request.log.warn({ err }, `technical section degraded: ${reasonMessage(err)}`);
      technical = { data: null, error: 'Technical readout is unavailable right now.' };
    }

    // Deterministic directional signal from technical indicators — works for
    // every market, unlike the ML model which is trained on gold only.
    let technicalSignal: SectionResult<TechnicalSignalResult>;
    if (technical.data && price) {
      const signal = computeTechnicalSignal(technical.data, price.close);
      if (signal) {
        technicalSignal = { data: signal };
      } else {
        technicalSignal = { data: null, error: 'Not enough price history for a directional signal.' };
      }
    } else {
      technicalSignal = { data: null, error: technical.error ?? 'Technical signal unavailable.' };
    }

    // Only send the model the window it can actually use — see DIRECTION_INPUT_ROWS.
    const directionInput = history.rows.slice(-DIRECTION_INPUT_ROWS);

    const [directionSettled, newsSettled, fundamentalsSettled] = await Promise.allSettled([
      config.directionModel
        ? mlService.getDirection(directionInput)
        : Promise.reject(new Error('not requested for this market')),
      newsService.fetchNews({ currencies: config.newsCurrencies.join(',') }),
      fredService.getSummary(),
    ]);

    let direction: SectionResult<DirectionResult>;
    if (!config.directionModel) {
      // Honest degradation: the model is trained on gold closes only.
      direction = { data: null, error: 'The ML direction model is calibrated for XAU/USD only.' };
    } else if (directionSettled.status === 'fulfilled') {
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
      market: { key: config.key, pair: config.pair, label: config.label },
      price,
      freshness: {
        asOf: price?.date ?? null,
        stale: price ? isPriceStale(price.date, new Date(now())) : false,
      },
      technical,
      technicalSignal,
      direction,
      news,
      fundamentals,
    };
  });
}
