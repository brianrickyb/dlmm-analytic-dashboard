# Pool Detail Related News Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show up to 3 recent (7-day window) CryptoPanic news articles per non-stablecoin token
on the Pool Detail page, grouped by token symbol, without blocking any of the page's existing
data (stat tiles, charts, IL calculator).

**Architecture:** Additive backend method `getRecentNewsForToken` on the existing
`cryptopanic.ts` service (never touches the existing `getRecentNewsForSymbol` used by Pump
Watch), a new `GET /api/pools/:poolAddress/news` route on the existing `pools.ts` route file,
and a new `RelatedNews` frontend component with its own independent loading/error state wired
into `PoolDetailPage.tsx`.

**Tech Stack:** Fastify 5 (backend), React 19 + TypeScript + Vite (frontend), Vitest (both).

## Global Constraints

- Extend `cryptopanic.ts` additively only — `getRecentNewsForSymbol`'s existing signature and
  behavior must not change (Pump Watch's route depends on it exactly as-is).
- `getRecentNewsForToken` must never throw — every failure path (no API key, network error,
  non-ok response, bad JSON, no results) resolves to `[]`, matching the sibling method's
  never-throws contract.
- Default `limit: 3`, default `windowHours: 168` (7 days) for `getRecentNewsForToken`.
- New route `GET /api/pools/:poolAddress/news` — only the pool lookup can fail (404 pool not
  found, 503 `MeteoraUnavailableError`); news lookups are always best-effort per token.
- Stablecoin skip list (case-insensitive symbol match): `USDC`, `USDT`, `DAI`, `BUSD`, `TUSD`,
  `USDP`, `FDUSD`.
- `RelatedNews` on the frontend has its own independent `loading`/`error`/`ready` state and
  fetch effect — it must never block or delay the stat tiles, charts, or IL calculator.
- Follow existing patterns exactly: DI factory functions (`create<X>Service(deps)`), DI route
  registration (`register<X>Routes(app, deps = {})`), three-state async page pattern
  (`'loading' | 'error' | 'ready'` + `useEffect` + `cancelled` flag + `PillButton` retry via a
  `requestId` counter).
- No new frontend component tests — matches the zero-component-test convention already
  established for every other page/panel in this app (verified via `tsc --noEmit` instead).

---

### Task 1: Extend `cryptopanic.ts` with `getRecentNewsForToken`

**Files:**
- Modify: `backend/src/services/cryptopanic.ts`
- Test: `backend/src/services/cryptopanic.test.ts`

**Interfaces:**
- Consumes: nothing new — reuses the file's existing `fetchImpl`, `now`, `apiKey`,
  `NewsMatch` type, `POSTS_URL`, `NEGATIVE_CACHE_TTL_MS` constants.
- Produces: `getRecentNewsForToken(symbol: string, options?: { limit?: number; windowHours?: number }): Promise<NewsMatch[]>`,
  added to the object returned by `createCryptoPanicService`, alongside the existing
  `getRecentNewsForSymbol`. Task 2 calls this exactly.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/services/cryptopanic.test.ts` (the file already has `FIXED_NOW`,
`hoursAgoIso`, and `fakePostsResponse` helpers defined at the top — reuse them, do not
redefine):

```ts
describe('createCryptoPanicService — getRecentNewsForToken — no API key', () => {
  it('returns an empty array without making a request', async () => {
    const fetchImpl = vi.fn();
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: undefined });

    const result = await service.getRecentNewsForToken('SOL');

    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — limit and window', () => {
  it('returns up to the default limit (3) of fresh articles within the default window (7 days)', async () => {
    const fetchImpl = fakePostsResponse([
      { title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) },
      { title: 'Article 2', url: 'https://example.com/2', publishedAt: hoursAgoIso(2) },
      { title: 'Article 3', url: 'https://example.com/3', publishedAt: hoursAgoIso(3) },
      { title: 'Article 4', url: 'https://example.com/4', publishedAt: hoursAgoIso(4) },
    ]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForToken('SOL');

    expect(result).toEqual([
      { title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) },
      { title: 'Article 2', url: 'https://example.com/2', publishedAt: hoursAgoIso(2) },
      { title: 'Article 3', url: 'https://example.com/3', publishedAt: hoursAgoIso(3) },
    ]);
  });

  it('excludes articles older than the window (default 7 days = 168h)', async () => {
    const fetchImpl = fakePostsResponse([
      { title: 'Fresh', url: 'https://example.com/fresh', publishedAt: hoursAgoIso(1) },
      { title: 'Stale', url: 'https://example.com/stale', publishedAt: hoursAgoIso(169) },
    ]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForToken('SOL');

    expect(result).toEqual([{ title: 'Fresh', url: 'https://example.com/fresh', publishedAt: hoursAgoIso(1) }]);
  });

  it('respects custom limit and windowHours options', async () => {
    const fetchImpl = fakePostsResponse([
      { title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) },
      { title: 'Article 2', url: 'https://example.com/2', publishedAt: hoursAgoIso(30) },
    ]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    const result = await service.getRecentNewsForToken('SOL', { limit: 1, windowHours: 24 });

    expect(result).toEqual([{ title: 'Article 1', url: 'https://example.com/1', publishedAt: hoursAgoIso(1) }]);
  });

  it('returns an empty array when there are no results', async () => {
    const fetchImpl = fakePostsResponse([]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    expect(await service.getRecentNewsForToken('SOL')).toEqual([]);
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — best-effort failure handling (never throws)', () => {
  it('returns an empty array when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForToken('SOL')).resolves.toEqual([]);
  });

  it('returns an empty array on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForToken('SOL')).resolves.toEqual([]);
  });

  it('returns an empty array when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await expect(service.getRecentNewsForToken('SOL')).resolves.toEqual([]);
  });
});

describe('createCryptoPanicService — getRecentNewsForToken — caching', () => {
  it('uses a cache separate from getRecentNewsForSymbol', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'SOL surges', url: 'https://example.com/sol', publishedAt: hoursAgoIso(1) }]);
    const service = createCryptoPanicService({ fetchImpl, now: () => FIXED_NOW, apiKey: 'test-key' });

    await service.getRecentNewsForSymbol('SOL');
    await service.getRecentNewsForToken('SOL');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reuses the cached result per (symbol, limit, windowHours) within the TTL', async () => {
    const fetchImpl = fakePostsResponse([{ title: 'SOL surges', url: 'https://example.com/sol', publishedAt: hoursAgoIso(1) }]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForToken('SOL');
    currentTime += 30_000;
    await service.getRecentNewsForToken('SOL');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches an empty-array result well past the ordinary TTL', async () => {
    const fetchImpl = fakePostsResponse([]);
    let currentTime = FIXED_NOW;
    const service = createCryptoPanicService({ fetchImpl, now: () => currentTime, cacheTtlMs: 90_000, apiKey: 'test-key' });

    await service.getRecentNewsForToken('SOL');
    currentTime += 90_001;
    await service.getRecentNewsForToken('SOL');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/services/cryptopanic.test.ts`
Expected: FAIL — `service.getRecentNewsForToken is not a function`

- [ ] **Step 3: Implement `getRecentNewsForToken`**

In `backend/src/services/cryptopanic.ts`, add two new module-level constants near the top
(alongside the existing `DEFAULT_CACHE_TTL_MS`/`NEGATIVE_CACHE_TTL_MS`/`FRESHNESS_WINDOW_MS`):

```ts
const DEFAULT_TOKEN_NEWS_LIMIT = 3;
const DEFAULT_TOKEN_NEWS_WINDOW_HOURS = 7 * 24;
```

Inside `createCryptoPanicService`, add a second cache map next to the existing `cache`
declaration:

```ts
const tokenCache = new Map<string, { expiresAt: number; data: NewsMatch[] }>();
```

Add the new exported method and its private fetch helper, right after the existing
`getRecentNewsForSymbol`/`fetchNews` pair:

```ts
  async function getRecentNewsForToken(
    symbol: string,
    options: { limit?: number; windowHours?: number } = {},
  ): Promise<NewsMatch[]> {
    if (!apiKey) return [];

    const limit = options.limit ?? DEFAULT_TOKEN_NEWS_LIMIT;
    const windowHours = options.windowHours ?? DEFAULT_TOKEN_NEWS_WINDOW_HOURS;
    const cacheKey = `${symbol}:${limit}:${windowHours}`;

    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const result = await fetchTokenNews(symbol, limit, windowHours);
    const ttl = result.length === 0 ? NEGATIVE_CACHE_TTL_MS : cacheTtlMs;
    tokenCache.set(cacheKey, { expiresAt: now() + ttl, data: result });
    return result;
  }

  async function fetchTokenNews(symbol: string, limit: number, windowHours: number): Promise<NewsMatch[]> {
    let response: Response;
    try {
      const url = `${POSTS_URL}?auth_token=${encodeURIComponent(apiKey!)}&currencies=${encodeURIComponent(symbol)}`;
      response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      return [];
    }
    if (!response.ok) return [];

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return [];
    }

    const results = (payload as { results?: unknown })?.results;
    if (!Array.isArray(results)) return [];

    const windowMs = windowHours * 60 * 60 * 1000;
    const matches: NewsMatch[] = [];
    for (const raw of results) {
      const item = raw as Record<string, unknown>;
      const publishedAt = typeof item.published_at === 'string' ? item.published_at : null;
      const title = typeof item.title === 'string' ? item.title : null;
      const url = typeof item.url === 'string' ? item.url : null;
      if (!publishedAt || !title || !url) continue;

      const publishedAtMs = Date.parse(publishedAt);
      if (Number.isNaN(publishedAtMs)) continue;
      if (now() - publishedAtMs > windowMs) continue;

      matches.push({ title, url, publishedAt });
      if (matches.length >= limit) break;
    }
    return matches;
  }
```

Update the final `return` statement of `createCryptoPanicService` to expose the new method:

```ts
  return { getRecentNewsForSymbol, getRecentNewsForToken };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/cryptopanic.test.ts`
Expected: PASS, all tests including the existing `getRecentNewsForSymbol` suite.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cryptopanic.ts backend/src/services/cryptopanic.test.ts
git commit -m "feat(backend): add getRecentNewsForToken to CryptoPanic service"
```

---

### Task 2: New route `GET /api/pools/:poolAddress/news`

**Files:**
- Modify: `backend/src/routes/pools.ts`
- Test: `backend/src/routes/pools.test.ts`

**Interfaces:**
- Consumes: `cryptoPanicService.getRecentNewsForToken(symbol, options?): Promise<NewsMatch[]>`
  from Task 1; `meteoraService.getPoolByAddress(address): Promise<PoolWithStats | null>`
  (already exists, returns a `Pool` with `tokenX: { symbol, ... }` / `tokenY: { symbol, ... }`).
- Produces: `GET /api/pools/:poolAddress/news` → `200 { tokens: { symbol: string; articles: NewsMatch[] }[] }`,
  `404 { error: 'Pool not found.' }`, `503 { error: 'Pool data is unavailable right now.' }`.
  Task 3's `fetchPoolNews` calls this exactly.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/routes/pools.test.ts`. The existing `fakePool` helper (top of the file)
returns tokens as `{} as any` with no `symbol` — do not change it (other tests depend on it).
Add a new helper alongside it and a new `describe` block:

```ts
function fakePoolWithTokens(poolAddress: string, tokenXSymbol: string, tokenYSymbol: string) {
  return {
    id: poolAddress,
    poolAddress,
    name: `${tokenXSymbol}-${tokenYSymbol}`,
    tokenX: { mintAddress: 'x', symbol: tokenXSymbol, name: tokenXSymbol, decimals: 9 },
    tokenY: { mintAddress: 'y', symbol: tokenYSymbol, name: tokenYSymbol, decimals: 6 },
    binStep: 20,
    baseFeeBps: 3,
    isActive: true,
    stats: { poolId: poolAddress, snapshotAt: '2026-08-10T00:00:00Z', tvlUsd: 1_000_000, volume24hUsd: 200_000, fees24hUsd: 100, feeApr24h: 36.5, currentPrice: 1.5 },
  };
}

describe('GET /api/pools/:poolAddress/news', () => {
  it('returns grouped articles for each non-stablecoin token', async () => {
    const app = Fastify();
    const pool = fakePoolWithTokens('A', 'SOL', 'JUP');
    const solArticles = [{ title: 'SOL rallies', url: 'https://example.com/sol', publishedAt: '2026-08-09T00:00:00Z' }];
    const jupArticles: { title: string; url: string; publishedAt: string }[] = [];
    const cryptoPanicService = {
      getRecentNewsForToken: vi.fn((symbol: string) => Promise.resolve(symbol === 'SOL' ? solArticles : jupArticles)),
    };
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/news' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tokens: [
        { symbol: 'SOL', articles: solArticles },
        { symbol: 'JUP', articles: jupArticles },
      ],
    });
  });

  it('skips a stablecoin token in the pool', async () => {
    const app = Fastify();
    const pool = fakePoolWithTokens('A', 'SOL', 'USDC');
    const cryptoPanicService = { getRecentNewsForToken: vi.fn().mockResolvedValue([]) };
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/news' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tokens: [{ symbol: 'SOL', articles: [] }] });
    expect(cryptoPanicService.getRecentNewsForToken).toHaveBeenCalledTimes(1);
    expect(cryptoPanicService.getRecentNewsForToken).toHaveBeenCalledWith('SOL');
  });

  it('returns an empty tokens array when both pool tokens are stablecoins', async () => {
    const app = Fastify();
    const pool = fakePoolWithTokens('A', 'USDC', 'USDT');
    const cryptoPanicService = { getRecentNewsForToken: vi.fn() };
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/news' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tokens: [] });
    expect(cryptoPanicService.getRecentNewsForToken).not.toHaveBeenCalled();
  });

  it('returns 404 when the pool is not found', async () => {
    const app = Fastify();
    const cryptoPanicService = { getRecentNewsForToken: vi.fn() };
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(null), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService, cryptoPanicService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/NOPE/news' });

    expect(response.statusCode).toBe(404);
    expect(cryptoPanicService.getRecentNewsForToken).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/pools.test.ts`
Expected: FAIL — 404/`ECONNREFUSED`-style route-not-found (the `/news` route doesn't exist yet).

- [ ] **Step 3: Implement the route**

In `backend/src/routes/pools.ts`, add a second import line right after the existing
`meteora.js` import:

```ts
import { createCryptoPanicService, type NewsMatch } from '../services/cryptopanic.js';
```

Add a new interface next to `MeteoraServiceLike`, and a module-level constant right after it:

```ts
interface CryptoPanicServiceLike {
  getRecentNewsForToken(symbol: string, options?: { limit?: number; windowHours?: number }): Promise<NewsMatch[]>;
}

const STABLECOIN_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDP', 'FDUSD']);
```

Change the `registerPoolsRoutes` signature and add the service default, right after the
existing `meteoraService` line:

```ts
export function registerPoolsRoutes(
  app: FastifyInstance,
  deps: { meteoraService?: MeteoraServiceLike; cryptoPanicService?: CryptoPanicServiceLike } = {},
): void {
  const meteoraService = deps.meteoraService ?? createMeteoraService();
  const cryptoPanicService = deps.cryptoPanicService ?? createCryptoPanicService();
```

Add the new route at the end of `registerPoolsRoutes`, after the existing
`/api/pools/:poolAddress/history` handler, before the function's closing `}`:

```ts
  app.get('/api/pools/:poolAddress/news', async (request, reply) => {
    const { poolAddress } = request.params as { poolAddress: string };
    try {
      const pool = await meteoraService.getPoolByAddress(poolAddress);
      if (!pool) {
        reply.code(404);
        return { error: 'Pool not found.' };
      }

      const symbols = [pool.tokenX.symbol, pool.tokenY.symbol].filter(
        (symbol) => !STABLECOIN_SYMBOLS.has(symbol.toUpperCase()),
      );

      const tokens = await Promise.all(
        symbols.map(async (symbol) => ({
          symbol,
          articles: await cryptoPanicService.getRecentNewsForToken(symbol),
        })),
      );

      return { tokens };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/routes/pools.test.ts`
Expected: PASS, all tests including the existing three route describe blocks.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pools.ts backend/src/routes/pools.test.ts
git commit -m "feat(backend): add GET /api/pools/:poolAddress/news route"
```

---

### Task 3: Frontend type + API client

**Files:**
- Modify: `frontend/src/types/pool.ts`
- Modify: `frontend/src/lib/api/pools.ts`

**Interfaces:**
- Consumes: `NewsMatch` type (already exists at `frontend/src/types/screener.ts`, shape
  `{ title: string; url: string; publishedAt: string }`); the route from Task 2.
- Produces: `PoolTokenNews` type (`{ symbol: string; articles: NewsMatch[] }`) exported from
  `frontend/src/types/pool.ts`; `fetchPoolNews(poolAddress: string): Promise<PoolTokenNews[]>`
  exported from `frontend/src/lib/api/pools.ts`. Tasks 4 and 5 both import these.

- [ ] **Step 1: Add the `PoolTokenNews` type**

In `frontend/src/types/pool.ts`, add an import at the top of the file and a new interface at
the bottom:

```ts
import type { NewsMatch } from './screener';
```

```ts
export interface PoolTokenNews {
  symbol: string;
  articles: NewsMatch[];
}
```

- [ ] **Step 2: Add `fetchPoolNews`**

In `frontend/src/lib/api/pools.ts`, update the top-of-file type import to include the new
type:

```ts
import type { PoolSnapshot, PoolTokenNews, PoolWithStats } from '../../types/pool';
```

Add a new exported function at the end of the file, after the existing `fetchPoolHistory`:

```ts
export async function fetchPoolNews(poolAddress: string): Promise<PoolTokenNews[]> {
  const response = await fetch(new URL(`/api/pools/${poolAddress}/news`, API_BASE_URL).toString());
  const body = await response.json();

  if (response.status === 404) {
    throw new PoolNotFoundError(typeof body?.error === 'string' ? body.error : 'Pool not found.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load related news.');
  }

  return body.tokens as PoolTokenNews[];
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (this task adds no runtime behavior to verify beyond compiling cleanly —
Task 5's manual verification exercises the real fetch call).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/pool.ts frontend/src/lib/api/pools.ts
git commit -m "feat(frontend): add PoolTokenNews type and fetchPoolNews API client"
```

---

### Task 4: `RelatedNews` component

**Files:**
- Create: `frontend/src/components/RelatedNews.tsx`

**Interfaces:**
- Consumes: `PoolTokenNews` type from Task 3 (`frontend/src/types/pool.ts`); the existing
  `PillButton` component (`frontend/src/components/PillButton.tsx`,
  `<PillButton onClick={...} className="...">label</PillButton>`).
- Produces: `RelatedNews({ status, tokens, errorMessage, onRetry }: RelatedNewsProps)` — a
  React component. Task 5 renders this with the state it owns.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/RelatedNews.tsx`:

```tsx
import type { PoolTokenNews } from '../types/pool';
import { PillButton } from './PillButton';

interface RelatedNewsProps {
  status: 'loading' | 'error' | 'ready';
  tokens: PoolTokenNews[];
  errorMessage?: string;
  onRetry: () => void;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RelatedNews({ status, tokens, errorMessage, onRetry }: RelatedNewsProps) {
  if (status === 'ready' && tokens.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
        Related news
      </div>

      {status === 'loading' ? (
        <div className="h-16 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-page)' }} />
      ) : status === 'error' ? (
        <div>
          <p className="text-sm" style={{ color: 'var(--status-critical)' }}>
            {errorMessage ?? 'Failed to load related news.'}
          </p>
          <PillButton onClick={onRetry} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div key={token.symbol} className="space-y-1.5">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                {token.symbol}
              </h3>
              {token.articles.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No recent coverage.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {token.articles.map((article) => (
                    <li
                      key={article.url}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-page)' }}
                    >
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold hover:underline"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {article.title}
                      </a>
                      <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(article.publishedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RelatedNews.tsx
git commit -m "feat(frontend): add RelatedNews component"
```

---

### Task 5: Wire `RelatedNews` into `PoolDetailPage.tsx`

**Files:**
- Modify: `frontend/src/pages/PoolDetailPage.tsx`

**Interfaces:**
- Consumes: `fetchPoolNews` and `PoolTokenNews` from Task 3; `RelatedNews` from Task 4.
- Produces: nothing further downstream — this is the final integration task.

- [ ] **Step 1: Add imports**

In `frontend/src/pages/PoolDetailPage.tsx`, add to the existing import block:

```tsx
import { RelatedNews } from '../components/RelatedNews';
```

Change the existing API-client import line from:

```tsx
import { fetchPool, fetchPoolHistory, PoolNotFoundError } from '../lib/api/pools';
```

to:

```tsx
import { fetchPool, fetchPoolHistory, fetchPoolNews, PoolNotFoundError } from '../lib/api/pools';
```

Change the existing type import line from:

```tsx
import type { PoolSnapshot, PoolWithStats } from '../types/pool';
```

to:

```tsx
import type { PoolSnapshot, PoolTokenNews, PoolWithStats } from '../types/pool';
```

- [ ] **Step 2: Add independent news state and effect**

Immediately after the existing `requestId` state line (`const [requestId, setRequestId] = useState(0);`)
inside the `PoolDetailPage` function, add:

```tsx
  const [newsStatus, setNewsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [poolNews, setPoolNews] = useState<PoolTokenNews[]>([]);
  const [newsErrorMessage, setNewsErrorMessage] = useState<string | undefined>(undefined);
  const [newsRequestId, setNewsRequestId] = useState(0);
```

Immediately after the existing `useEffect` block (the one that closes with
`}, [poolId, requestId]);`), add a second, independent effect:

```tsx
  useEffect(() => {
    if (!poolId) return;
    let cancelled = false;
    setNewsStatus('loading');

    fetchPoolNews(poolId)
      .then((result) => {
        if (cancelled) return;
        setPoolNews(result);
        setNewsStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNewsErrorMessage(err instanceof Error ? err.message : 'Failed to load related news.');
        setNewsStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [poolId, newsRequestId]);
```

This is deliberately a separate `useEffect`/state block from the existing
`pool`/`series`/`status` one — a slow or failed news fetch must never delay or block the stat
tiles, charts, or IL calculator, which only depend on the first effect.

- [ ] **Step 3: Render `RelatedNews`**

The existing `pool`/`series` loading and error branches (`status === 'loading'`,
`status === 'not-found'`, `status === 'error'`) return early and must NOT be touched — the
news section always renders independently of those, further down in the `ready` render path.

In the `ready` render path, insert `<RelatedNews />` between the closing of the
`{series.length === 0 ? (...) : (...)}` block and the `{connected ? <AddLiquidityForm /> : ...}`
block:

```tsx
      {series.length === 0 ? (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}
        >
          This pool doesn't have enough recorded history yet to show trend charts or run the IL
          calculator — check back after the daily snapshot has run a few times.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HistoryChart data={series} dataKey="tvlUsd" label="TVL" color="var(--series-blue)" />
            <HistoryChart data={series} dataKey="volume24hUsd" label="Volume (24h)" color="var(--series-violet)" />
            <HistoryChart
              data={series}
              dataKey="feeApr24h"
              label="Fee APR (est.)"
              color="var(--series-green)"
              valueFormatter={(v) => formatPercent(v)}
            />
          </div>

          <IlCalculator series={series} />
        </>
      )}

      <RelatedNews
        status={newsStatus}
        tokens={poolNews}
        errorMessage={newsErrorMessage}
        onRetry={() => setNewsRequestId((n) => n + 1)}
      />

      {connected ? (
        <AddLiquidityForm />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Connect a wallet to add liquidity (devnet only — separate from the live pool shown above).
        </p>
      )}
```

`RelatedNews` is placed outside the `series.length === 0` ternary (not inside its `else`
branch) because it does not depend on `series` at all — it must render (and be able to
load/error/retry) regardless of whether this pool has recorded TVL history yet.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `cd backend && npm run dev` (one terminal) and `cd frontend && npm run dev` (another).
Open a pool detail page (e.g. navigate from the Pools list to a real curated pool). Confirm:
- The "Related news" card appears after the IL calculator (or after the "not enough history"
  message, for a pool with short history) and before the Add Liquidity section.
- It shows a per-token loading skeleton briefly, then either articles grouped by token symbol,
  a "No recent coverage." line for a token with none, or — if the pool is a
  stablecoin/stablecoin pair — no card at all.
- If `CRYPTOPANIC_API_KEY` is unset in `backend/.env`, every token shows "No recent coverage."
  (the service returns `[]`, not an error) — confirm the page doesn't show an error state in
  this case, since a missing key is a best-effort no-op, not a failure.
- Toggle light/dark mode and confirm the card matches the existing card styling elsewhere on
  the page (border, background, text colors).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PoolDetailPage.tsx
git commit -m "feat(frontend): show related news on Pool Detail page"
```

## Verification

1. `cd backend && npm test` and `npx tsc --noEmit` — all tests pass (existing suite plus the
   new `getRecentNewsForToken` and `/news` route tests), no type errors.
2. `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — no type errors.
3. Manual verification per Task 5 Step 5, in both light and dark mode.
