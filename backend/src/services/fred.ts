export class FredUnavailableError extends Error {}

export interface FredObservation {
  date: string;
  value: number;
}

export interface FredSummary {
  fedFundsRate: FredObservation | null;
  realYield10y: FredObservation | null;
  cpi: FredObservation | null;
  dollarIndex: FredObservation | null;
}

export interface FredServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  apiKey?: string;
}

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const SERIES = {
  fedFundsRate: 'DFF',
  realYield10y: 'DFII10',
  cpi: 'CPIAUCSL',
  dollarIndex: 'DTWEXBGS',
} as const;

const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h -- matches the series' own daily/monthly cadence
// If every series rejected (e.g. a transient FRED outage), don't cache that all-null result for
// the full success TTL -- a 30s blip would otherwise blank the fundamentals panel for 6h with no
// retry. Cache it for much less time so the next request tries again soon.
const ALL_NULL_CACHE_TTL_MS = 5 * 60 * 1000; // 5min

async function fetchLatestObservation(
  fetchImpl: typeof fetch,
  apiKey: string,
  seriesId: string,
): Promise<FredObservation | null> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '1',
  });
  let response: Response;
  try {
    response = await fetchImpl(`${FRED_BASE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new FredUnavailableError(`Failed to reach FRED for series ${seriesId}`, { cause: err });
  }
  if (!response.ok) {
    throw new FredUnavailableError(`FRED returned status ${response.status} for series ${seriesId}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new FredUnavailableError(`FRED response was not valid JSON for series ${seriesId}`, { cause: err });
  }

  const observations = (payload as { observations?: unknown })?.observations;
  if (!Array.isArray(observations) || observations.length === 0) return null;

  const latest = observations[0] as Record<string, unknown>;
  const date = latest.date;
  // FRED uses "." as its not-yet-released marker -- Number('.') is NaN, which the check below
  // already treats as "no value", so this needs no special case beyond the NaN check.
  const value = Number(latest.value);
  if (typeof date !== 'string' || Number.isNaN(value)) return null;
  return { date, value };
}

export function createFredService(deps: FredServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const apiKey = deps.apiKey ?? process.env.FRED_API_KEY;

  let cache: { expiresAt: number; data: FredSummary } | null = null;

  async function getSummary(): Promise<FredSummary> {
    if (!apiKey) {
      throw new FredUnavailableError('FRED_API_KEY is not configured');
    }
    if (cache && cache.expiresAt > now()) {
      return cache.data;
    }

    const results = await Promise.allSettled([
      fetchLatestObservation(fetchImpl, apiKey, SERIES.fedFundsRate),
      fetchLatestObservation(fetchImpl, apiKey, SERIES.realYield10y),
      fetchLatestObservation(fetchImpl, apiKey, SERIES.cpi),
      fetchLatestObservation(fetchImpl, apiKey, SERIES.dollarIndex),
    ]);

    const fedFundsRate = results[0].status === 'fulfilled' ? results[0].value : null;
    const realYield10y = results[1].status === 'fulfilled' ? results[1].value : null;
    const cpi = results[2].status === 'fulfilled' ? results[2].value : null;
    const dollarIndex = results[3].status === 'fulfilled' ? results[3].value : null;

    const summary: FredSummary = { fedFundsRate, realYield10y, cpi, dollarIndex };
    const allNull = fedFundsRate === null && realYield10y === null && cpi === null && dollarIndex === null;
    cache = { expiresAt: now() + (allNull ? ALL_NULL_CACHE_TTL_MS : cacheTtlMs), data: summary };
    return summary;
  }

  return { getSummary };
}
