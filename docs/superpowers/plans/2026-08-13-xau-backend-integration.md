# XAU Market Signal — Backend Integration (Phase 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Fastify backend with the services and routes that aggregate ml-service's
predictions, Alpha Vantage's gold prices, FRED's macro fundamentals, and gold/forex news into
`GET /api/markets/xau/signal` and `GET /api/markets/xau/history`.

**Architecture:** Four independent, DI-testable services (`mlService`, `alphaVantage`, `fred`,
plus `rss.ts` extended) feed one aggregation service (`xauHistory`, merging the committed static
dataset with live Alpha Vantage data) and one route file (`markets.ts`) that combines everything
with per-section graceful degradation — matching every existing service/route in this backend
exactly.

**Tech Stack:** Fastify 5, TypeScript, Vitest — no new dependencies.

## Global Constraints

- Every new service follows the established pattern exactly: `create<X>Service(deps: {
  fetchImpl?, now?, cacheTtlMs?, apiKey? })` factory, `<X>UnavailableError extends Error`, DI for
  testability. Every new route follows `register<X>Routes(app, deps = {})`.
- No test may hit a real external API (Alpha Vantage, FRED, ml-service) or read the real static
  CSV file from disk — everything is injectable.
- `ml-service`'s `/predict/direction` endpoint needs the **entire current price segment**, not
  just 50 rows (RSI is a recursive computation seeded at the start of its input window — see
  `docs/superpowers/specs/2026-08-13-xau-market-signal-design.md`). The backend always sends
  the full available history array; ml-service's own gap-aware feature computation handles
  segmentation correctly on its side — the backend does not need to replicate that logic.
- **Alpha Vantage's free-tier gold access and exact response shape are UNVERIFIED** — two rounds
  of research produced conflicting signals (see the spec's "Live/recent price data" section).
  `services/alphaVantage.ts` is built against the best-available guess (function `GOLD`, a
  `{data: [{date, value}]}` response shape matching Alpha Vantage's other documented commodity
  indicators), defensively coded so any shape mismatch throws `AlphaVantageUnavailableError`
  cleanly (never crashes) rather than silently producing wrong data. This must be verified with
  a real API key before this integration is considered final — flagged prominently in the
  service's own file comment and in `backend/.env.example`.
- Alpha Vantage's free tier is 25 requests/day — cache aggressively (24-hour TTL, one fetch per
  day, not per-request).
- `GET /api/markets/:symbol/signal` returns `200` with a per-section `{data: null, error:
  string}` shape for whichever section failed, never a blanket `503` for one degraded piece —
  matching the design spec's stated resilience model.
- `symbol` other than `xau` returns `404` on both routes — the param exists for future
  multi-instrument support, not because a second instrument is implemented now.

---

### Task 1: `services/mlService.ts`

**Files:**
- Create: `backend/src/services/mlService.ts`
- Test: `backend/src/services/mlService.test.ts`

**Interfaces:**
- Consumes: nothing beyond `fetch`.
- Produces: `createMlService(deps): { getDirection(prices: PriceRow[]): Promise<DirectionResult>; getSentiment(text: string): Promise<SentimentResult> }`,
  `MlServiceUnavailableError`, and the `PriceRow`/`DirectionResult`/`SentimentResult` types.
  Task 5 (`xauHistory.ts`) produces `PriceRow[]`; Task 6 (`markets.ts`) calls both methods.

- [ ] **Step 1: Write the failing tests**

`backend/src/services/mlService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMlService, MlServiceUnavailableError } from './mlService.js';

const SAMPLE_PRICES = [
  { date: '2026-01-01', open: 4000, high: 4010, low: 3990, close: 4005, volume: 1000 },
  { date: '2026-01-02', open: 4005, high: 4020, low: 4000, close: 4015, volume: 1100 },
];

describe('createMlService — getDirection', () => {
  it('returns a parsed direction result on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ direction: 'bullish', confidence: 0.73 }),
    } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    const result = await service.getDirection(SAMPLE_PRICES);

    expect(result).toEqual({ direction: 'bullish', confidence: 0.73 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ml-service.test/predict/direction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prices: SAMPLE_PRICES }),
      }),
    );
  });

  it('throws MlServiceUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getDirection(SAMPLE_PRICES)).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });

  it('throws MlServiceUnavailableError on a non-ok response (e.g. 422)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({}) } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getDirection(SAMPLE_PRICES)).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });

  it('throws MlServiceUnavailableError when the response is missing expected fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ direction: 'sideways', confidence: 0.5 }),
    } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getDirection(SAMPLE_PRICES)).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });
});

describe('createMlService — getSentiment', () => {
  it('returns a parsed sentiment result on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sentiment: 'positive', score: 0.91 }),
    } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    const result = await service.getSentiment('Gold surges to record highs');

    expect(result).toEqual({ sentiment: 'positive', score: 0.91 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ml-service.test/predict/sentiment',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Gold surges to record highs' }) }),
    );
  });

  it('throws MlServiceUnavailableError when the sentiment response is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getSentiment('test')).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/mlService.test.ts`
Expected: FAIL — `Cannot find module './mlService.js'`.

- [ ] **Step 3: Write the implementation**

`backend/src/services/mlService.ts`:

```ts
export class MlServiceUnavailableError extends Error {}

export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DirectionResult {
  direction: 'bullish' | 'bearish';
  confidence: number;
}

export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
}

export interface MlServiceDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

async function postJson(fetchImpl: typeof fetch, url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new MlServiceUnavailableError(`Failed to reach ml-service at ${url}`, { cause: err });
  }
  if (!response.ok) {
    throw new MlServiceUnavailableError(`ml-service at ${url} returned status ${response.status}`);
  }
  try {
    return await response.json();
  } catch (err) {
    throw new MlServiceUnavailableError(`ml-service response from ${url} was not valid JSON`, { cause: err });
  }
}

export function createMlService(deps: MlServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

  async function getDirection(prices: PriceRow[]): Promise<DirectionResult> {
    const payload = await postJson(fetchImpl, `${baseUrl}/predict/direction`, { prices }, 15000);
    const p = payload as Record<string, unknown>;
    if ((p.direction !== 'bullish' && p.direction !== 'bearish') || typeof p.confidence !== 'number') {
      throw new MlServiceUnavailableError('ml-service direction response missing expected fields');
    }
    return { direction: p.direction, confidence: p.confidence };
  }

  async function getSentiment(text: string): Promise<SentimentResult> {
    const payload = await postJson(fetchImpl, `${baseUrl}/predict/sentiment`, { text }, 8000);
    const p = payload as Record<string, unknown>;
    if (
      (p.sentiment !== 'positive' && p.sentiment !== 'negative' && p.sentiment !== 'neutral') ||
      typeof p.score !== 'number'
    ) {
      throw new MlServiceUnavailableError('ml-service sentiment response missing expected fields');
    }
    return { sentiment: p.sentiment, score: p.score };
  }

  return { getDirection, getSentiment };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/mlService.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mlService.ts backend/src/services/mlService.test.ts
git commit -m "feat(backend): add mlService client for the ml-service direction/sentiment endpoints"
```

---

### Task 2: `services/alphaVantage.ts`

**Files:**
- Create: `backend/src/services/alphaVantage.ts`
- Test: `backend/src/services/alphaVantage.test.ts`

**Interfaces:**
- Consumes: nothing beyond `fetch`.
- Produces: `createAlphaVantageService(deps): { getDailyHistory(): Promise<GoldSnapshot[]> }`,
  `AlphaVantageUnavailableError`, and the `GoldSnapshot` type (`{date, value}` — a single daily
  price, not full OHLC, matching Alpha Vantage's documented commodity-indicator shape). Task 5
  (`xauHistory.ts`) consumes `getDailyHistory()`.

- [ ] **Step 1: Write the failing tests**

`backend/src/services/alphaVantage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAlphaVantageService, AlphaVantageUnavailableError } from './alphaVantage.js';

function fakeGoldResponse(rows: { date: string; value: string }[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ name: 'Gold', interval: 'daily', unit: 'dollars', data: rows }),
  } as Response);
}

describe('createAlphaVantageService — no API key', () => {
  it('throws AlphaVantageUnavailableError without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createAlphaVantageService({ fetchImpl, apiKey: undefined });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createAlphaVantageService — success', () => {
  it('parses the daily history into GoldSnapshot rows', async () => {
    const fetchImpl = fakeGoldResponse([
      { date: '2026-02-01', value: '4900.50' },
      { date: '2026-02-02', value: '4915.25' },
    ]);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getDailyHistory();

    expect(result).toEqual([
      { date: '2026-02-01', value: 4900.5 },
      { date: '2026-02-02', value: 4915.25 },
    ]);
  });

  it('skips rows with a non-numeric value rather than failing the whole batch', async () => {
    const fetchImpl = fakeGoldResponse([
      { date: '2026-02-01', value: '4900.50' },
      { date: '2026-02-02', value: 'N/A' },
    ]);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getDailyHistory();

    expect(result).toEqual([{ date: '2026-02-01', value: 4900.5 }]);
  });
});

describe('createAlphaVantageService — failure handling', () => {
  it('throws AlphaVantageUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
  });

  it('throws AlphaVantageUnavailableError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
  });

  it('throws AlphaVantageUnavailableError when the response is missing the data field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Gold' }),
    } as Response);
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getDailyHistory()).rejects.toBeInstanceOf(AlphaVantageUnavailableError);
  });
});

describe('createAlphaVantageService — caching', () => {
  it('reuses the cached history within the 24h TTL', async () => {
    const fetchImpl = fakeGoldResponse([{ date: '2026-02-01', value: '4900.50' }]);
    let currentTime = 1_000_000;
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key', now: () => currentTime });

    await service.getDailyHistory();
    currentTime += 60 * 60 * 1000; // +1h, well within the 24h TTL
    await service.getDailyHistory();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the 24h TTL has expired', async () => {
    const fetchImpl = fakeGoldResponse([{ date: '2026-02-01', value: '4900.50' }]);
    let currentTime = 1_000_000;
    const service = createAlphaVantageService({ fetchImpl, apiKey: 'test-key', now: () => currentTime });

    await service.getDailyHistory();
    currentTime += 24 * 60 * 60 * 1000 + 1;
    await service.getDailyHistory();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/alphaVantage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/services/alphaVantage.ts`:

```ts
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

export function createAlphaVantageService(deps: AlphaVantageServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const apiKey = deps.apiKey ?? process.env.ALPHA_VANTAGE_API_KEY;

  let cache: { expiresAt: number; data: GoldSnapshot[] } | null = null;

  async function getDailyHistory(): Promise<GoldSnapshot[]> {
    if (!apiKey) {
      throw new AlphaVantageUnavailableError('ALPHA_VANTAGE_API_KEY is not configured');
    }
    if (cache && cache.expiresAt > now()) {
      return cache.data;
    }

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
      const item = raw as Record<string, unknown>;
      const date = item.date;
      const value = Number(item.value);
      if (typeof date !== 'string' || Number.isNaN(value)) continue;
      snapshots.push({ date, value });
    }

    cache = { expiresAt: now() + DAILY_CACHE_TTL_MS, data: snapshots };
    return snapshots;
  }

  return { getDailyHistory };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/alphaVantage.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/alphaVantage.ts backend/src/services/alphaVantage.test.ts
git commit -m "feat(backend): add alphaVantage service for XAU/USD gold price data"
```

---

### Task 3: `services/fred.ts`

**Files:**
- Create: `backend/src/services/fred.ts`
- Test: `backend/src/services/fred.test.ts`

**Interfaces:**
- Consumes: nothing beyond `fetch`.
- Produces: `createFredService(deps): { getSummary(): Promise<FredSummary> }`,
  `FredUnavailableError`, `FredSummary` (`{ fedFundsRate, realYield10y, cpi, dollarIndex }`,
  each `FredObservation | null`). Task 6 (`markets.ts`) consumes `getSummary()`.

- [ ] **Step 1: Write the failing tests**

`backend/src/services/fred.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createFredService, FredUnavailableError } from './fred.js';

function fredResponseFor(seriesToValue: Record<string, { date: string; value: string } | null>) {
  return vi.fn(async (url: string) => {
    const seriesId = new URL(url).searchParams.get('series_id')!;
    const point = seriesToValue[seriesId];
    return {
      ok: true,
      status: 200,
      json: async () => ({ observations: point ? [point] : [] }),
    } as Response;
  });
}

describe('createFredService — no API key', () => {
  it('throws FredUnavailableError without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createFredService({ fetchImpl, apiKey: undefined });

    await expect(service.getSummary()).rejects.toBeInstanceOf(FredUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createFredService — success', () => {
  it('fetches and parses all four series', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '5.33' },
      DFII10: { date: '2026-08-12', value: '1.85' },
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result).toEqual({
      fedFundsRate: { date: '2026-08-12', value: 5.33 },
      realYield10y: { date: '2026-08-12', value: 1.85 },
      cpi: { date: '2026-07-01', value: 312.5 },
      dollarIndex: { date: '2026-08-12', value: 121.4 },
    });
  });

  it('returns null for a series with no observations instead of failing the whole summary', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '5.33' },
      DFII10: null,
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result.realYield10y).toBeNull();
    expect(result.fedFundsRate).not.toBeNull();
  });

  it('treats a "." value (FRED\'s not-yet-released marker) as null for that series', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '.' },
      DFII10: { date: '2026-08-12', value: '1.85' },
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    const result = await service.getSummary();

    expect(result.fedFundsRate).toBeNull();
  });
});

describe('createFredService — failure handling', () => {
  it('throws FredUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getSummary()).rejects.toBeInstanceOf(FredUnavailableError);
  });

  it('throws FredUnavailableError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as Response);
    const service = createFredService({ fetchImpl, apiKey: 'test-key' });

    await expect(service.getSummary()).rejects.toBeInstanceOf(FredUnavailableError);
  });
});

describe('createFredService — caching', () => {
  it('reuses the cached summary within the TTL', async () => {
    const fetchImpl = fredResponseFor({
      DFF: { date: '2026-08-12', value: '5.33' },
      DFII10: { date: '2026-08-12', value: '1.85' },
      CPIAUCSL: { date: '2026-07-01', value: '312.5' },
      DTWEXBGS: { date: '2026-08-12', value: '121.4' },
    });
    let currentTime = 1_000_000;
    const service = createFredService({ fetchImpl, apiKey: 'test-key', now: () => currentTime, cacheTtlMs: 60_000 });

    await service.getSummary();
    currentTime += 30_000;
    await service.getSummary();

    expect(fetchImpl).toHaveBeenCalledTimes(4); // one call per series, only on the first getSummary
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/fred.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/services/fred.ts`:

```ts
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

    const [fedFundsRate, realYield10y, cpi, dollarIndex] = await Promise.all([
      fetchLatestObservation(fetchImpl, apiKey, SERIES.fedFundsRate),
      fetchLatestObservation(fetchImpl, apiKey, SERIES.realYield10y),
      fetchLatestObservation(fetchImpl, apiKey, SERIES.cpi),
      fetchLatestObservation(fetchImpl, apiKey, SERIES.dollarIndex),
    ]);

    const summary: FredSummary = { fedFundsRate, realYield10y, cpi, dollarIndex };
    cache = { expiresAt: now() + cacheTtlMs, data: summary };
    return summary;
  }

  return { getSummary };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/fred.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/fred.ts backend/src/services/fred.test.ts
git commit -m "feat(backend): add fred service for gold-relevant macro fundamentals"
```

---

### Task 4: Extend `services/rss.ts` with gold/forex sources

**Files:**
- Modify: `backend/src/services/rss.ts`
- Modify: `backend/src/services/rss.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `FEED_SOURCES` gains two entries (`fxstreet`, `investinglive`); `CURRENCY_ALIASES`
  gains an `XAU` entry. Task 6 (`markets.ts`) calls `newsService.fetchNews({ currencies: 'XAU' })`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/rss.test.ts` (the file already has `fakeParser` and destructures
`FEED_SOURCES` at the top — the existing `[coindesk, cointelegraph, theblock, decrypt]`
destructuring by position is unaffected since the two new sources are appended at the end):

```ts
describe('createNewsService — XAU currency alias', () => {
  it('matches "XAU" via the word "gold" in the title', async () => {
    const parser = fakeParser({
      [coindesk.url]: {
        items: [
          { title: 'Gold prices climb as investors seek safe haven', link: 'https://a.example', pubDate: '2026-08-12T00:00:00Z' },
          { title: 'Unrelated market roundup', link: 'https://b.example', pubDate: '2026-08-12T00:00:00Z' },
        ],
      },
      [cointelegraph.url]: { items: [] },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
      [fxstreet.url]: { items: [] },
      [investinglive.url]: { items: [] },
    });
    const service = createNewsService({ parser });

    const posts = await service.fetchNews({ currencies: 'XAU' });

    expect(posts).toEqual([expect.objectContaining({ title: 'Gold prices climb as investors seek safe haven' })]);
  });
});
```

Change the existing destructuring line near the top of the file from:

```ts
const [coindesk, cointelegraph, theblock, decrypt] = FEED_SOURCES;
```

to:

```ts
const [coindesk, cointelegraph, theblock, decrypt, fxstreet, investinglive] = FEED_SOURCES;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/rss.test.ts`
Expected: FAIL — `fxstreet`/`investinglive` are `undefined` (only 4 sources exist yet), and/or
the XAU alias test fails since no keyword match exists for "gold".

- [ ] **Step 3: Add the two sources and the XAU alias**

In `backend/src/services/rss.ts`, change:

```ts
export const FEED_SOURCES: FeedSource[] = [
  { key: 'coindesk', title: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { key: 'cointelegraph', title: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { key: 'theblock', title: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { key: 'decrypt', title: 'Decrypt', url: 'https://decrypt.co/feed' },
];
```

to:

```ts
export const FEED_SOURCES: FeedSource[] = [
  { key: 'coindesk', title: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { key: 'cointelegraph', title: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { key: 'theblock', title: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { key: 'decrypt', title: 'Decrypt', url: 'https://decrypt.co/feed' },
  { key: 'fxstreet', title: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { key: 'investinglive', title: 'InvestingLive', url: 'https://investinglive.com/feed/news' },
];
```

And change:

```ts
const CURRENCY_ALIASES: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth'],
  SOL: ['solana', 'sol'],
  USDC: ['usdc', 'usd coin'],
  JUP: ['jupiter'],
  BONK: ['bonk'],
  JLP: ['jlp'],
  JTO: ['jito'],
  WIF: ['dogwifhat', '$wif'],
  PYTH: ['pyth network', 'pyth'],
};
```

to:

```ts
const CURRENCY_ALIASES: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'eth'],
  SOL: ['solana', 'sol'],
  USDC: ['usdc', 'usd coin'],
  JUP: ['jupiter'],
  BONK: ['bonk'],
  JLP: ['jlp'],
  JTO: ['jito'],
  WIF: ['dogwifhat', '$wif'],
  PYTH: ['pyth network', 'pyth'],
  XAU: ['gold', 'xau', 'bullion'],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/rss.test.ts`
Expected: PASS, all tests (the new one plus every pre-existing test — none should break, since
the destructuring change only adds two new bindings and the two new feed sources don't affect
any existing test's fixtures, which explicitly list all 4-6 sources per the `fakeParser` calls
already in the file... check: **existing tests that build a `fakeParser` map only for the
original 4 sources will now be missing fixtures for `fxstreet`/`investinglive`, and
`fakeParser`'s `parseURL` throws `no fixture for ${url}` for any URL not in its map.** Since
`createNewsService({ parser }).fetchNews({})` (no source filter) fetches ALL of `FEED_SOURCES`
in parallel via `Promise.allSettled` (see `getMergedFeed` — it filters to `succeeded` results,
tolerating some failures), a missing fixture for the two new sources will make those two feeds
fail, but the pre-existing tests only assert on specific `succeeded` posts from the 4 original
sources they DID provide fixtures for — so this should still pass. If any pre-existing test
fails specifically because of the two new sources, add `{ items: [] }` fixtures for
`fxstreet.url` and `investinglive.url` to that test's `fakeParser` call, matching the pattern
already used for `theblock`/`decrypt` in tests that don't care about them.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/rss.ts backend/src/services/rss.test.ts
git commit -m "feat(backend): add FXStreet/InvestingLive news sources and an XAU currency alias"
```

---

### Task 5: `services/xauHistory.ts` and the static dataset

**Files:**
- Create: `backend/src/data/xau-daily-history.csv` (committed)
- Create: `backend/src/services/xauHistory.ts`
- Test: `backend/src/services/xauHistory.test.ts`

**Interfaces:**
- Consumes: `createAlphaVantageService`'s `getDailyHistory(): Promise<GoldSnapshot[]>` (Task 2),
  and re-uses the `PriceRow` type from `services/mlService.ts` (Task 1) rather than redefining
  it, since Task 6 passes this task's output directly to `mlService.getDirection(prices:
  PriceRow[])`.
- Produces: `createXauHistoryService(deps): { getFullHistory(): Promise<PriceRow[]> }`. Task 6
  (`markets.ts`) consumes `getFullHistory()` for both the chart and the ml-service direction
  call.

- [ ] **Step 1: Copy the static dataset**

Copy the ml-service training data (same file used to train the model) into the backend:

```bash
cp "ml-service/training/data/XAU_1d_data.csv" "backend/src/data/xau-daily-history.csv"
```

(If `ml-service/training/data/XAU_1d_data.csv` isn't present in this worktree — it's gitignored
in `ml-service/`, not committed — copy it from wherever Phase 1's dataset currently lives; it's
the same semicolon-delimited `Date;Open;High;Low;Close;Volume` file with 5,531 rows,
2004-06-11 to 2026-01-30, used to train the ml-service model. This backend copy IS committed —
it's a small, curated derived file distinct from ml-service's raw gitignored training dump.)

- [ ] **Step 2: Write the failing tests**

`backend/src/services/xauHistory.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createXauHistoryService } from './xauHistory.js';

const FAKE_STATIC_CSV = `Date;Open;High;Low;Close;Volume
2026.01.28 00:00;5179.67;5419.08;5157.04;5414.46;1000
2026.01.29 00:00;5421.43;5597.60;5097.38;5377.00;1100
2026.01.30 00:00;5385.09;5450.62;4679.69;4889.48;1200
`;

describe('createXauHistoryService — static-only', () => {
  it('parses the static CSV into ascending PriceRow entries when Alpha Vantage is unavailable', async () => {
    const alphaVantageService = { getDailyHistory: vi.fn().mockRejectedValue(new Error('no key')) };
    const service = createXauHistoryService({ alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getFullHistory();

    expect(history).toEqual([
      { date: '2026-01-28', open: 5179.67, high: 5419.08, low: 5157.04, close: 5414.46, volume: 1000 },
      { date: '2026-01-29', open: 5421.43, high: 5597.6, low: 5097.38, close: 5377, volume: 1100 },
      { date: '2026-01-30', open: 5385.09, high: 5450.62, low: 4679.69, close: 4889.48, volume: 1200 },
    ]);
  });
});

describe('createXauHistoryService — merged with live data', () => {
  it('appends only the live rows newer than the static data\'s last date', async () => {
    const alphaVantageService = {
      getDailyHistory: vi.fn().mockResolvedValue([
        { date: '2026-01-29', value: 5377.0 }, // already in static data -- must not duplicate
        { date: '2026-01-31', value: 4900.0 }, // new
        { date: '2026-02-01', value: 4915.5 }, // new
      ]),
    };
    const service = createXauHistoryService({ alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getFullHistory();

    expect(history).toHaveLength(5); // 3 static + 2 genuinely new
    expect(history[3]).toEqual({ date: '2026-01-31', open: 4900, high: 4900, low: 4900, close: 4900, volume: 0 });
    expect(history[4].date).toBe('2026-02-01');
  });

  it('falls back to static-only data when Alpha Vantage throws, without failing the whole call', async () => {
    const alphaVantageService = { getDailyHistory: vi.fn().mockRejectedValue(new Error('rate limited')) };
    const service = createXauHistoryService({ alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getFullHistory();

    expect(history).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/xauHistory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`backend/src/services/xauHistory.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAlphaVantageService, type GoldSnapshot } from './alphaVantage.js';
import type { PriceRow } from './mlService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_CSV_PATH = path.join(__dirname, '../data/xau-daily-history.csv');

export type { PriceRow };

export interface AlphaVantageServiceLike {
  getDailyHistory(): Promise<GoldSnapshot[]>;
}

export interface XauHistoryServiceDeps {
  alphaVantageService?: AlphaVantageServiceLike;
  staticCsvContent?: string;
}

function parseStaticCsv(content: string): PriceRow[] {
  const lines = content.trim().split('\n');
  const rows: PriceRow[] = [];
  for (const line of lines.slice(1)) {
    const [dateRaw, openStr, highStr, lowStr, closeStr, volumeStr] = line.split(';');
    const open = Number(openStr);
    const high = Number(highStr);
    const low = Number(lowStr);
    const close = Number(closeStr);
    const volume = Number(volumeStr);
    if (!dateRaw || [open, high, low, close, volume].some((n) => Number.isNaN(n))) continue;
    // Static file uses "YYYY.MM.DD HH:MM" -- normalize to "YYYY-MM-DD".
    const date = dateRaw.slice(0, 10).replace(/\./g, '-');
    rows.push({ date, open, high, low, close, volume });
  }
  return rows;
}

export function createXauHistoryService(deps: XauHistoryServiceDeps = {}) {
  const alphaVantageService = deps.alphaVantageService ?? createAlphaVantageService();
  const staticCsvContent = deps.staticCsvContent ?? readFileSync(STATIC_CSV_PATH, 'utf-8');
  const staticHistory = parseStaticCsv(staticCsvContent);

  async function getFullHistory(): Promise<PriceRow[]> {
    let liveSnapshots: GoldSnapshot[] = [];
    try {
      liveSnapshots = await alphaVantageService.getDailyHistory();
    } catch {
      // Alpha Vantage unavailable -- return the static history rather than failing the
      // whole chart/model-input request. The route layer surfaces this as a degraded
      // "price may be stale" state, not a hard error.
    }

    const staticMaxDate = staticHistory.length > 0 ? staticHistory[staticHistory.length - 1].date : '';
    const newRows: PriceRow[] = liveSnapshots
      .filter((s) => s.date > staticMaxDate)
      .map((s) => ({ date: s.date, open: s.value, high: s.value, low: s.value, close: s.value, volume: 0 }));

    return [...staticHistory, ...newRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return { getFullHistory };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/xauHistory.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/data/xau-daily-history.csv backend/src/services/xauHistory.ts backend/src/services/xauHistory.test.ts
git commit -m "feat(backend): add xauHistory service merging the static dataset with live Alpha Vantage data"
```

---

### Task 6: `routes/markets.ts`, server wiring, and env config

**Files:**
- Create: `backend/src/routes/markets.ts`
- Test: `backend/src/routes/markets.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `mlService` (Task 1), `alphaVantage`-backed `xauHistory` (Task 5), `fred` (Task 3),
  `rss`'s `fetchNews` (Task 4).
- Produces: `GET /api/markets/:symbol/signal`, `GET /api/markets/:symbol/history`. Frontend
  (Phase 3) calls both.

- [ ] **Step 1: Write the failing tests**

`backend/src/routes/markets.test.ts`:

```ts
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerMarketsRoutes } from './markets.js';

const SAMPLE_HISTORY = [
  { date: '2026-08-10', open: 4000, high: 4010, low: 3990, close: 4005, volume: 1000 },
  { date: '2026-08-11', open: 4005, high: 4020, low: 4000, close: 4015, volume: 1100 },
];

function fakeDeps(overrides: Partial<Parameters<typeof registerMarketsRoutes>[1]> = {}) {
  return {
    mlService: {
      getDirection: vi.fn().mockResolvedValue({ direction: 'bullish', confidence: 0.7 }),
      getSentiment: vi.fn().mockResolvedValue({ sentiment: 'positive', score: 0.8 }),
    },
    xauHistoryService: { getFullHistory: vi.fn().mockResolvedValue(SAMPLE_HISTORY) },
    fredService: {
      getSummary: vi.fn().mockResolvedValue({
        fedFundsRate: { date: '2026-08-12', value: 5.33 },
        realYield10y: { date: '2026-08-12', value: 1.85 },
        cpi: { date: '2026-07-01', value: 312.5 },
        dollarIndex: { date: '2026-08-12', value: 121.4 },
      }),
    },
    newsService: {
      fetchNews: vi.fn().mockResolvedValue([
        { id: '1', title: 'Gold rallies', url: 'https://a.example', sourceTitle: 'FXStreet', publishedAt: '2026-08-12T00:00:00Z' },
      ]),
    },
    ...overrides,
  };
}

describe('GET /api/markets/:symbol/history', () => {
  it('returns the merged price history for xau', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/history' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ history: SAMPLE_HISTORY });
  });

  it('returns 404 for an unsupported symbol', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps());

    const response = await app.inject({ method: 'GET', url: '/api/markets/nasdaq/history' });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/markets/:symbol/signal', () => {
  it('returns 200 with every section populated when all upstreams succeed', async () => {
    const app = Fastify();
    const deps = fakeDeps();
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.price).toEqual(SAMPLE_HISTORY[SAMPLE_HISTORY.length - 1]);
    expect(body.direction).toEqual({ data: { direction: 'bullish', confidence: 0.7 } });
    expect(body.fundamentals.data.fedFundsRate).toEqual({ date: '2026-08-12', value: 5.33 });
    expect(body.news.data).toHaveLength(1);
    expect(body.news.data[0].sentiment).toEqual({ sentiment: 'positive', score: 0.8 });
    expect(deps.mlService.getDirection).toHaveBeenCalledWith(SAMPLE_HISTORY);
  });

  it('degrades the direction section to an error without failing the whole response', async () => {
    const app = Fastify();
    const deps = fakeDeps({
      mlService: {
        getDirection: vi.fn().mockRejectedValue(new Error('ml-service down')),
        getSentiment: vi.fn().mockResolvedValue({ sentiment: 'neutral', score: 0.5 }),
      },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.direction.data).toBeNull();
    expect(typeof body.direction.error).toBe('string');
    expect(body.fundamentals.data).not.toBeNull(); // other sections still populated
  });

  it('degrades the fundamentals section to an error without failing the whole response', async () => {
    const app = Fastify();
    const deps = fakeDeps({
      fredService: { getSummary: vi.fn().mockRejectedValue(new Error('FRED_API_KEY is not configured')) },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.fundamentals.data).toBeNull();
    expect(typeof body.fundamentals.error).toBe('string');
    expect(body.direction.data).not.toBeNull();
  });

  it('degrades the news section to an error, and skips per-article sentiment when news itself fails', async () => {
    const app = Fastify();
    const deps = fakeDeps({
      newsService: { fetchNews: vi.fn().mockRejectedValue(new Error('all feeds down')) },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.news.data).toBeNull();
    expect(typeof body.news.error).toBe('string');
  });

  it("degrades one article's sentiment to null without failing the news section", async () => {
    const app = Fastify();
    const deps = fakeDeps({
      mlService: {
        getDirection: vi.fn().mockResolvedValue({ direction: 'bullish', confidence: 0.7 }),
        getSentiment: vi.fn().mockRejectedValue(new Error('ml-service sentiment down')),
      },
    });
    registerMarketsRoutes(app, deps);

    const response = await app.inject({ method: 'GET', url: '/api/markets/xau/signal' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.news.data).toHaveLength(1);
    expect(body.news.data[0].sentiment).toBeNull();
  });

  it('returns 404 for an unsupported symbol', async () => {
    const app = Fastify();
    registerMarketsRoutes(app, fakeDeps());

    const response = await app.inject({ method: 'GET', url: '/api/markets/nasdaq/signal' });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/markets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

`backend/src/routes/markets.ts`:

```ts
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

    let news: SectionResult<Array<NewsPost & { sentiment: SentimentResult | null }>>;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/routes/markets.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Wire the routes into the server**

In `backend/src/server.ts`, change:

```ts
import { registerPoolsRoutes } from './routes/pools.js';
```

to:

```ts
import { registerPoolsRoutes } from './routes/pools.js';
import { registerMarketsRoutes } from './routes/markets.js';
```

and change:

```ts
  registerPoolsRoutes(app);

  return app;
```

to:

```ts
  registerPoolsRoutes(app);
  registerMarketsRoutes(app);

  return app;
```

- [ ] **Step 6: Add the new env vars**

In `backend/.env.example`, change:

```
PORT=4000
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SOLANA_RPC_URL=https://api.devnet.solana.com
CRYPTOPANIC_API_KEY=
```

to:

```
PORT=4000
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SOLANA_RPC_URL=https://api.devnet.solana.com
CRYPTOPANIC_API_KEY=
ML_SERVICE_URL=http://localhost:8000
# UNVERIFIED whether Alpha Vantage's free tier covers this -- see
# docs/superpowers/specs/2026-08-13-xau-market-signal-design.md
ALPHA_VANTAGE_API_KEY=
FRED_API_KEY=
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: every test across the whole backend passes, including all pre-existing suites and
every new one from this plan.

- [ ] **Step 8: Manual verification**

Start ml-service (`cd ml-service && uv run uvicorn app.main:app --port 8000`) and the backend
(`cd backend && npm run dev`). Hit both new endpoints:

```bash
curl -s http://localhost:4000/api/markets/xau/history | head -c 500
curl -s http://localhost:4000/api/markets/xau/signal
```

Expected: `/history` returns real merged price data (the static dataset, since
`ALPHA_VANTAGE_API_KEY` is presumably unset in this environment — confirm the static portion
alone still works). `/signal` returns `200` with `direction.data` populated with a **real**
prediction from the real running ml-service (confirming the full `history` array — thousands of
rows — successfully round-trips through `mlService.getDirection` without a timeout or error),
`news.data` populated with real FXStreet/InvestingLive/etc. articles each carrying a real
sentiment tag from ml-service, and `fundamentals.data: null` with a real `error` string (since
`FRED_API_KEY` is presumably also unset) — confirming the per-section degradation actually works
end-to-end, not just in mocked tests.

- [ ] **Step 9: Commit**

```bash
git add backend/src/routes/markets.ts backend/src/routes/markets.test.ts backend/src/server.ts backend/.env.example
git commit -m "feat(backend): add GET /api/markets/xau/signal and /history routes"
```

## Verification

1. `cd backend && npm test` and `npx tsc --noEmit` — all tests pass, no type errors.
2. Manual verification per Task 6 Step 8, confirming real end-to-end behavior against the real
   running ml-service and real graceful degradation for the unconfigured Alpha Vantage/FRED
   sections.
3. Flag prominently to the user: Alpha Vantage's actual free-tier gold access and response shape
   remain unverified — this should be tested with a real API key before this integration is
   considered done, not just "implemented."
