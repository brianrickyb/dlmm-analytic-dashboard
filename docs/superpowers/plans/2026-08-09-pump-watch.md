# Pump Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Screener panel, "Pump Watch," that computes its own early pump signal from GeckoTerminal's on-chain new-pool data (not a third party's trending algorithm), with best-effort CryptoPanic news correlation per candidate.

**Architecture:** Two new backend service modules (`geckoterminal.ts`, `cryptopanic.ts`) follow the exact factory/cache/error-class pattern already used by `bybit.ts`/`coingecko.ts`. A new `GET /api/screener/pump-watch` route composes them: GeckoTerminal is the primary source (its failure is a hard 503, same as the other two Screener endpoints); CryptoPanic is best-effort (its failure degrades a single candidate to `news: null`, never fails the request). Frontend adds one component (`PumpWatch.tsx`, same shape as `TrendingWatch.tsx`) and wires it into `ScreenerPage.tsx` as a third independent loading/error/ready block, exactly mirroring the two that already exist there.

**Tech Stack:** Fastify 5 + TypeScript + Vitest (backend), React 19 + TypeScript (frontend) — no new dependencies; both new backend integrations use the built-in `fetch`, same as every existing Screener service.

## Global Constraints

- Heuristic thresholds (exact, from the approved design spec) — a GeckoTerminal pool qualifies as a candidate when **all three** hold: pool age ≤ 72 hours, `price_change_percentage.h6` ≥ 25, `volume_usd.h24` ≥ 50000. All three comparisons are inclusive at the boundary (`>=`/`<=`, not strict).
- Candidates are sorted by 6h price change descending, capped at **15**.
- GeckoTerminal pagination: fetch up to **5 pages** (`?page=1..5`) of `https://api.geckoterminal.com/api/v2/networks/new_pools`, stopping early the first time a page returns zero pools. No API key, no auth header — this endpoint is fully public.
- GeckoTerminal failure handling: if **page 1** fails (network error, non-ok status, invalid JSON, or missing `data` array), throw `GeckoTerminalUnavailableError` — nothing to work with. If a **later** page (2–5) fails, stop paginating and return candidates computed from whatever pages already succeeded — do not throw. This mirrors `bybit.ts`'s existing partial-failure tolerance for its per-pair fan-out.
- CryptoPanic never throws. `getRecentNewsForSymbol` returns `Promise<NewsMatch | null>` in every case — no API key configured, network failure, non-ok response, malformed JSON, no results, or the most recent result being older than 48 hours all resolve to `null`. This is deliberate: CryptoPanic is best-effort per the design spec, and the route must never fail the whole panel because news correlation for one symbol didn't work.
- CryptoPanic endpoint: `https://cryptopanic.com/api/v1/posts/?auth_token=<key>&currencies=<symbol>`. Auth token comes from `CRYPTOPANIC_API_KEY` (new env var, `backend/.env.example`), read via an injectable `apiKey` dep defaulting to `process.env.CRYPTOPANIC_API_KEY`.
- News freshness window: an article only counts as a match if `now - published_at <= 48 hours`.
- Both new services follow the **exact** dependency-injection/caching shape already established by `bybit.ts`/`coingecko.ts`: a `create<X>Service(deps: { fetchImpl?, now?, cacheTtlMs?, ... })` factory, `fetchImpl` defaulting to global `fetch`, `now` defaulting to `Date.now`, an in-memory cache keyed by TTL (GeckoTerminal: single cached array; CryptoPanic: a `Map` keyed by symbol, since it's queried once per candidate). Default `cacheTtlMs` for both: **90000** (90 seconds).
- Frontend visual conventions (already established, do not invent new ones): `rounded-xl` cards on `var(--surface-1)`/`var(--border)`, wrapped pill-card row layout (`flex flex-wrap gap-2`, same as `TrendingWatch.tsx`), `Badge` component (`frontend/src/components/Badge.tsx`, `variant="accent"`) for the "News" indicator, `PillButton` component (`frontend/src/components/PillButton.tsx`, default `tinted` variant) for the Retry action, `var(--status-good)` for the (always-positive) price-change figure.
- `ScreenerPage.tsx`'s two existing panels (`PositioningTable`/Bybit, `TrendingWatch`/CoinGecko) are not modified in any way by this plan — Pump Watch is strictly additive, a third independent section.

---

### Task 1: GeckoTerminal service

**Files:**
- Create: `backend/src/services/geckoterminal.ts`
- Test: `backend/src/services/geckoterminal.test.ts`

**Interfaces:**
- Produces: `PumpCandidate` interface (`poolId: string`, `network: string`, `dex: string`, `symbol: string`, `priceChangePct6h: number`, `volumeUsd24h: number`, `poolCreatedAt: string`, `poolUrl: string`), `GeckoTerminalUnavailableError` class, `createGeckoTerminalService(deps?): { getPumpCandidates(): Promise<PumpCandidate[]> }`. Consumed by Task 3 (`screener.ts`) and Task 4 (`frontend/src/types/screener.ts`, which mirrors this shape).

- [ ] **Step 1: Write the service**

```ts
export interface PumpCandidate {
  poolId: string;
  network: string;
  dex: string;
  symbol: string;
  priceChangePct6h: number;
  volumeUsd24h: number;
  poolCreatedAt: string;
  poolUrl: string;
}

export class GeckoTerminalUnavailableError extends Error {}

export interface GeckoTerminalServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 90 * 1000;
const NEW_POOLS_URL = 'https://api.geckoterminal.com/api/v2/networks/new_pools';
const MAX_PAGES = 5;
const MAX_POOL_AGE_MS = 72 * 60 * 60 * 1000;
const MIN_PRICE_CHANGE_H6_PCT = 25;
const MIN_VOLUME_USD_24H = 50_000;
const MAX_CANDIDATES = 15;

interface RawPool {
  id: string;
  attributes?: {
    name?: unknown;
    address?: unknown;
    pool_created_at?: unknown;
    price_change_percentage?: { h6?: unknown };
    volume_usd?: { h24?: unknown };
  };
  relationships?: {
    network?: { data?: { id?: unknown } };
    dex?: { data?: { id?: unknown } };
  };
}

function parseSymbol(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const base = name.split(' / ')[0]?.trim();
  return base && base.length > 0 ? base : null;
}

function parsePool(raw: RawPool, nowMs: number): PumpCandidate | null {
  const attrs = raw.attributes;
  if (!attrs) return null;

  const symbol = parseSymbol(attrs.name);
  const network = attrs && raw.relationships?.network?.data?.id;
  const dex = raw.relationships?.dex?.data?.id;
  const address = attrs.address;
  const poolCreatedAt = attrs.pool_created_at;
  const priceChangePct6h = Number(attrs.price_change_percentage?.h6);
  const volumeUsd24h = Number(attrs.volume_usd?.h24);

  if (
    !symbol ||
    typeof network !== 'string' ||
    typeof dex !== 'string' ||
    typeof address !== 'string' ||
    typeof poolCreatedAt !== 'string' ||
    Number.isNaN(priceChangePct6h) ||
    Number.isNaN(volumeUsd24h)
  ) {
    return null;
  }

  const createdAtMs = Date.parse(poolCreatedAt);
  if (Number.isNaN(createdAtMs)) return null;

  const ageMs = nowMs - createdAtMs;
  if (ageMs < 0 || ageMs > MAX_POOL_AGE_MS) return null;
  if (priceChangePct6h < MIN_PRICE_CHANGE_H6_PCT) return null;
  if (volumeUsd24h < MIN_VOLUME_USD_24H) return null;

  return {
    poolId: raw.id,
    network,
    dex,
    symbol,
    priceChangePct6h,
    volumeUsd24h,
    poolCreatedAt,
    poolUrl: `https://www.geckoterminal.com/${network}/pools/${address}`,
  };
}

async function fetchPage(fetchImpl: typeof fetch, page: number): Promise<RawPool[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${NEW_POOLS_URL}?page=${page}`, {
      headers: { Accept: 'application/json;version=20230302' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (page === 1) throw new GeckoTerminalUnavailableError('Failed to reach GeckoTerminal', { cause: err });
    return [];
  }

  if (!response.ok) {
    if (page === 1) throw new GeckoTerminalUnavailableError(`GeckoTerminal returned status ${response.status}`);
    return [];
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    if (page === 1) throw new GeckoTerminalUnavailableError('GeckoTerminal response was not valid JSON', { cause: err });
    return [];
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    if (page === 1) throw new GeckoTerminalUnavailableError('GeckoTerminal response missing expected data field');
    return [];
  }

  return data as RawPool[];
}

export function createGeckoTerminalService(deps: GeckoTerminalServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  let cache: { expiresAt: number; data: PumpCandidate[] } | null = null;

  async function getPumpCandidates(): Promise<PumpCandidate[]> {
    if (cache && cache.expiresAt > now()) {
      return cache.data;
    }

    const nowMs = now();
    const allRaw: RawPool[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pagePools = await fetchPage(fetchImpl, page);
      if (pagePools.length === 0) break;
      allRaw.push(...pagePools);
    }

    const candidates = allRaw
      .map((raw) => parsePool(raw, nowMs))
      .filter((c): c is PumpCandidate => c !== null)
      .sort((a, b) => b.priceChangePct6h - a.priceChangePct6h)
      .slice(0, MAX_CANDIDATES);

    cache = { expiresAt: now() + cacheTtlMs, data: candidates };
    return candidates;
  }

  return { getPumpCandidates };
}
```

Save as `backend/src/services/geckoterminal.ts`.

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGeckoTerminalService, GeckoTerminalUnavailableError } from './geckoterminal.js';

const FIXED_NOW = new Date('2026-08-09T12:00:00Z').getTime();

function hoursAgoIso(hours: number): string {
  return new Date(FIXED_NOW - hours * 3_600_000).toISOString();
}

function buildRawPool(overrides: {
  symbol?: string;
  network?: string;
  dex?: string;
  address?: string;
  ageHours?: number;
  priceChangeH6?: string;
  volumeH24?: string;
}) {
  const network = overrides.network ?? 'solana';
  const address = overrides.address ?? 'ADDR1';
  return {
    id: `${network}_${address}`,
    type: 'pool',
    attributes: {
      name: `${overrides.symbol ?? 'FOO'} / USDC`,
      address,
      pool_created_at: hoursAgoIso(overrides.ageHours ?? 10),
      price_change_percentage: { h6: overrides.priceChangeH6 ?? '30' },
      volume_usd: { h24: overrides.volumeH24 ?? '100000' },
    },
    relationships: {
      network: { data: { id: network } },
      dex: { data: { id: overrides.dex ?? 'pump-fun' } },
    },
  };
}

function fakeFetchPages(pages: unknown[][]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    const pageMatch = url.match(/page=(\d+)/);
    const pageNum = pageMatch ? Number(pageMatch[1]) : 1;
    const data = pages[pageNum - 1] ?? [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
}

describe('createGeckoTerminalService — heuristic filtering', () => {
  it('keeps a pool that passes all three rules', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ symbol: 'FOO', ageHours: 10, priceChangeH6: '30', volumeH24: '100000' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ symbol: 'FOO', priceChangePct6h: 30, volumeUsd24h: 100000 });
    expect(candidates[0].poolUrl).toBe('https://www.geckoterminal.com/solana/pools/ADDR1');
  });

  it('drops a pool older than 72 hours', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ ageHours: 100 })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(0);
  });

  it('keeps a pool exactly at the 72-hour boundary', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ ageHours: 72 })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(1);
  });

  it('drops a pool with 6h price change below 25%', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ priceChangeH6: '24.9' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(0);
  });

  it('keeps a pool exactly at the 25% price-change boundary', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ priceChangeH6: '25' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(1);
  });

  it('drops a pool with 24h volume below $50,000', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ volumeH24: '49999' })]]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    expect(await service.getPumpCandidates()).toHaveLength(0);
  });

  it('sorts by 6h price change descending and caps at 15', async () => {
    const pools = Array.from({ length: 20 }, (_, i) =>
      buildRawPool({ symbol: `SYM${i}`, address: `ADDR${i}`, priceChangeH6: String(30 + i) }),
    );
    const fetchImpl = fakeFetchPages([pools]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(15);
    expect(candidates[0].symbol).toBe('SYM19'); // highest price change (30+19=49)
    expect(candidates[0].priceChangePct6h).toBe(49);
    expect(candidates[14].priceChangePct6h).toBe(35); // 15th-highest kept value; 34 and below (5 pools) are dropped
  });
});

describe('createGeckoTerminalService — pagination', () => {
  it('stops paginating once a page returns zero pools', async () => {
    const fetchImpl = fakeFetchPages([[buildRawPool({ symbol: 'FOO' })], []]);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    await service.getPumpCandidates();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops (not throws) when a later page fails, keeping earlier pages’ candidates', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) return { ok: true, status: 200, json: async () => ({ data: [buildRawPool({ symbol: 'FOO' })] }) } as Response;
      throw new Error('network down');
    });
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    const candidates = await service.getPumpCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].symbol).toBe('FOO');
  });
});

describe('createGeckoTerminalService — total failure', () => {
  it('throws GeckoTerminalUnavailableError when page 1 network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    await expect(service.getPumpCandidates()).rejects.toBeInstanceOf(GeckoTerminalUnavailableError);
  });

  it('throws GeckoTerminalUnavailableError when page 1 returns a non-ok status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const service = createGeckoTerminalService({ fetchImpl, now: () => FIXED_NOW });

    await expect(service.getPumpCandidates()).rejects.toBeInstanceOf(GeckoTerminalUnavailableError);
  });
});

describe('createGeckoTerminalService — caching', () => {
  it('reuses the cached result within the TTL', async () => {
    const fetchImpl = fakeFetchPages([[]]);
    let currentTime = FIXED_NOW;
    const service = createGeckoTerminalService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000 });

    await service.getPumpCandidates();
    currentTime += 30_000;
    await service.getPumpCandidates();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakeFetchPages([[]]);
    let currentTime = FIXED_NOW;
    const service = createGeckoTerminalService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000 });

    await service.getPumpCandidates();
    currentTime += 90_001;
    await service.getPumpCandidates();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

Save as `backend/src/services/geckoterminal.test.ts`.

- [ ] **Step 3: Run the tests**

Run: `cd backend && npx vitest run src/services/geckoterminal.test.ts`
Expected: all tests pass (13 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/geckoterminal.ts backend/src/services/geckoterminal.test.ts
git commit -m "feat(backend): add GeckoTerminal pump-detection service"
```

---

### Task 2: CryptoPanic service

**Files:**
- Create: `backend/src/services/cryptopanic.ts`
- Test: `backend/src/services/cryptopanic.test.ts`

**Interfaces:**
- Produces: `NewsMatch` interface (`title: string`, `url: string`, `publishedAt: string`), `createCryptoPanicService(deps?): { getRecentNewsForSymbol(symbol: string): Promise<NewsMatch | null> }`. No error class — this service never throws (see Global Constraints). Consumed by Task 3 (`screener.ts`) and Task 4 (`frontend/src/types/screener.ts`).

- [ ] **Step 1: Write the service**

```ts
export interface NewsMatch {
  title: string;
  url: string;
  publishedAt: string;
}

export interface CryptoPanicServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  apiKey?: string;
}

const DEFAULT_CACHE_TTL_MS = 90 * 1000;
const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;
const POSTS_URL = 'https://cryptopanic.com/api/v1/posts/';

export function createCryptoPanicService(deps: CryptoPanicServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const apiKey = deps.apiKey ?? process.env.CRYPTOPANIC_API_KEY;
  const cache = new Map<string, { expiresAt: number; data: NewsMatch | null }>();

  async function getRecentNewsForSymbol(symbol: string): Promise<NewsMatch | null> {
    if (!apiKey) return null;

    const cached = cache.get(symbol);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const result = await fetchNews(symbol);
    cache.set(symbol, { expiresAt: now() + cacheTtlMs, data: result });
    return result;
  }

  async function fetchNews(symbol: string): Promise<NewsMatch | null> {
    let response: Response;
    try {
      const url = `${POSTS_URL}?auth_token=${encodeURIComponent(apiKey!)}&currencies=${encodeURIComponent(symbol)}`;
      response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    const results = (payload as { results?: unknown })?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const first = results[0] as Record<string, unknown>;
    const publishedAt = typeof first.published_at === 'string' ? first.published_at : null;
    const title = typeof first.title === 'string' ? first.title : null;
    const url = typeof first.url === 'string' ? first.url : null;
    if (!publishedAt || !title || !url) return null;

    const publishedAtMs = Date.parse(publishedAt);
    if (Number.isNaN(publishedAtMs)) return null;
    if (now() - publishedAtMs > FRESHNESS_WINDOW_MS) return null;

    return { title, url, publishedAt };
  }

  return { getRecentNewsForSymbol };
}
```

Save as `backend/src/services/cryptopanic.ts`.

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCryptoPanicService } from './cryptopanic.js';

const FIXED_NOW = new Date('2026-08-09T12:00:00Z').getTime();

function hoursAgoIso(hours: number): string {
  return new Date(FIXED_NOW - hours * 3_600_000).toISOString();
}

function fakePostsResponse(posts: { title: string; url: string; publishedAt: string }[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      results: posts.map((p) => ({ title: p.title, url: p.url, published_at: p.publishedAt })),
    }),
  } as Response);
}

describe('createCryptoPanicService — no API key configured', () => {
  it('returns null without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: undefined });

    const result = await service.getRecentNewsForSymbol('FOO');

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createCryptoPanicService — freshness', () => {
  it('returns the most recent article when it is fresh (within 48h)', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForSymbol('FOO');

    expect(result).toEqual({ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) });
  });

  it('returns null when the most recent article is older than 48h', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'Old news', url: 'https://example.com/old', publishedAt: hoursAgoIso(49) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForSymbol('FOO');

    expect(result).toBeNull();
  });

  it('returns null when there are no results', async () => {
    const fetchImpl = fakePostsResponse([]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    expect(await service.getRecentNewsForSymbol('FOO')).toBeNull();
  });
});

describe('createCryptoPanicService — best-effort failure handling (never throws)', () => {
  it('returns null when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForSymbol('FOO')).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForSymbol('FOO')).resolves.toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForSymbol('FOO')).resolves.toBeNull();
  });
});

describe('createCryptoPanicService — caching', () => {
  it('reuses the cached result per symbol within the TTL', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'FOO surges', url: 'https://example.com/foo', publishedAt: hoursAgoIso(2) }]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    currentTime += 30_000;
    await service.getRecentNewsForSymbol('FOO');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakePostsResponse([]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    currentTime += 90_001;
    await service.getRecentNewsForSymbol('FOO');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches independently per symbol', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'X', url: 'https://example.com/x', publishedAt: hoursAgoIso(1) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('FOO');
    await service.getRecentNewsForSymbol('BAR');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

Save as `backend/src/services/cryptopanic.test.ts`.

- [ ] **Step 3: Run the tests**

Run: `cd backend && npx vitest run src/services/cryptopanic.test.ts`
Expected: all tests pass (11 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/cryptopanic.ts backend/src/services/cryptopanic.test.ts
git commit -m "feat(backend): add CryptoPanic best-effort news correlation service"
```

---

### Task 3: Wire up the `/api/screener/pump-watch` route

**Files:**
- Modify: `backend/src/routes/screener.ts`
- Modify: `backend/src/routes/screener.test.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `createGeckoTerminalService`, `GeckoTerminalUnavailableError`, `PumpCandidate` (Task 1); `createCryptoPanicService`, `NewsMatch` (Task 2).
- Produces: `PumpWatchItem` type (`PumpCandidate & { news: NewsMatch | null }`), route `GET /api/screener/pump-watch` returning `{ items: PumpWatchItem[] }`. Consumed by Task 5 (`frontend/src/lib/api/screener.ts`).

- [ ] **Step 1: Add the route**

Read the current file first (`backend/src/routes/screener.ts`), then replace its entire contents with:

```ts
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
```

- [ ] **Step 2: Add route tests**

Read the current file first (`backend/src/routes/screener.test.ts`), then add these two `describe` blocks at the end of the file (keep the existing `majors`/`trending` blocks exactly as they are):

```ts
import { GeckoTerminalUnavailableError } from '../services/geckoterminal.js';
```

(add this import alongside the existing `BybitUnavailableError`/`CoinGeckoUnavailableError` imports at the top of the file)

```ts
describe('GET /api/screener/pump-watch', () => {
  it('returns items combining candidates with per-symbol news', async () => {
    const app = Fastify();
    const candidates = [
      { poolId: 'a', network: 'solana', dex: 'pump-fun', symbol: 'FOO', priceChangePct6h: 40, volumeUsd24h: 100000, poolCreatedAt: '2026-08-09T00:00:00Z', poolUrl: 'https://www.geckoterminal.com/solana/pools/a' },
      { poolId: 'b', network: 'solana', dex: 'raydium', symbol: 'BAR', priceChangePct6h: 30, volumeUsd24h: 200000, poolCreatedAt: '2026-08-09T00:00:00Z', poolUrl: 'https://www.geckoterminal.com/solana/pools/b' },
    ];
    const geckoTerminalService = { getPumpCandidates: vi.fn().mockResolvedValue(candidates) };
    const news: Record<string, { title: string; url: string; publishedAt: string } | null> = {
      FOO: { title: 'FOO pumps', url: 'https://example.com/foo', publishedAt: '2026-08-09T11:00:00Z' },
      BAR: null,
    };
    const cryptoPanicService = { getRecentNewsForSymbol: vi.fn(async (symbol: string) => news[symbol] ?? null) };
    registerScreenerRoutes(app, { geckoTerminalService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/pump-watch' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        { ...candidates[0], news: news.FOO },
        { ...candidates[1], news: null },
      ],
    });
  });

  it('returns 503 when GeckoTerminal is unavailable', async () => {
    const app = Fastify();
    const geckoTerminalService = { getPumpCandidates: vi.fn().mockRejectedValue(new GeckoTerminalUnavailableError('down')) };
    const cryptoPanicService = { getRecentNewsForSymbol: vi.fn() };
    registerScreenerRoutes(app, { geckoTerminalService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/pump-watch' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Pump watch data is unavailable right now.' });
  });

  it('still returns a candidate with news: null when CryptoPanic has nothing for it', async () => {
    const app = Fastify();
    const candidates = [
      { poolId: 'a', network: 'solana', dex: 'pump-fun', symbol: 'FOO', priceChangePct6h: 40, volumeUsd24h: 100000, poolCreatedAt: '2026-08-09T00:00:00Z', poolUrl: 'https://www.geckoterminal.com/solana/pools/a' },
    ];
    const geckoTerminalService = { getPumpCandidates: vi.fn().mockResolvedValue(candidates) };
    const cryptoPanicService = { getRecentNewsForSymbol: vi.fn().mockResolvedValue(null) };
    registerScreenerRoutes(app, { geckoTerminalService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/screener/pump-watch' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [{ ...candidates[0], news: null }] });
  });
});
```

- [ ] **Step 3: Add the env var**

Read the current file first (`backend/.env.example`), then append one line:

```
CRYPTOPANIC_API_KEY=
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && npx vitest run src/routes/screener.test.ts`
Expected: all tests pass (5 tests — 2 existing + 3 new).

- [ ] **Step 5: Verify the whole backend suite and typecheck**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/screener.ts backend/src/routes/screener.test.ts backend/.env.example
git commit -m "feat(backend): add GET /api/screener/pump-watch route"
```

---

### Task 4: Frontend types and API client

**Files:**
- Modify: `frontend/src/types/screener.ts`
- Modify: `frontend/src/lib/api/screener.ts`

**Interfaces:**
- Produces: `NewsMatch`, `PumpCandidate` types; `fetchPumpWatch(): Promise<PumpCandidate[]>`. Consumed by Task 5 (`PumpWatch.tsx`, `ScreenerPage.tsx`).

- [ ] **Step 1: Add the types**

Read the current file first (`frontend/src/types/screener.ts`), then append:

```ts
export interface NewsMatch {
  title: string;
  url: string;
  publishedAt: string;
}

export interface PumpCandidate {
  poolId: string;
  network: string;
  dex: string;
  symbol: string;
  priceChangePct6h: number;
  volumeUsd24h: number;
  poolCreatedAt: string;
  poolUrl: string;
  news: NewsMatch | null;
}
```

- [ ] **Step 2: Add the API client function**

Read the current file first (`frontend/src/lib/api/screener.ts`), then append:

```ts
export async function fetchPumpWatch(): Promise<PumpCandidate[]> {
  const response = await fetch(new URL('/api/screener/pump-watch', API_BASE_URL).toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pump watch.');
  }

  return body.items as PumpCandidate[];
}
```

Add `PumpCandidate` to the existing top-of-file import from `'../../types/screener'` (alongside `MajorsResponse`, `TrendingCoin`).

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/screener.ts frontend/src/lib/api/screener.ts
git commit -m "feat(frontend): add Pump Watch types and API client"
```

---

### Task 5: PumpWatch component and Screener page wiring

**Files:**
- Create: `frontend/src/components/PumpWatch.tsx`
- Modify: `frontend/src/pages/ScreenerPage.tsx`

**Interfaces:**
- Consumes: `PumpCandidate` (Task 4), `fetchPumpWatch` (Task 4), `Badge` (`frontend/src/components/Badge.tsx`, existing), `PillButton` (`frontend/src/components/PillButton.tsx`, existing), `formatUsdCompact`/`formatPercent` (`frontend/src/lib/format.ts`, existing).

- [ ] **Step 1: Create PumpWatch**

```tsx
import type { PumpCandidate } from '../types/screener';
import { formatPercent, formatUsdCompact } from '../lib/format';
import { Badge } from './Badge';
import { PillButton } from './PillButton';

interface PumpWatchProps {
  status: 'loading' | 'error' | 'ready';
  candidates: PumpCandidate[];
  errorMessage?: string;
  onRetry: () => void;
}

function poolAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return '<1h old';
  if (hours < 24) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

export function PumpWatch({ status, candidates, errorMessage, onRetry }: PumpWatchProps) {
  if (status === 'loading') {
    return (
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load pump watch.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        No pools currently match the pump criteria — check back soon.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {candidates.map((candidate) => (
        <a
          key={candidate.poolId}
          href={candidate.poolUrl}
          target="_blank"
          rel="noreferrer"
          className="min-w-[180px] rounded-xl border px-3 py-2 text-sm hover:opacity-80"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {candidate.symbol}
            </span>
            <span className="tabular-nums text-xs font-semibold" style={{ color: 'var(--status-good)' }}>
              +{formatPercent(candidate.priceChangePct6h)}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {candidate.network} · {formatUsdCompact(candidate.volumeUsd24h)} vol · {poolAge(candidate.poolCreatedAt)}
          </div>
          {candidate.news ? (
            <div className="mt-1.5">
              <Badge variant="accent">News</Badge>
            </div>
          ) : null}
        </a>
      ))}
    </div>
  );
}
```

Save as `frontend/src/components/PumpWatch.tsx`.

- [ ] **Step 2: Wire into ScreenerPage**

Read the current file first (`frontend/src/pages/ScreenerPage.tsx`), then replace its entire contents with:

```tsx
import { useEffect, useState } from 'react';
import { PositioningTable } from '../components/PositioningTable';
import { TrendingWatch } from '../components/TrendingWatch';
import { PumpWatch } from '../components/PumpWatch';
import { PillButton } from '../components/PillButton';
import { fetchMajors, fetchTrending, fetchPumpWatch } from '../lib/api/screener';
import type { MajorsResponse, TrendingCoin, PumpCandidate } from '../types/screener';

export function ScreenerPage() {
  const [majorsStatus, setMajorsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [majors, setMajors] = useState<MajorsResponse | null>(null);
  const [majorsError, setMajorsError] = useState<string | undefined>(undefined);
  const [majorsRequestId, setMajorsRequestId] = useState(0);

  const [trendingStatus, setTrendingStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [trendingError, setTrendingError] = useState<string | undefined>(undefined);
  const [trendingRequestId, setTrendingRequestId] = useState(0);

  const [pumpStatus, setPumpStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pumpCandidates, setPumpCandidates] = useState<PumpCandidate[]>([]);
  const [pumpError, setPumpError] = useState<string | undefined>(undefined);
  const [pumpRequestId, setPumpRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMajorsStatus('loading');
    fetchMajors()
      .then((result) => {
        if (cancelled) return;
        setMajors(result);
        setMajorsStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMajorsError(err instanceof Error ? err.message : 'Failed to load market positioning.');
        setMajorsStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [majorsRequestId]);

  useEffect(() => {
    let cancelled = false;
    setTrendingStatus('loading');
    fetchTrending()
      .then((result) => {
        if (cancelled) return;
        setTrending(result);
        setTrendingStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTrendingError(err instanceof Error ? err.message : 'Failed to load trending coins.');
        setTrendingStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [trendingRequestId]);

  useEffect(() => {
    let cancelled = false;
    setPumpStatus('loading');
    fetchPumpWatch()
      .then((result) => {
        if (cancelled) return;
        setPumpCandidates(result);
        setPumpStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPumpError(err instanceof Error ? err.message : 'Failed to load pump watch.');
        setPumpStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pumpRequestId]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Screener
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Two independent signals: current futures market positioning on major pairs, and coins
        seeing a spike in search interest. Neither panel is investment advice — see the FAQ for
        how to read each term.
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Market Positioning
        </h2>
        {majorsStatus === 'loading' ? (
          <div className="h-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ) : majorsStatus === 'error' ? (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <p style={{ color: 'var(--status-critical)' }}>{majorsError}</p>
            <PillButton onClick={() => setMajorsRequestId((n) => n + 1)} className="mt-2 text-xs">
              Retry
            </PillButton>
          </div>
        ) : (
          <PositioningTable pairs={majors!.pairs} topLongSymbols={majors!.topLongSymbols} topShortSymbols={majors!.topShortSymbols} />
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Trending / Narrative Watch
        </h2>
        <TrendingWatch
          status={trendingStatus}
          coins={trending}
          errorMessage={trendingError}
          onRetry={() => setTrendingRequestId((n) => n + 1)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Pump Watch
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Pools created in the last 72 hours with a 6h price move of 25%+ and meaningful volume —
          computed from raw on-chain data across all networks GeckoTerminal indexes, not a
          third-party trending list. A "News" tag means a recent (last 48h) article was found for
          that token; no tag doesn't mean nothing's happening, just that nothing's been published
          yet. Not investment advice — verify independently.
        </p>
        <PumpWatch
          status={pumpStatus}
          candidates={pumpCandidates}
          errorMessage={pumpError}
          onRetry={() => setPumpRequestId((n) => n + 1)}
        />
      </div>
    </div>
  );
}
```

Note: the Market Positioning and Trending/Narrative Watch sections above are reproduced
verbatim from the current file — the majors panel's retry button already uses `PillButton`
(from an earlier redesign pass), unchanged here. Only the new `pumpStatus`/`pumpCandidates`/
`pumpError`/`pumpRequestId` state, the third `useEffect`, and the new "Pump Watch" section
at the bottom are additions.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PumpWatch.tsx frontend/src/pages/ScreenerPage.tsx
git commit -m "feat(frontend): add Pump Watch panel to the Screener page"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only)

GeckoTerminal is free and keyless, so the GeckoTerminal side of this feature can be
verified live. CryptoPanic requires the user's own `CRYPTOPANIC_API_KEY` — without it,
`getRecentNewsForSymbol` always returns `null` (per Task 2's design), so the panel still
works, just with no "News" badges ever showing. Both cases should be checked.

- [ ] **Step 1: Start both servers**

Run: `cd backend && npm run dev` (background), `cd frontend && npm run dev -- --port 5180` (background).

- [ ] **Step 2: Verify the backend route directly**

Run: `curl -s http://localhost:4000/api/screener/pump-watch | head -c 2000`
Expected: either a `{"items":[...]}` array (possibly empty, if nothing currently meets the
72h/25%/$50k thresholds — that's a valid real-world outcome, not a bug) or, if
`CRYPTOPANIC_API_KEY` isn't set in `backend/.env`, items with `"news":null` throughout.
No 500 error either way.

- [ ] **Step 3: Screenshot the Screener page in the browser**

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:5180/screener', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('text=Pump Watch');
await page.waitForTimeout(2000); // let the pump-watch fetch resolve
await page.screenshot({ path: 'pump-watch-verify.png', fullPage: true });

console.log('Console errors:', errors.length ? errors : 'none');
await browser.close();
```

Run from `frontend/` (where `playwright` resolves as a dependency). Confirm: no console
errors, "Pump Watch" section renders one of its three states (loading skeleton briefly,
then either the empty-state message, an error+Retry, or a row of pill-cards) — not stuck
on the loading skeleton forever, not blank.

- [ ] **Step 4: If `CRYPTOPANIC_API_KEY` is set, verify a News badge renders**

If any candidate happens to have a recent article (real-world data, not guaranteed on any
given run), confirm its card shows the "News" badge and that clicking the card opens the
GeckoTerminal pool page in a new tab (`target="_blank"`).

- [ ] **Step 5: Clean up**

```bash
rm -f frontend/pump-watch-verify.png
```

(No commit for this task — verification only. If anything fails, go back to the relevant
task, fix, and re-verify.)
