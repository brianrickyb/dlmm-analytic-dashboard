import type { PriceRow } from './mlService.js';

/**
 * Live daily OHLCV bars from Yahoo Finance's public chart endpoint.
 *
 * Why this provider: it is keyless/free, returns REAL open/high/low/close/volume
 * per trading day (unlike Alpha Vantage's value-only GOLD feed), and covers gold,
 * the dollar index, and every major FX pair under the same response shape. It
 * replaced Alpha Vantage as the primary live source for /api/markets/* — Alpha
 * Vantage remains only as a degraded close-only fallback for XAU inside
 * marketHistory.ts.
 *
 * Accuracy notes baked into this module:
 * - Daily-bar timestamps are epoch seconds in the EXCHANGE's timezone. Converting
 *   them with UTC would shift e.g. ICE FX bars (America/New_York) a day off for
 *   late sessions, so dates are formatted with the exchange timezone from meta.
 * - Bars containing holidays/half sessions arrive with null fields; they are
 *   skipped rather than coerced to fabricated numbers.
 * - Rows are sanity-checked (close > 0, high >= low, high >= body, low <= body);
 *   anything impossible is dropped instead of poisoning charts/features.
 */
export class YahooFinanceUnavailableError extends Error {}

export interface YahooFinanceService {
  getDailyHistory(yahooSymbol: string, range?: string): Promise<PriceRow[]>;
}

export interface YahooFinanceServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
// Daily bars change once per day, but the trailing bar tracks the live session;
// 10 minutes keeps the spot read fresh while staying polite to a free upstream.
const SUCCESS_CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const ALLOWED_RANGES = new Set(['1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']);
const DEFAULT_RANGE = '1y';

// Yahoo rejects requests with default/no User-Agent; send an explicit one.
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json',
} as const;

interface CacheEntry {
  expiresAt: number;
  rows: PriceRow[] | null;
}

type ChartPayload = {
  chart?: {
    result?: Array<{
      meta?: { exchangeTimezoneName?: string };
      timestamp?: unknown;
      indicators?: {
        quote?: Array<{
          open?: unknown;
          high?: unknown;
          low?: unknown;
          close?: unknown;
          volume?: unknown;
        }>;
      };
    } | null> | null;
    error?: { description?: string; code?: string } | null;
  } | null;
};

function isoDayFromEpoch(epochSeconds: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(epochSeconds * 1000));
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function parseDailyBars(payload: unknown): PriceRow[] {
  const typed = payload as ChartPayload;
  if (typed?.chart?.error) {
    throw new YahooFinanceUnavailableError(
      `Yahoo Finance error for chart request: ${typed.chart.error.description ?? typed.chart.error.code ?? 'unknown'}`,
    );
  }
  const result = typed?.chart?.result?.[0];
  if (!result) {
    throw new YahooFinanceUnavailableError('Yahoo Finance response missing chart result');
  }
  const timeZone = result.meta?.exchangeTimezoneName ?? 'UTC';
  const timestamps = Array.isArray(result.timestamp) ? (result.timestamp as unknown[]) : [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens = Array.isArray(quote.open) ? (quote.open as unknown[]) : [];
  const highs = Array.isArray(quote.high) ? (quote.high as unknown[]) : [];
  const lows = Array.isArray(quote.low) ? (quote.low as unknown[]) : [];
  const closes = Array.isArray(quote.close) ? (quote.close as unknown[]) : [];
  const volumes = Array.isArray(quote.volume) ? (quote.volume as unknown[]) : [];

  const rowsByDate = new Map<string, PriceRow>();
  const length = Math.min(timestamps.length, closes.length, highs.length, lows.length, opens.length);
  for (let i = 0; i < length; i += 1) {
    const ts = finiteNumber(timestamps[i]);
    const open = finiteNumber(opens[i]);
    const high = finiteNumber(highs[i]);
    const low = finiteNumber(lows[i]);
    const close = finiteNumber(closes[i]);
    if (ts === null || open === null || high === null || low === null || close === null) continue;
    // Sanity checks -- drop structurally impossible bars instead of charting them.
    if (close <= 0 || open <= 0 || high <= 0 || low <= 0) continue;
    if (high < low) continue;
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    if (high + 1e-9 < bodyHigh || low - 1e-9 > bodyLow) continue;
    const volume = finiteNumber(volumes[i]) ?? 0;
    // Last occurrence wins if Yahoo ever repeats a date; sorted below anyway.
    rowsByDate.set(isoDayFromEpoch(ts, timeZone), { date: isoDayFromEpoch(ts, timeZone), open, high, low, close, volume });
  }

  const rows = [...rowsByDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (rows.length === 0) {
    throw new YahooFinanceUnavailableError('Yahoo Finance returned no valid daily bars');
  }
  return rows;
}

export function createYahooFinanceService(deps: YahooFinanceServiceDeps = {}): YahooFinanceService {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const baseUrl = deps.baseUrl ?? DEFAULT_BASE_URL;
  const cache = new Map<string, CacheEntry>();

  async function getDailyHistory(yahooSymbol: string, range: string = DEFAULT_RANGE): Promise<PriceRow[]> {
    const effectiveRange = ALLOWED_RANGES.has(range) ? range : DEFAULT_RANGE;
    const cacheKey = `${yahooSymbol}|${effectiveRange}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      if (cached.rows === null) {
        throw new YahooFinanceUnavailableError('Yahoo Finance recently failed and is cached as unavailable');
      }
      return cached.rows;
    }

    try {
      const url = `${baseUrl}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=${effectiveRange}&includePrePost=false`;
      let response: Response;
      try {
        response = await fetchImpl(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (err) {
        throw new YahooFinanceUnavailableError(`Failed to reach Yahoo Finance for ${yahooSymbol}`, { cause: err });
      }
      if (!response.ok) {
        throw new YahooFinanceUnavailableError(`Yahoo Finance returned status ${response.status} for ${yahooSymbol}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (err) {
        throw new YahooFinanceUnavailableError('Yahoo Finance response was not valid JSON', { cause: err });
      }

      const rows = parseDailyBars(payload);
      cache.set(cacheKey, { expiresAt: now() + SUCCESS_CACHE_TTL_MS, rows });
      return rows;
    } catch (err) {
      cache.set(cacheKey, { expiresAt: now() + FAILURE_CACHE_TTL_MS, rows: null });
      throw err;
    }
  }

  return { getDailyHistory };
}
