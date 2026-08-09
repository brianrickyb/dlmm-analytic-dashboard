# Live Meteora DLMM Pool Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Pools page's mock data with live Meteora DLMM data — a curated top-50-by-TVL pool list, per-pool history (price + volume + fees from Meteora, TVL from a small self-maintained daily snapshot), and the IL calculator running on real numbers.

**Architecture:** A new stateless backend service (`meteora.ts`) follows the exact factory/cache/error-class pattern every other integration in this backend uses (`bybit.ts`/`coingecko.ts`/`geckoterminal.ts`/`cryptopanic.ts`) for the list and detail endpoints. The one piece of new *stateful* infrastructure is a small daily TVL snapshot worker (a separate entrypoint, not an in-process timer — Meteora exposes historical price/volume but not historical TVL). Frontend converts `PoolListPage`/`PoolDetailPage` from synchronous mock-array reads to the same async loading/error pattern already used by every other data-driven page in this app.

## Global Constraints

- Meteora pools-list endpoint: `GET https://dlmm.datapi.meteora.ag/pools`, no auth, query params `sort_by`, `filter_by`, `page`, `page_size`. Verified live during design — response shape and field names below are real, not assumed.
- Curation (exact, tunable constants): `sort_by=tvl:desc`, `filter_by=is_blacklisted=false && tvl>=100000 && volume_24h>=10000`, `page_size=100`, client-side capped to **top 50 by TVL** after parsing (buffer above 50 absorbs any rows dropped for malformed data).
- Field mapping gotchas (verified live, do not deviate):
  - `pool_config.base_fee_pct` is a **percentage** — `baseFeeBps = base_fee_pct * 100`.
  - Do **not** use Meteora's `apr`/`apy` fields — their naming is misleading (`apr` is the raw un-annualized 24h fee/TVL ratio, `apy` is an annualized multiplier, neither is "annualized percent"). Compute `feeApr24h` ourselves: `(fees24h / tvl) * 365 * 100`, using the unambiguous `fees["24h"]` and `tvl` fields.
  - `created_at` is a Unix epoch **in milliseconds** (number).
  - Map `current_price` (the pool's own exchange ratio, tokenX per tokenY) into `currentPrice` — **not** `token_x.price`/`token_y.price` (those are USD prices; using them breaks `il.ts`/`yield.ts`'s ratio math for non-USD-quoted pairs).
  - There is no `active_bin_id` field on this REST API — `PoolLatestStats.activeBinId`/`PoolSnapshot.activeBinId` become optional (`number | null`, omitted in practice); nothing in the frontend renders or computes with this field today.
- Meteora per-pool history endpoints (verified live): `GET /pools/{address}/ohlcv?resolution=1d&limit=N` → `{ data: [{ timestamp_str: "2026-08-09T00:00:00+00:00", close: number, ... }] }` (price only — use `close`). `GET /pools/{address}/volume/history?resolution=1d&limit=N` → `{ data: [{ timestamp_str, volume: number, fees: number, ... }] }` (volume + fees — this endpoint, not OHLCV's own `volume` field, is the source of truth for both).
- TVL has **no** historical endpoint on Meteora's API. A day is only included in `getPoolHistory`'s returned `PoolSnapshot[]` if price (OHLCV), volume/fees (volume-history), **and** our own `pool_tvl_daily` table all have that day — the series is deliberately shorter than the requested window until the worker has been running long enough, rather than fabricating/flat-filling missing TVL. `PoolSnapshot.tvlUsd` stays a required `number` (no downstream contract change needed in `frontend/src/lib/yield.ts`, which assumes one fully-populated entry per day).
- Every new backend file follows the exact DI/caching shape already established: `create<X>Service(deps: { fetchImpl?, now?, cacheTtlMs? })`, `fetchImpl` defaults to global `fetch`, `now` defaults to `Date.now`, `AbortSignal.timeout(8000)` on every external call, an `<X>UnavailableError` class thrown only on primary-fetch failure (network/non-ok/bad-JSON/missing-fields), a single malformed row skipped (not fatal) rather than failing the whole batch.
- `Pool.id` and `Pool.poolAddress` both hold the same real mainnet address — no route/param renaming (`/pools/:poolId` keeps working).
- `AddLiquidityForm.tsx` stays devnet-only and fully decoupled from the (mainnet) Pools page — it no longer receives a `poolAddress` prop; its input field defaults to empty and stays manually-editable.
- Every response an authenticated Supabase read/write in this plan (the TVL worker, and `getPoolHistory`'s TVL read) uses the existing `backend/src/lib/supabaseAdmin.ts` `createSupabaseAdmin(url, secretKey)` helper — do not add a new Supabase client construction path.
- Testing matches this project's convention throughout: backend services/routes/worker get unit + injected-dependency tests (fake `fetchImpl`, fake Supabase client); frontend gets zero new component tests (matches every other page in this app), only a new case added to the existing `frontend/src/lib/yield.test.ts`.

---

### Task 1: Type updates

**Files:**
- Modify: `frontend/src/types/pool.ts`

**Interfaces:**
- Produces: `activeBinId?: number | null` on `PoolLatestStats` and `PoolSnapshot` (was required `number`). Consumed by Task 3 (backend field mapping omits it) and Task 8/9 (frontend pages, which already never read this field).

- [ ] **Step 1: Make `activeBinId` optional in both interfaces**

Read the current file first (`frontend/src/types/pool.ts`). Change:
```ts
export interface PoolLatestStats {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  activeBinId: number;
  currentPrice: number;
}
```
to:
```ts
export interface PoolLatestStats {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  activeBinId?: number | null;
  currentPrice: number;
}
```
And identically for `PoolSnapshot`'s `activeBinId: number;` line. Every other line in the file (including `Strategy`, `Token`, `Pool`, `PoolWithStats`) stays exactly as it is today.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (this file has no other consumers that construct these objects yet — the mock data still populates `activeBinId` with a number, which remains valid under `number | null | undefined`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/pool.ts
git commit -m "feat(frontend): make PoolLatestStats/PoolSnapshot activeBinId optional"
```

---

### Task 2: Database schema addition

**Files:**
- Modify: `db/schema.sql`

**Interfaces:**
- Produces: table `pool_tvl_daily(pool_address TEXT, day DATE, tvl_usd NUMERIC, captured_at TIMESTAMPTZ, PRIMARY KEY(pool_address, day))`. Consumed by Task 4 (worker writes) and Task 3 (service reads).

- [ ] **Step 1: Append the new table**

Read the current file first (`db/schema.sql`), then append this block at the end (after the existing trailing `NOTE:` comment about the removed `positions` table — do not modify anything above it):

```sql

-- =========================================================
-- pool_tvl_daily: minimal daily TVL snapshot, filled by a scheduled worker
-- (backend/src/worker/snapshotPoolTvl.ts). Meteora's public API gives current
-- TVL only (no historical TVL endpoint) but DOES give historical price
-- (OHLCV) and volume/fees directly — this table exists solely to cover that
-- one remaining gap, so it's deliberately much smaller than the
-- pool_snapshots design above (no partitioning needed at this scale: ~50
-- curated pools x one row/day).
-- =========================================================
CREATE TABLE pool_tvl_daily (
  pool_address  TEXT NOT NULL,
  day           DATE NOT NULL,
  tvl_usd       NUMERIC(24, 6) NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_address, day)
);
```

- [ ] **Step 2: Commit**

```bash
git add db/schema.sql
git commit -m "feat(db): add pool_tvl_daily table for the Meteora TVL snapshot worker"
```

Note in your report: this SQL needs to be run manually by the user in the Supabase SQL Editor against their project (same as every prior schema change in this project) — it is not applied automatically by any migration tooling. Mention this in your final report but do not attempt to run it yourself.

---

### Task 3: Meteora backend service

**Files:**
- Create: `backend/src/services/meteora.ts`
- Test: `backend/src/services/meteora.test.ts`

**Interfaces:**
- Produces: `Token`, `Pool`, `PoolLatestStats`, `PoolWithStats`, `PoolSnapshot` interfaces (backend's own copies, matching `frontend/src/types/pool.ts`'s shape field-for-field but NOT imported from it — this backend has no shared-types package, every existing service defines its own response types this way). `MeteoraUnavailableError` class. `createMeteoraService(deps?): { getPools(): Promise<PoolWithStats[]>; getPoolByAddress(address: string): Promise<PoolWithStats | null>; getPoolHistory(address: string, days: number): Promise<PoolSnapshot[]> }`. Consumed by Task 4 (worker's `getPools()`) and Task 5 (routes, all three methods).

- [ ] **Step 1: Write the service**

```ts
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Token {
  mintAddress: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface Pool {
  id: string;
  poolAddress: string;
  name: string;
  tokenX: Token;
  tokenY: Token;
  binStep: number;
  baseFeeBps: number;
  isActive: boolean;
}

export interface PoolLatestStats {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  currentPrice: number;
}

export interface PoolWithStats extends Pool {
  stats: PoolLatestStats;
}

export interface PoolSnapshot {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  currentPrice: number;
}

export class MeteoraUnavailableError extends Error {}

export interface MeteoraServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  historyCacheTtlMs?: number;
  supabaseAdmin?: SupabaseClient;
}

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const METEORA_BASE_URL = 'https://dlmm.datapi.meteora.ag';
const MIN_TVL_USD = 100_000;
const MIN_VOLUME_24H_USD = 10_000;
const CURATED_POOL_COUNT = 50;
const PAGE_SIZE = 100;

function parseToken(raw: unknown): Token | null {
  const t = raw as Record<string, unknown> | undefined;
  if (typeof t?.address !== 'string' || typeof t?.symbol !== 'string' || typeof t?.name !== 'string' || typeof t?.decimals !== 'number') {
    return null;
  }
  return { mintAddress: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals };
}

function parsePoolWithStats(raw: unknown): PoolWithStats | null {
  const p = raw as Record<string, unknown>;
  const address = p.address;
  const name = p.name;
  const createdAt = p.created_at;
  const tokenX = parseToken(p.token_x);
  const tokenY = parseToken(p.token_y);
  const poolConfig = p.pool_config as Record<string, unknown> | undefined;
  const binStep = poolConfig?.bin_step;
  const baseFeePct = poolConfig?.base_fee_pct;
  const tvl = Number(p.tvl);
  const currentPrice = Number(p.current_price);
  const volume = p.volume as Record<string, unknown> | undefined;
  const fees = p.fees as Record<string, unknown> | undefined;
  const volume24h = Number(volume?.['24h']);
  const fees24h = Number(fees?.['24h']);
  const isBlacklisted = p.is_blacklisted;

  if (
    typeof address !== 'string' ||
    typeof name !== 'string' ||
    typeof createdAt !== 'number' ||
    !tokenX ||
    !tokenY ||
    typeof binStep !== 'number' ||
    typeof baseFeePct !== 'number' ||
    Number.isNaN(tvl) ||
    Number.isNaN(currentPrice) ||
    Number.isNaN(volume24h) ||
    Number.isNaN(fees24h) ||
    typeof isBlacklisted !== 'boolean'
  ) {
    return null;
  }

  const feeApr24h = tvl > 0 ? (fees24h / tvl) * 365 * 100 : 0;

  return {
    id: address,
    poolAddress: address,
    name,
    tokenX,
    tokenY,
    binStep,
    baseFeeBps: baseFeePct * 100,
    isActive: !isBlacklisted,
    stats: {
      poolId: address,
      snapshotAt: new Date().toISOString(),
      tvlUsd: tvl,
      volume24hUsd: volume24h,
      fees24hUsd: fees24h,
      feeApr24h,
      currentPrice,
    },
  };
}

async function fetchPoolsRaw(fetchImpl: typeof fetch): Promise<unknown[]> {
  const params = new URLSearchParams({
    sort_by: 'tvl:desc',
    filter_by: `is_blacklisted=false && tvl>=${MIN_TVL_USD} && volume_24h>=${MIN_VOLUME_24H_USD}`,
    page: '1',
    page_size: String(PAGE_SIZE),
  });

  let response: Response;
  try {
    response = await fetchImpl(`${METEORA_BASE_URL}/pools?${params}`, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new MeteoraUnavailableError('Failed to reach Meteora pools endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new MeteoraUnavailableError(`Meteora pools endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new MeteoraUnavailableError('Meteora pools response was not valid JSON', { cause: err });
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new MeteoraUnavailableError('Meteora pools response missing expected data field');
  }
  return data;
}

interface DayPoint<T> {
  day: string;
  value: T;
}

async function fetchOhlcv(fetchImpl: typeof fetch, address: string, days: number): Promise<DayPoint<number>[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${METEORA_BASE_URL}/pools/${address}/ohlcv?resolution=1d&limit=${days}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new MeteoraUnavailableError('Failed to reach Meteora OHLCV endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new MeteoraUnavailableError(`Meteora OHLCV endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new MeteoraUnavailableError('Meteora OHLCV response was not valid JSON', { cause: err });
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new MeteoraUnavailableError('Meteora OHLCV response missing expected data field');
  }

  const points: DayPoint<number>[] = [];
  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    const timestampStr = item.timestamp_str;
    const close = Number(item.close);
    if (typeof timestampStr !== 'string' || Number.isNaN(close)) continue;
    points.push({ day: timestampStr.slice(0, 10), value: close });
  }
  return points;
}

interface VolumeFeesDay {
  volume: number;
  fees: number;
}

async function fetchVolumeHistory(fetchImpl: typeof fetch, address: string, days: number): Promise<DayPoint<VolumeFeesDay>[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${METEORA_BASE_URL}/pools/${address}/volume/history?resolution=1d&limit=${days}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new MeteoraUnavailableError('Failed to reach Meteora volume-history endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new MeteoraUnavailableError(`Meteora volume-history endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new MeteoraUnavailableError('Meteora volume-history response was not valid JSON', { cause: err });
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new MeteoraUnavailableError('Meteora volume-history response missing expected data field');
  }

  const points: DayPoint<VolumeFeesDay>[] = [];
  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    const timestampStr = item.timestamp_str;
    const volume = Number(item.volume);
    const fees = Number(item.fees);
    if (typeof timestampStr !== 'string' || Number.isNaN(volume) || Number.isNaN(fees)) continue;
    points.push({ day: timestampStr.slice(0, 10), value: { volume, fees } });
  }
  return points;
}

async function fetchTvlRows(
  supabaseAdmin: SupabaseClient,
  address: string,
  days: number,
  now: () => number,
): Promise<DayPoint<number>[]> {
  const since = new Date(now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin.from('pool_tvl_daily').select('day, tvl_usd').eq('pool_address', address).gte('day', since);
  if (error || !data) return [];

  const points: DayPoint<number>[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const day = row.day;
    const tvlUsd = Number(row.tvl_usd);
    if (typeof day !== 'string' || Number.isNaN(tvlUsd)) continue;
    points.push({ day: day.slice(0, 10), value: tvlUsd });
  }
  return points;
}

export function createMeteoraService(deps: MeteoraServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const historyCacheTtlMs = deps.historyCacheTtlMs ?? DEFAULT_HISTORY_CACHE_TTL_MS;
  const supabaseAdmin =
    deps.supabaseAdmin ??
    (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
      ? createSupabaseAdmin(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
      : null);

  let poolsCache: { expiresAt: number; data: PoolWithStats[] } | null = null;
  const historyCache = new Map<string, { expiresAt: number; data: PoolSnapshot[] }>();

  async function getPools(): Promise<PoolWithStats[]> {
    if (poolsCache && poolsCache.expiresAt > now()) {
      return poolsCache.data;
    }

    const raw = await fetchPoolsRaw(fetchImpl);
    const pools = raw
      .map(parsePoolWithStats)
      .filter((p): p is PoolWithStats => p !== null)
      .sort((a, b) => b.stats.tvlUsd - a.stats.tvlUsd)
      .slice(0, CURATED_POOL_COUNT);

    poolsCache = { expiresAt: now() + cacheTtlMs, data: pools };
    return pools;
  }

  async function getPoolByAddress(address: string): Promise<PoolWithStats | null> {
    const pools = await getPools();
    return pools.find((p) => p.poolAddress === address) ?? null;
  }

  async function getPoolHistory(address: string, days: number): Promise<PoolSnapshot[]> {
    const cacheKey = `${address}:${days}`;
    const cached = historyCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const [ohlcv, volumeHistory, tvlRows] = await Promise.all([
      fetchOhlcv(fetchImpl, address, days),
      fetchVolumeHistory(fetchImpl, address, days),
      supabaseAdmin ? fetchTvlRows(supabaseAdmin, address, days, now) : Promise.resolve([]),
    ]);

    const priceByDay = new Map(ohlcv.map((p) => [p.day, p.value]));
    const volumeByDay = new Map(volumeHistory.map((p) => [p.day, p.value]));
    const tvlByDay = new Map(tvlRows.map((p) => [p.day, p.value]));

    const coveredDays = [...priceByDay.keys()].filter((day) => volumeByDay.has(day) && tvlByDay.has(day)).sort();

    const snapshots: PoolSnapshot[] = coveredDays.map((day) => {
      const currentPrice = priceByDay.get(day)!;
      const { volume, fees } = volumeByDay.get(day)!;
      const tvlUsd = tvlByDay.get(day)!;
      const feeApr24h = tvlUsd > 0 ? (fees / tvlUsd) * 365 * 100 : 0;

      return {
        poolId: address,
        snapshotAt: `${day}T00:00:00.000Z`,
        tvlUsd,
        volume24hUsd: volume,
        fees24hUsd: fees,
        feeApr24h,
        currentPrice,
      };
    });

    historyCache.set(cacheKey, { expiresAt: now() + historyCacheTtlMs, data: snapshots });
    return snapshots;
  }

  return { getPools, getPoolByAddress, getPoolHistory };
}
```

Save as `backend/src/services/meteora.ts`.

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMeteoraService, MeteoraUnavailableError } from './meteora.js';

function buildRawPool(overrides: {
  address?: string;
  name?: string;
  symbolX?: string;
  symbolY?: string;
  tvl?: number;
  volume24h?: number;
  fees24h?: number;
  basFeePct?: number;
  isBlacklisted?: boolean;
}) {
  return {
    address: overrides.address ?? 'ADDR1',
    name: overrides.name ?? 'FOO-BAR',
    created_at: 1783657634000,
    is_blacklisted: overrides.isBlacklisted ?? false,
    token_x: { address: 'MINTX', name: 'Foo', symbol: overrides.symbolX ?? 'FOO', decimals: 6 },
    token_y: { address: 'MINTY', name: 'Bar', symbol: overrides.symbolY ?? 'BAR', decimals: 6 },
    tvl: overrides.tvl ?? 1_000_000,
    current_price: 1.5,
    pool_config: { bin_step: 20, base_fee_pct: overrides.basFeePct ?? 0.03 },
    volume: { '24h': overrides.volume24h ?? 200_000 },
    fees: { '24h': overrides.fees24h ?? 100 },
  };
}

function fakeFetchPools(pools: unknown[]) {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: pools }) }) as Response);
}

function fakeSupabaseAdmin(tvlRows: { pool_address: string; day: string; tvl_usd: number }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, address: string) => ({
          gte: (_col2: string, since: string) => {
            const data = tvlRows.filter((r) => r.pool_address === address && r.day >= since);
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
  } as any;
}

describe('createMeteoraService — getPools field mapping', () => {
  it('maps a well-formed raw pool into PoolWithStats', async () => {
    const fetchImpl = fakeFetchPools([buildRawPool({ tvl: 1_000_000, fees24h: 1000, basFeePct: 0.03 })]);
    const service = createMeteoraService({ fetchImpl, now: () => 1_700_000_000_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    const pools = await service.getPools();

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      id: 'ADDR1',
      poolAddress: 'ADDR1',
      name: 'FOO-BAR',
      binStep: 20,
      baseFeeBps: 3, // 0.03% * 100
      isActive: true,
    });
    // feeApr24h = (1000/1_000_000)*365*100 = 36.5
    expect(pools[0].stats.feeApr24h).toBeCloseTo(36.5, 6);
    expect(pools[0].stats.currentPrice).toBe(1.5);
  });

  it('skips a malformed pool row instead of failing the whole batch', async () => {
    const malformed = { address: 'BAD', name: 'Bad Pool' }; // missing everything else
    const fetchImpl = fakeFetchPools([buildRawPool({ address: 'GOOD' }), malformed]);
    const service = createMeteoraService({ fetchImpl, now: () => 1_700_000_000_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    const pools = await service.getPools();

    expect(pools).toHaveLength(1);
    expect(pools[0].poolAddress).toBe('GOOD');
  });

  it('sorts by TVL descending and caps at 50', async () => {
    const raw = Array.from({ length: 60 }, (_, i) => buildRawPool({ address: `ADDR${i}`, tvl: 1000 + i }));
    const fetchImpl = fakeFetchPools(raw);
    const service = createMeteoraService({ fetchImpl, now: () => 1_700_000_000_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    const pools = await service.getPools();

    expect(pools).toHaveLength(50);
    expect(pools[0].poolAddress).toBe('ADDR59'); // highest tvl (1000+59)
    expect(pools[0].stats.tvlUsd).toBe(1059);
  });
});

describe('createMeteoraService — getPools total failure', () => {
  it('throws MeteoraUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createMeteoraService({ fetchImpl, supabaseAdmin: fakeSupabaseAdmin([]) });

    await expect(service.getPools()).rejects.toBeInstanceOf(MeteoraUnavailableError);
  });

  it('throws MeteoraUnavailableError on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    const service = createMeteoraService({ fetchImpl, supabaseAdmin: fakeSupabaseAdmin([]) });

    await expect(service.getPools()).rejects.toBeInstanceOf(MeteoraUnavailableError);
  });
});

describe('createMeteoraService — getPools caching', () => {
  it('reuses the cached result within the TTL', async () => {
    const fetchImpl = fakeFetchPools([buildRawPool({})]);
    let currentTime = 1_700_000_000_000;
    const service = createMeteoraService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    await service.getPools();
    currentTime += 30_000;
    await service.getPools();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = fakeFetchPools([buildRawPool({})]);
    let currentTime = 1_700_000_000_000;
    const service = createMeteoraService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    await service.getPools();
    currentTime += 60_001;
    await service.getPools();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('createMeteoraService — getPoolHistory merge logic', () => {
  function fakeFetchHistory(opts: {
    ohlcv: { timestamp_str: string; close: number }[];
    volumeHistory: { timestamp_str: string; volume: number; fees: number }[];
  }) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/ohlcv')) {
        return { ok: true, status: 200, json: async () => ({ data: opts.ohlcv }) } as Response;
      }
      if (url.includes('/volume/history')) {
        return { ok: true, status: 200, json: async () => ({ data: opts.volumeHistory }) } as Response;
      }
      throw new Error(`unexpected URL in test: ${url}`);
    });
  }

  it('only includes days present in price, volume, AND our own TVL table', async () => {
    const fetchImpl = fakeFetchHistory({
      ohlcv: [
        { timestamp_str: '2026-08-01T00:00:00+00:00', close: 10 },
        { timestamp_str: '2026-08-02T00:00:00+00:00', close: 11 },
        { timestamp_str: '2026-08-03T00:00:00+00:00', close: 12 },
      ],
      volumeHistory: [
        { timestamp_str: '2026-08-01T00:00:00+00:00', volume: 1000, fees: 5 },
        { timestamp_str: '2026-08-02T00:00:00+00:00', volume: 2000, fees: 6 },
        { timestamp_str: '2026-08-03T00:00:00+00:00', volume: 3000, fees: 7 },
      ],
    });
    // TVL only exists for 08-02 and 08-03 — 08-01 should be excluded from the result.
    const supabaseAdmin = fakeSupabaseAdmin([
      { pool_address: 'ADDR1', day: '2026-08-02', tvl_usd: 500_000 },
      { pool_address: 'ADDR1', day: '2026-08-03', tvl_usd: 600_000 },
    ]);
    const service = createMeteoraService({ fetchImpl, now: () => Date.parse('2026-08-10T00:00:00Z'), supabaseAdmin });

    const snapshots = await service.getPoolHistory('ADDR1', 90);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ snapshotAt: '2026-08-02T00:00:00.000Z', tvlUsd: 500_000, currentPrice: 11, volume24hUsd: 2000, fees24hUsd: 6 });
    expect(snapshots[1]).toMatchObject({ snapshotAt: '2026-08-03T00:00:00.000Z', tvlUsd: 600_000, currentPrice: 12, volume24hUsd: 3000, fees24hUsd: 7 });
    // feeApr24h for 08-02: (6/500_000)*365*100
    expect(snapshots[0].feeApr24h).toBeCloseTo((6 / 500_000) * 365 * 100, 6);
  });

  it('returns an empty array when there is no TVL history yet for a pool', async () => {
    const fetchImpl = fakeFetchHistory({
      ohlcv: [{ timestamp_str: '2026-08-09T00:00:00+00:00', close: 10 }],
      volumeHistory: [{ timestamp_str: '2026-08-09T00:00:00+00:00', volume: 1000, fees: 5 }],
    });
    const supabaseAdmin = fakeSupabaseAdmin([]); // no rows for this pool at all
    const service = createMeteoraService({ fetchImpl, now: () => Date.parse('2026-08-10T00:00:00Z'), supabaseAdmin });

    const snapshots = await service.getPoolHistory('ADDR1', 90);

    expect(snapshots).toEqual([]);
  });

  it('caches the merged result per address+days key', async () => {
    const fetchImpl = fakeFetchHistory({ ohlcv: [], volumeHistory: [] });
    let currentTime = Date.parse('2026-08-10T00:00:00Z');
    const service = createMeteoraService({ fetchImpl, now: () => currentTime, historyCacheTtlMs: 300_000, supabaseAdmin: fakeSupabaseAdmin([]) });

    await service.getPoolHistory('ADDR1', 90);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    currentTime += 100_000;
    await service.getPoolHistory('ADDR1', 90);

    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });
});
```

Save as `backend/src/services/meteora.test.ts`.

- [ ] **Step 3: Run the tests**

Run: `cd backend && npx vitest run src/services/meteora.test.ts`
Expected: all tests pass (12 tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/meteora.ts backend/src/services/meteora.test.ts
git commit -m "feat(backend): add Meteora pools/history service"
```

---

### Task 4: TVL snapshot worker

**Files:**
- Create: `backend/src/worker/snapshotPoolTvl.ts`
- Test: `backend/src/worker/snapshotPoolTvl.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `createMeteoraService`, `PoolWithStats` (Task 3); `createSupabaseAdmin` (`backend/src/lib/supabaseAdmin.ts`, existing).
- Produces: `runSnapshotPoolTvl(deps: { meteoraService, supabaseAdmin }): Promise<{ succeeded: number; failed: number }>` — the testable core. A guarded `main()` at the bottom only runs when this file is the direct entrypoint (not when imported for tests) — see Step 1's `import.meta.url` guard, this is required, not optional: without it, importing this module for testing would execute `main()` and call `process.exit()`, killing the test run (this exact class of bug was found and fixed once already in this project's `server.ts`).

- [ ] **Step 1: Write the worker**

```ts
import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMeteoraService, type PoolWithStats } from '../services/meteora.js';
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';

export interface SnapshotResult {
  succeeded: number;
  failed: number;
}

interface MeteoraServiceLike {
  getPools(): Promise<PoolWithStats[]>;
}

export async function runSnapshotPoolTvl(deps: {
  meteoraService: MeteoraServiceLike;
  supabaseAdmin: SupabaseClient;
  now?: () => number;
}): Promise<SnapshotResult> {
  const { meteoraService, supabaseAdmin, now = Date.now } = deps;
  const pools = await meteoraService.getPools();
  const today = new Date(now()).toISOString().slice(0, 10);

  let succeeded = 0;
  let failed = 0;

  for (const pool of pools) {
    const { error } = await supabaseAdmin
      .from('pool_tvl_daily')
      .upsert({ pool_address: pool.poolAddress, day: today, tvl_usd: pool.stats.tvlUsd }, { onConflict: 'pool_address,day' });

    if (error) {
      failed += 1;
      console.error(`Failed to snapshot TVL for ${pool.poolAddress}:`, error.message);
    } else {
      succeeded += 1;
    }
  }

  return { succeeded, failed };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('Missing SUPABASE_URL/SUPABASE_SECRET_KEY — cannot run the TVL snapshot worker.');
    process.exit(1);
  }

  const result = await runSnapshotPoolTvl({
    meteoraService: createMeteoraService(),
    supabaseAdmin: createSupabaseAdmin(url, secretKey),
  });

  console.log(`TVL snapshot done: ${result.succeeded} succeeded, ${result.failed} failed.`);
  process.exit(result.failed > 0 && result.succeeded === 0 ? 1 : 0);
}

// Only run when this file is executed directly (`tsx src/worker/snapshotPoolTvl.ts`),
// never when imported — importing it for tests must not trigger process.exit().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

Save as `backend/src/worker/snapshotPoolTvl.ts`.

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { runSnapshotPoolTvl } from './snapshotPoolTvl.js';

function fakePool(poolAddress: string, tvlUsd: number) {
  return { id: poolAddress, poolAddress, name: 'X', tokenX: {} as any, tokenY: {} as any, binStep: 1, baseFeeBps: 1, isActive: true, stats: { poolId: poolAddress, snapshotAt: '', tvlUsd, volume24hUsd: 0, fees24hUsd: 0, feeApr24h: 0, currentPrice: 1 } };
}

function fakeSupabaseAdmin(upsertResults: Record<string, { error: { message: string } | null }>) {
  const upsert = vi.fn(async (row: { pool_address: string }) => upsertResults[row.pool_address] ?? { error: null });
  return { from: () => ({ upsert }), _upsert: upsert } as any;
}

describe('runSnapshotPoolTvl', () => {
  it('upserts one row per pool and reports success counts', async () => {
    const meteoraService = { getPools: vi.fn().mockResolvedValue([fakePool('A', 100), fakePool('B', 200)]) };
    const supabaseAdmin = fakeSupabaseAdmin({});

    const result = await runSnapshotPoolTvl({ meteoraService, supabaseAdmin });

    expect(result).toEqual({ succeeded: 2, failed: 0 });
    expect(supabaseAdmin._upsert).toHaveBeenCalledTimes(2);
    expect(supabaseAdmin._upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pool_address: 'A', tvl_usd: 100 }),
      { onConflict: 'pool_address,day' },
    );
  });

  it('continues past one pool failing and still commits the rest', async () => {
    const meteoraService = { getPools: vi.fn().mockResolvedValue([fakePool('A', 100), fakePool('B', 200), fakePool('C', 300)]) };
    const supabaseAdmin = fakeSupabaseAdmin({ B: { error: { message: 'db down' } } });

    const result = await runSnapshotPoolTvl({ meteoraService, supabaseAdmin });

    expect(result).toEqual({ succeeded: 2, failed: 1 });
  });

  it('uses the injected clock\'s date (UTC, YYYY-MM-DD) for every row in the same run', async () => {
    const meteoraService = { getPools: vi.fn().mockResolvedValue([fakePool('A', 100)]) };
    const supabaseAdmin = fakeSupabaseAdmin({});

    await runSnapshotPoolTvl({ meteoraService, supabaseAdmin, now: () => Date.parse('2026-08-10T23:00:00Z') });

    expect(supabaseAdmin._upsert).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-08-10' }), expect.anything());
  });
});
```

Save as `backend/src/worker/snapshotPoolTvl.test.ts`.

- [ ] **Step 3: Add the npm script**

Read the current file first (`backend/package.json`), then add one line to the `"scripts"` object (alongside `"dev"`, `"build"`, `"start"`, `"test"`):
```json
    "snapshot:tvl": "tsx --env-file-if-exists=.env src/worker/snapshotPoolTvl.ts"
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && npx vitest run src/worker/snapshotPoolTvl.test.ts`
Expected: all tests pass (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/worker/snapshotPoolTvl.ts backend/src/worker/snapshotPoolTvl.test.ts backend/package.json
git commit -m "feat(backend): add TVL snapshot worker"
```

---

### Task 5: Pools routes

**Files:**
- Create: `backend/src/routes/pools.ts`
- Test: `backend/src/routes/pools.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `createMeteoraService`, `MeteoraUnavailableError`, `PoolWithStats`, `PoolSnapshot` (Task 3).
- Produces: routes `GET /api/pools`, `GET /api/pools/:poolAddress`, `GET /api/pools/:poolAddress/history`. Consumed by Task 6 (frontend API client).

- [ ] **Step 1: Write the routes**

```ts
import type { FastifyInstance } from 'fastify';
import { createMeteoraService, MeteoraUnavailableError, type PoolWithStats, type PoolSnapshot } from '../services/meteora.js';

interface MeteoraServiceLike {
  getPools(): Promise<PoolWithStats[]>;
  getPoolByAddress(address: string): Promise<PoolWithStats | null>;
  getPoolHistory(address: string, days: number): Promise<PoolSnapshot[]>;
}

export function registerPoolsRoutes(app: FastifyInstance, deps: { meteoraService?: MeteoraServiceLike } = {}): void {
  const meteoraService = deps.meteoraService ?? createMeteoraService();

  app.get('/api/pools', async (_request, reply) => {
    try {
      const pools = await meteoraService.getPools();
      return { pools };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });

  app.get('/api/pools/:poolAddress', async (request, reply) => {
    const { poolAddress } = request.params as { poolAddress: string };
    try {
      const pool = await meteoraService.getPoolByAddress(poolAddress);
      if (!pool) {
        reply.code(404);
        return { error: 'Pool not found.' };
      }
      return { pool };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });

  app.get('/api/pools/:poolAddress/history', async (request, reply) => {
    const { poolAddress } = request.params as { poolAddress: string };
    const { days: daysParam } = request.query as { days?: string };
    const days = daysParam ? Number(daysParam) : 90;

    if (!Number.isInteger(days) || days <= 0 || days > 90) {
      reply.code(400);
      return { error: 'days must be an integer between 1 and 90.' };
    }

    try {
      const pool = await meteoraService.getPoolByAddress(poolAddress);
      if (!pool) {
        reply.code(404);
        return { error: 'Pool not found.' };
      }
      const snapshots = await meteoraService.getPoolHistory(poolAddress, days);
      return { snapshots };
    } catch (err) {
      if (err instanceof MeteoraUnavailableError) {
        reply.code(503);
        return { error: 'Pool data is unavailable right now.' };
      }
      throw err;
    }
  });
}
```

Save as `backend/src/routes/pools.ts`.

- [ ] **Step 2: Write the tests**

```ts
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerPoolsRoutes } from './pools.js';
import { MeteoraUnavailableError } from '../services/meteora.js';

function fakePool(poolAddress: string) {
  return { id: poolAddress, poolAddress, name: 'FOO-BAR', tokenX: {} as any, tokenY: {} as any, binStep: 20, baseFeeBps: 3, isActive: true, stats: { poolId: poolAddress, snapshotAt: '2026-08-10T00:00:00Z', tvlUsd: 1_000_000, volume24hUsd: 200_000, fees24hUsd: 100, feeApr24h: 36.5, currentPrice: 1.5 } };
}

describe('GET /api/pools', () => {
  it('returns the curated pool list on success', async () => {
    const app = Fastify();
    const pools = [fakePool('A')];
    const meteoraService = { getPools: vi.fn().mockResolvedValue(pools), getPoolByAddress: vi.fn(), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pools });
  });

  it('returns 503 when Meteora is unavailable', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn().mockRejectedValue(new MeteoraUnavailableError('down')), getPoolByAddress: vi.fn(), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Pool data is unavailable right now.' });
  });
});

describe('GET /api/pools/:poolAddress', () => {
  it('returns the pool when found', async () => {
    const app = Fastify();
    const pool = fakePool('A');
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pool });
  });

  it('returns 404 when the pool is not in the curated set', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(null), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/NOPE' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Pool not found.' });
  });
});

describe('GET /api/pools/:poolAddress/history', () => {
  it('returns snapshots when the pool is found', async () => {
    const app = Fastify();
    const pool = fakePool('A');
    const snapshots = [{ poolId: 'A', snapshotAt: '2026-08-09T00:00:00.000Z', tvlUsd: 1, volume24hUsd: 1, fees24hUsd: 1, feeApr24h: 1, currentPrice: 1 }];
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(pool), getPoolHistory: vi.fn().mockResolvedValue(snapshots) };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/history?days=30' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ snapshots });
    expect(meteoraService.getPoolHistory).toHaveBeenCalledWith('A', 30);
  });

  it('defaults days to 90 when not provided', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(fakePool('A')), getPoolHistory: vi.fn().mockResolvedValue([]) };
    registerPoolsRoutes(app, { meteoraService });

    await app.inject({ method: 'GET', url: '/api/pools/A/history' });

    expect(meteoraService.getPoolHistory).toHaveBeenCalledWith('A', 90);
  });

  it('returns 400 for an out-of-range days value', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn(), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/A/history?days=9999' });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the pool is not found', async () => {
    const app = Fastify();
    const meteoraService = { getPools: vi.fn(), getPoolByAddress: vi.fn().mockResolvedValue(null), getPoolHistory: vi.fn() };
    registerPoolsRoutes(app, { meteoraService });

    const response = await app.inject({ method: 'GET', url: '/api/pools/NOPE/history' });

    expect(response.statusCode).toBe(404);
  });
});
```

Save as `backend/src/routes/pools.test.ts`.

- [ ] **Step 3: Register the routes**

Read the current file first (`backend/src/server.ts`). Add the import alongside the existing route imports:
```ts
import { registerPoolsRoutes } from './routes/pools.js';
```
And add the registration call alongside the existing ones (order doesn't matter, but keep it grouped with the others):
```ts
  registerPoolsRoutes(app);
```
Every other line in this file (the `cors`/`rateLimit` setup, `main()`) stays exactly as it is today.

- [ ] **Step 4: Run the tests**

Run: `cd backend && npx vitest run src/routes/pools.test.ts`
Expected: all tests pass (7 tests).

- [ ] **Step 5: Verify the whole backend suite and typecheck**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pools.ts backend/src/routes/pools.test.ts backend/src/server.ts
git commit -m "feat(backend): add GET /api/pools routes"
```

---

### Task 6: Frontend API client

**Files:**
- Create: `frontend/src/lib/api/pools.ts`

**Interfaces:**
- Produces: `PoolNotFoundError` class, `fetchPools(): Promise<PoolWithStats[]>`, `fetchPool(poolAddress): Promise<PoolWithStats>`, `fetchPoolHistory(poolAddress, days?): Promise<PoolSnapshot[]>`. Consumed by Task 7 (`PoolListPage.tsx`) and Task 8 (`PoolDetailPage.tsx`).

- [ ] **Step 1: Write the API client**

```ts
import type { PoolSnapshot, PoolWithStats } from '../../types/pool';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class PoolNotFoundError extends Error {}

export async function fetchPools(): Promise<PoolWithStats[]> {
  const response = await fetch(new URL('/api/pools', API_BASE_URL).toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pools.');
  }

  return body.pools as PoolWithStats[];
}

export async function fetchPool(poolAddress: string): Promise<PoolWithStats> {
  const response = await fetch(new URL(`/api/pools/${poolAddress}`, API_BASE_URL).toString());
  const body = await response.json();

  if (response.status === 404) {
    throw new PoolNotFoundError(typeof body?.error === 'string' ? body.error : 'Pool not found.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pool.');
  }

  return body.pool as PoolWithStats;
}

export async function fetchPoolHistory(poolAddress: string, days = 90): Promise<PoolSnapshot[]> {
  const url = new URL(`/api/pools/${poolAddress}/history`, API_BASE_URL);
  url.searchParams.set('days', String(days));
  const response = await fetch(url.toString());
  const body = await response.json();

  if (response.status === 404) {
    throw new PoolNotFoundError(typeof body?.error === 'string' ? body.error : 'Pool not found.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pool history.');
  }

  return body.snapshots as PoolSnapshot[];
}
```

Save as `frontend/src/lib/api/pools.ts`.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/pools.ts
git commit -m "feat(frontend): add Pools API client"
```

---

### Task 7: Pool List page

**Files:**
- Modify: `frontend/src/pages/PoolListPage.tsx`

**Interfaces:**
- Consumes: `fetchPools` (Task 6), `PillButton` (`frontend/src/components/PillButton.tsx`, existing), `PoolTable`/`StatTile` (existing, unchanged).

- [ ] **Step 1: Convert to the async loading/error/ready pattern**

Read the current file first (`frontend/src/pages/PoolListPage.tsx`), then replace its entire contents with:

```tsx
import { useEffect, useState } from 'react';
import { PoolTable } from '../components/PoolTable';
import { StatTile } from '../components/StatTile';
import { PillButton } from '../components/PillButton';
import { fetchPools } from '../lib/api/pools';
import { formatUsdCompact } from '../lib/format';
import type { PoolWithStats } from '../types/pool';

export function PoolListPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pools, setPools] = useState<PoolWithStats[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchPools()
      .then((result) => {
        if (cancelled) return;
        setPools(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load pools.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana, live from Meteora's public API,
        curated to the top 50 by TVL — hover or tab to the underlined column headers for what
        each term means.
      </p>
      {status === 'loading' ? (
        <div className="h-64 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
      ) : status === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <p style={{ color: 'var(--status-critical)' }}>{errorMessage}</p>
          <PillButton onClick={() => setRequestId((n) => n + 1)} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatTile label="Total TVL" value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0))} />
            <StatTile label="24h Volume" value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.volume24hUsd, 0))} />
            <StatTile label="Active Pools" value={String(pools.length)} />
          </div>
          <PoolTable pools={pools} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PoolListPage.tsx
git commit -m "feat(frontend): load the Pools list from live Meteora data"
```

---

### Task 8: Pool Detail page + AddLiquidityForm devnet/mainnet decoupling

**Files:**
- Modify: `frontend/src/pages/PoolDetailPage.tsx`
- Modify: `frontend/src/components/AddLiquidityForm.tsx`

**Interfaces:**
- Consumes: `fetchPool`, `fetchPoolHistory`, `PoolNotFoundError` (Task 6).

- [ ] **Step 1: Convert PoolDetailPage to the async loading/error/not-found/ready pattern**

Read the current file first (`frontend/src/pages/PoolDetailPage.tsx`), then replace its entire contents with:

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { HistoryChart } from '../components/HistoryChart';
import { IlCalculator } from '../components/IlCalculator';
import { StatTile } from '../components/StatTile';
import { Tooltip } from '../components/Tooltip';
import { AddLiquidityForm } from '../components/AddLiquidityForm';
import { PillButton } from '../components/PillButton';
import { fetchPool, fetchPoolHistory, PoolNotFoundError } from '../lib/api/pools';
import { formatPercent, formatPrice, formatUsd, formatUsdCompact } from '../lib/format';
import type { PoolSnapshot, PoolWithStats } from '../types/pool';

export function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const { connected } = useWallet();
  const [status, setStatus] = useState<'loading' | 'error' | 'not-found' | 'ready'>('loading');
  const [pool, setPool] = useState<PoolWithStats | null>(null);
  const [series, setSeries] = useState<PoolSnapshot[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    if (!poolId) return;
    let cancelled = false;
    setStatus('loading');

    Promise.all([fetchPool(poolId), fetchPoolHistory(poolId)])
      .then(([poolResult, historyResult]) => {
        if (cancelled) return;
        setPool(poolResult);
        setSeries(historyResult);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PoolNotFoundError) {
          setStatus('not-found');
          return;
        }
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load pool.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [poolId, requestId]);

  if (status === 'loading') {
    return <div className="h-64 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />;
  }

  if (status === 'not-found') {
    return (
      <div>
        <p style={{ color: 'var(--text-primary)' }}>Pool not found.</p>
        <Link to="/" style={{ color: 'var(--accent)' }}>
          Back to pool list
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage}</p>
        <PillButton onClick={() => setRequestId((n) => n + 1)} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  const stats = pool!.stats;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-xs" style={{ color: 'var(--accent)' }}>
          ← Back to pool list
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {pool!.name}
        </h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <Tooltip termKey="binStep">bin step</Tooltip> {pool!.binStep} · base fee {(pool!.baseFeeBps / 100).toFixed(2)}% · current
          price {formatPrice(stats.currentPrice)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label={<Tooltip termKey="tvl">TVL</Tooltip>} value={formatUsdCompact(stats.tvlUsd)} />
        <StatTile label="Volume (24h)" value={formatUsdCompact(stats.volume24hUsd)} />
        <StatTile label="Fees (24h)" value={formatUsd(stats.fees24hUsd)} />
        <StatTile
          label={<Tooltip termKey="feeApr">Fee APR (est.)</Tooltip>}
          value={formatPercent(stats.feeApr24h)}
          accent="var(--series-green)"
        />
      </div>

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

      {connected ? (
        <AddLiquidityForm />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Connect a wallet to add liquidity (devnet only — separate from the live pool shown above).
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Decouple AddLiquidityForm from the (now-live, mainnet) pool prop**

Read the current file first (`frontend/src/components/AddLiquidityForm.tsx`). Change:
```tsx
export function AddLiquidityForm({ poolAddress }: { poolAddress: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { bump } = usePositionsRefresh();

  // This dashboard's Pools page uses sample data (see PoolListPage) — its
  // poolAddress values aren't real on-chain addresses, so the field is
  // editable here rather than a fixed prop, to let a real devnet DLMM pool
  // address be tested against without needing a live Meteora-backed Pools
  // list (out of scope for this feature).
  const [poolAddressInput, setPoolAddressInput] = useState(poolAddress);
```
to:
```tsx
export function AddLiquidityForm() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { bump } = usePositionsRefresh();

  // This form only ever builds transactions against SOLANA_RPC_URL (devnet).
  // The Pools page shows real Meteora pools, but those are mainnet
  // addresses — never valid targets here. The two are intentionally
  // decoupled: this field is manual/editable rather than pre-filled from
  // whichever pool the user is viewing, since auto-filling a real-looking
  // mainnet address would silently fail instead of the current honest
  // "type in a devnet pool address" affordance.
  const [poolAddressInput, setPoolAddressInput] = useState('');
```
Every other line in this file (the whole transaction-building `runFlow`, form fields, buttons, JSX) stays exactly as it is today — this is a signature and comment change only, no logic change.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PoolDetailPage.tsx frontend/src/components/AddLiquidityForm.tsx
git commit -m "feat(frontend): load Pool Detail from live Meteora data, decouple Add Liquidity from it"
```

---

### Task 9: Copy updates and mock-data removal

**Files:**
- Modify: `frontend/src/pages/FaqPage.tsx`
- Delete: `frontend/src/mock/pools.ts`
- Delete: `frontend/src/mock/snapshots.ts`
- Modify: `frontend/src/lib/yield.test.ts`

**Interfaces:** none new — this task only removes now-dead code and updates copy/tests.

- [ ] **Step 1: Update the FAQ's data-provenance copy**

Read the current file first (`frontend/src/pages/FaqPage.tsx`). Change:
```
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. The News and Screener pages use live public APIs and may be delayed,
          incomplete, or wrong; the Pools page uses generated sample data for this demo, not live
          Meteora data. Always verify independently before making decisions.
```
to:
```
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. The News, Screener, and Pools pages all use live public APIs and may be
          delayed, incomplete, or wrong. Always verify independently before making decisions.
```
Every other line in the file stays exactly as it is today.

- [ ] **Step 2: Delete the now-unused mock data files**

Confirm nothing still imports them (both `PoolListPage.tsx` and `PoolDetailPage.tsx` were converted away from them in Tasks 7-8):
```bash
grep -rl "mock/pools\|mock/snapshots" frontend/src
```
Expected: no output (no remaining importers). Then delete:
```bash
git rm frontend/src/mock/pools.ts frontend/src/mock/snapshots.ts
```

- [ ] **Step 3: Add a short-series test case to yield.test.ts**

Read the current file first (`frontend/src/lib/yield.test.ts`). Add this new `describe` block at the end of the file (after the existing `describe('calculateNetYield — entry date matching', ...)` block — keep everything above unchanged):

```ts
describe('calculateNetYield — very short series (newly-curated live pool)', () => {
  it('does not crash and returns zero IL for a single-snapshot series', () => {
    const single: PoolSnapshot[] = [snapshot({ snapshotAt: '2026-01-01T00:00:00Z', currentPrice: 100, tvlUsd: 1_000_000, fees24hUsd: 500 })];

    const result = calculateNetYield({
      depositUsd: 10_000,
      entryDate: '2026-01-01T00:00:00Z',
      lowerPrice: 90,
      upperPrice: 120,
      series: single,
    });

    expect(result.daysHeld).toBe(1);
    expect(result.daysInRange).toBe(1);
    expect(result.impermanentLossPct).toBeCloseTo(0, 10);
    expect(result.feesEarnedUsd).toBeCloseTo(5, 6); // 10000/1_000_000 * 500
  });
});
```

- [ ] **Step 4: Run the frontend tests and verify it compiles**

Run: `cd frontend && npm test -- --run && npx tsc --noEmit -p tsconfig.app.json`
Expected: all tests pass (16 tests — 15 existing + 1 new), no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FaqPage.tsx frontend/src/lib/yield.test.ts
git rm frontend/src/mock/pools.ts frontend/src/mock/snapshots.ts
git commit -m "chore(frontend): remove Pools mock data, update FAQ copy, add short-series yield test"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Apply the schema change**

The user needs to run the SQL from Task 2 (`db/schema.sql`'s new `pool_tvl_daily` table) in their Supabase project's SQL Editor before this task can be verified end-to-end. If this hasn't been done yet, stop and ask for it rather than skipping straight to code-only verification.

- [ ] **Step 2: Run the TVL snapshot worker once**

Run: `cd backend && npm run snapshot:tvl`
Expected: console output like `TVL snapshot done: 50 succeeded, 0 failed.` (exact count depends on how many pools currently clear the curation thresholds live). Run it a second time immediately after — expected: same success count, and in the Supabase table editor, `pool_tvl_daily` should show exactly one row per pool for today's date (not two), confirming the upsert is idempotent.

- [ ] **Step 3: Start both servers and check the routes directly**

Run: `cd backend && npm run dev` (background), `cd frontend && npm run dev -- --port 5180` (background).
```bash
curl -s http://localhost:4000/api/pools | head -c 500
```
Expected: `{"pools":[...]}` with real pool names (not SOL-USDC/JUP-USDC/etc. from the old mock set) — no 500/503.
```bash
curl -s "http://localhost:4000/api/pools/<a real poolAddress from the previous response>/history" | head -c 500
```
Expected: `{"snapshots":[...]}` with at least one entry (today's, from the worker run in Step 2) — no 500/503.

- [ ] **Step 4: Browser check with Playwright**

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('text=Active DLMM Pools');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'pools-verify-list.png', fullPage: true });

// Click the first pool row and confirm the detail page loads.
await page.click('[role="button"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'pools-verify-detail.png', fullPage: true });

console.log('Console errors:', errors.length ? errors : 'none');
await browser.close();
```

Run from `frontend/`. Read both screenshots with the Read tool afterward and confirm: the list page shows real pool names (not the old mock set) with plausible TVL/volume figures, and the detail page shows either real chart data (if the worker has run enough times to build a short history) or the "not enough recorded history yet" message — not a blank page, not a crash, not the old fabricated 90-day chart shape.

- [ ] **Step 5: Clean up**

```bash
rm -f frontend/pools-verify-list.png frontend/pools-verify-detail.png
```

(No commit for this task — verification only. If anything fails, go back to the relevant task, fix, and re-verify.)
