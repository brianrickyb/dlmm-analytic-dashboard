export class AlphaVantageUnavailableError extends Error {}

export interface GoldSnapshot {
  date: string;
  value: number;
}

export interface AlphaVantageServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  apiKey?: string;
}

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
// UNVERIFIED: whether Alpha Vantage's free tier actually includes gold/commodity data, and
// whether `GOLD` is the correct function name and this the correct response shape, has not
// been confirmed with a real API key -- only Alpha Vantage's `demo` key was tried during
// research, which returns the same generic "claim your key" message regardless of function
// validity or plan tier. Two rounds of research produced conflicting signals (a third-party
// source claiming free access, Alpha Vantage's own documentation page stating the GOLD
// function is premium-only). See docs/superpowers/specs/2026-08-13-xau-market-signal-design.md
// "Live/recent price data" section. If this needs a paid plan, or the shape below is wrong,
// this is the one file to swap for a different provider -- every failure path here throws
// AlphaVantageUnavailableError, so a wrong guess fails safe (the route degrades this section)
// rather than crashing.
const GOLD_FUNCTION = 'GOLD';

const DAILY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // free tier is 25 req/day -- cache hard
// Terminal failures (e.g. a premium-only rejection) are cached too, but for much less time than
// a success -- otherwise a real key hitting a wall on every call could burn the 25-req/day quota
// rapidly, since nothing was ever being cached on the failure path.
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

type CacheEntry = { expiresAt: number; data: GoldSnapshot[]; failed?: false } | { expiresAt: number; data: null; failed: true };

export function createAlphaVantageService(deps: AlphaVantageServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const apiKey = deps.apiKey ?? process.env.ALPHA_VANTAGE_API_KEY;

  let cache: CacheEntry | null = null;

  async function getDailyHistory(): Promise<GoldSnapshot[]> {
    if (!apiKey) {
      throw new AlphaVantageUnavailableError('ALPHA_VANTAGE_API_KEY is not configured');
    }
    if (cache && cache.expiresAt > now()) {
      if (cache.failed) {
        throw new AlphaVantageUnavailableError('Alpha Vantage recently failed and is cached as unavailable');
      }
      return cache.data;
    }

    try {
      const params = new URLSearchParams({ function: GOLD_FUNCTION, interval: 'daily', apikey: apiKey });
      let response: Response;
      try {
        response = await fetchImpl(`${ALPHA_VANTAGE_BASE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
      } catch (err) {
        throw new AlphaVantageUnavailableError('Failed to reach Alpha Vantage', { cause: err });
      }
      if (!response.ok) {
        throw new AlphaVantageUnavailableError(`Alpha Vantage returned status ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (err) {
        throw new AlphaVantageUnavailableError('Alpha Vantage response was not valid JSON', { cause: err });
      }

      const data = (payload as { data?: unknown })?.data;
      if (!Array.isArray(data)) {
        throw new AlphaVantageUnavailableError('Alpha Vantage response missing expected data field');
      }

      const snapshots: GoldSnapshot[] = [];
      for (const raw of data) {
        if (raw === null || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const date = item.date;
        const value = Number(item.value);
        if (typeof date !== 'string' || Number.isNaN(value)) continue;
        snapshots.push({ date, value });
      }

      cache = { expiresAt: now() + DAILY_CACHE_TTL_MS, data: snapshots };
      return snapshots;
    } catch (err) {
      cache = { expiresAt: now() + FAILURE_CACHE_TTL_MS, data: null, failed: true };
      throw err;
    }
  }

  return { getDailyHistory };
}
