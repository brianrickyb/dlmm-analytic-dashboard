# Pools Page — Replace Mock Data with Live Meteora DLMM Data — Design

## Context

The Pools page (list + detail) has used 100% fabricated data since the project's mock-data
bootstrap phase: a hardcoded array of 8 pools (`frontend/src/mock/pools.ts`) and a
deterministic-PRNG-generated 90-day history (`frontend/src/mock/snapshots.ts`). This is a
known, explicitly-documented gap — the FAQ page and the Pools page copy both currently tell
the user this is sample data, not live Meteora data. Every other data-driven page in this app
(News, Screener, Pump Watch, wallet-liquidity/My Positions) is already backed by a real
external source; Pools is the last one still fully mocked, and it's the dashboard's flagship
page.

This was always the intended end-state — not a new idea. The project's very first
architecture-validation note recorded that "Meteora public API tidak menyediakan historical
time-series" as the reason a full DB-backed snapshot-worker architecture was designed
(`db/schema.sql`'s partitioned `pool_snapshots` table) but never built. **That assumption is
now out of date.** Verified live against Meteora's current public API
(`https://dlmm.datapi.meteora.ag`) during planning: it now exposes a real pools-list
endpoint (121,113 pools, paginated, sortable, filterable) plus **per-pool historical price
(OHLCV) and volume-history endpoints** — capabilities that didn't exist when the original
schema was designed. Only one gap remains: **no historical TVL endpoint**, current TVL only.
The user chose to close that one remaining gap with a small, purpose-built daily snapshot
worker rather than approximate it — everything else can be a stateless live proxy, matching
the pattern every other backend service in this app already uses.

**Outcome:** Pools list + detail, the IL calculator, and the history charts all run on real
Meteora mainnet data. The `db/schema.sql` partitioned schema stays unused (superseded, not
deleted — same precedent this project already set when the on-chain-positions refactor
retired the old `positions` table). `frontend/src/mock/pools.ts` and `snapshots.ts` are
deleted once nothing imports them.

## Verified against the live API (not assumed)

Real sample pulled from `GET https://dlmm.datapi.meteora.ag/pools?sort_by=tvl:desc` during
planning:
- `pool_config.base_fee_pct` is a **percentage** (e.g. `0.03` = 0.03%), not basis points —
  our `Pool.baseFeeBps` needs `base_fee_pct * 100` to convert.
- `apr`/`apy` field naming is **misleading and should not be trusted at face value**: `apr`
  is actually the raw, un-annualized 24h fee/TVL ratio (identical to `fee_tvl_ratio["24h"]`
  in the same response), not an annualized percentage; `apy` is an annualized *multiplier*
  (e.g. `2.16` ≈ 216%), not already a percent. **Decision: don't map either field into
  `feeApr24h`.** Compute it ourselves the same way this project's own original schema
  design already specified — `(fees["24h"] / tvl) * 365 * 100` — using the unambiguous
  `fees.24h` and `tvl` fields directly. Self-consistent, verifiable, avoids depending on an
  ambiguous third-party field name.
- `created_at` is a Unix epoch **in milliseconds** (number), not an ISO string — needs
  `new Date(created_at).toISOString()`.
- `token_x.price`/`token_y.price` are real per-token USD prices; the pool's own
  `current_price` is the **exchange ratio** (tokenX per tokenY), matching what the mock
  data's `currentPrice` field already meant — map `current_price`, not the token USD
  prices, or `il.ts`/`yield.ts`'s ratio math silently breaks for any non-USD-quoted pair.
- No pool-level `active_bin_id` field exists on this REST API (that's on-chain DLMM program
  state, a different data source entirely — and the only RPC connection this backend has is
  devnet-only, `SOLANA_RPC_URL`, unusable against these mainnet pools). Checked all
  consumers: `activeBinId` is not rendered or computed on anywhere in the frontend today.
  Made optional/nullable in the type; simply omitted — not worth wiring up a second,
  mainnet RPC connection for a field nothing uses.

## Approach

### Backend: `backend/src/services/meteora.ts` (new)

Same shape as every existing integration in this backend (`bybit.ts`, `coingecko.ts`,
`geckoterminal.ts`, `cryptopanic.ts` — the pattern to match exactly):
`create<X>Service({ fetchImpl?, now?, cacheTtlMs? })` factory, in-memory TTL cache,
`MeteoraUnavailableError` thrown on primary-fetch failure (network/non-ok/bad-JSON/missing
fields), a single malformed pool row skipped rather than failing the whole batch (matches
`geckoterminal.ts`'s `parsePool` pattern).

- `getPools()`: one call to `/pools` with `sort_by=tvl:desc`, `filter_by=is_blacklisted=false
  && tvl>=100000 && volume_24h>=10000`, `page_size=100`, curated down to **top 50 by TVL**
  server-side. Thresholds are named constants at the top of the file — deliberately tunable,
  not hidden — since the right cutoff can only really be judged once real curated results
  are seen. Cache TTL: 60s (matches the "dashboard not a trading terminal" freshness bar
  already set by `geckoterminal.ts`'s 90s and `coingecko.ts`'s 10min).
- `getPoolByAddress(address)`: served from the same cached `getPools()` result — no extra
  upstream call for something the list already has.
- `getPoolHistory(address, days)`: merges three sources per day in the window —
  Meteora's `/pools/{address}/ohlcv` (1d candles, for price), `/pools/{address}/volume/history`
  (for volume/fees), and **our own daily TVL table** (see worker, below) for TVL. A day is
  only included in the returned `PoolSnapshot[]` if **all three** are present for it — this
  keeps `PoolSnapshot.tvlUsd` a required, always-real number (no contract change needed in
  `frontend/src/lib/yield.ts`, which assumes one entry per day, all fields populated). In
  practice this means the series starts short (bounded by how long the TVL worker has been
  running) and grows one day at a time — the user explicitly chose this tradeoff over a
  fabricated/flat TVL fallback. Per-pool history cache TTL: 5 min.

### Backend: TVL snapshot worker (new — the one genuinely new piece of infrastructure)

This project's own original architecture note already specified the right shape for this
kind of job, just never built it: **a separate worker entrypoint, not an in-process timer**,
invoked as a one-off command by an external scheduler (Railway/Render Cron), so it can't
double-run across horizontally-scaled instances and doesn't depend on the API process
staying up continuously.

- New table, added to `db/schema.sql` (append, don't touch the existing unused
  `pools`/`pool_snapshots`/`pool_latest_stats` design): a minimal
  `pool_tvl_daily (pool_address TEXT, day DATE, tvl_usd NUMERIC, PRIMARY KEY (pool_address, day))`
  — no partitioning needed at this scale (top-50 pools × one row/day). This is deliberately
  much smaller than the original schema's design, because price and volume history are now
  solved by Meteora's own endpoints — TVL is the only real gap left to cover ourselves.
- New file `backend/src/worker/snapshotPoolTvl.ts`: fetches the current curated pool list
  (reusing `meteora.ts`'s `getPools()`), upserts one `(pool_address, today, tvl)` row per
  pool via Supabase (`ON CONFLICT (pool_address, day) DO UPDATE` — idempotent, safe to
  re-run the same day). Matches this project's own documented resilience requirement from
  day one: "snapshot job harus tetap commit pool lain yang berhasil walau sebagian pool
  gagal fetch" — one pool's failure doesn't block the others' rows from being written.
- A local `npm run` script to invoke the worker on demand during development (there's no
  scheduler available locally) — the actual Railway/Render Cron wiring is a deployment-time
  task, out of scope for this plan's code, but noted as a follow-up.
- Read path (`meteora.ts`'s `getPoolHistory`) queries this table directly via the existing
  Supabase client pattern (`backend/src/lib/supabaseAdmin.ts`).

### Backend routes: `backend/src/routes/pools.ts` (new)

Same DI-for-testability shape as `registerScreenerRoutes` (`backend/src/routes/screener.ts`):
`registerPoolsRoutes(app, deps: { meteoraService? } = {})`.
- `GET /api/pools` → `{ pools: PoolWithStats[] }`, 503 on `MeteoraUnavailableError`.
- `GET /api/pools/:poolAddress` → `{ pool: PoolWithStats }` / 404 if not in the curated set.
- `GET /api/pools/:poolAddress/history?days=90` → `{ snapshots: PoolSnapshot[] }`, 404/503
  as above.
Register in `backend/src/server.ts` alongside the existing `register*Routes` calls.

### `id` / `poolAddress`, and the devnet-vs-mainnet split

- Collapse `Pool.id` and `Pool.poolAddress` to the same real value (the actual mainnet
  address) — minimal-churn option: keep both fields in the type, just populate identically.
  No route/param renaming needed (`/pools/:poolId` keeps working as-is).
- `frontend/src/components/AddLiquidityForm.tsx`'s currently-editable pool-address field
  stays editable and empty-by-default — do **not** auto-fill it with the real (mainnet)
  address once one exists. That form only ever operates against `SOLANA_RPC_URL` (devnet);
  a real mainnet address there would look valid but deterministically fail. Update the
  file's existing explanatory comment (currently says addresses are fake placeholders — that
  reasoning is about to go stale) and the "Connect a wallet to add liquidity to this pool"
  copy on `PoolDetailPage.tsx` to instead explain the real reason: this feature is
  intentionally devnet-only and decoupled from the (mainnet) Pools page.

### Frontend

- New `frontend/src/lib/api/pools.ts` (mirrors `frontend/src/lib/api/screener.ts` exactly):
  `fetchPools()`, `fetchPool(address)`, `fetchPoolHistory(address, days?)`.
- `frontend/src/pages/PoolListPage.tsx`: convert from synchronous `getPoolsWithStats()` to
  the established async pattern already used by `ScreenerPage.tsx`/`NewsPage.tsx` —
  `loading/error/ready` state, `useEffect`, `PillButton` retry.
- `frontend/src/pages/PoolDetailPage.tsx`: convert from synchronous `pools.find()` +
  `getSnapshots`/`getLatestStats` to one combined `Promise.all([fetchPool, fetchPoolHistory])`
  effect (one loading/error state covers the whole page — stat tiles, both charts, IL
  calculator, and Add Liquidity all depend on both calls succeeding together, so splitting
  them the way `ScreenerPage`'s independent panels do wouldn't help here). Add a distinct
  404 ("pool not found") branch versus a 503 ("unavailable, retry") branch. Add an explicit
  "not enough history yet" branch for pools whose TVL-worker coverage is still short (empty
  or very short `snapshots` array) — today's mock always guarantees 91 entries, so
  `IlCalculator.tsx`'s unconditional `series[0]` access has never had to handle a short/empty
  series; guard for it here rather than there.
- `PoolTable.tsx` and `HistoryChart.tsx`: no structural changes — both are already pure
  presentational components over already-loaded data.
- `IlCalculator.tsx` / `frontend/src/lib/il.ts` / `frontend/src/lib/yield.ts`: no logic
  changes. `yield.ts`'s `daysHeld`/`daysInRange` (effectively `series.length`) already assume
  one `PoolSnapshot` per calendar day, which the new backend history endpoint preserves by
  construction.
- Delete `frontend/src/mock/pools.ts` and `frontend/src/mock/snapshots.ts` once the two
  pages above no longer import them (confirmed these are the only two importers).
- Update the "sample data" copy on `frontend/src/pages/FaqPage.tsx` and
  `frontend/src/pages/PoolListPage.tsx` to reflect that Pools is now live data.

## Out of scope

- Pagination / search UI on the Pools list (currently none; the top-50-by-TVL curation is
  the whole list for this pass — a "browse beyond 50" feature is a separate follow-up).
- Wiring up the actual Railway/Render Cron trigger for the TVL worker — that's a deployment
  configuration task, not application code.
- Any change to `AddLiquidityForm.tsx`'s core transaction-building logic — only its default
  value/copy changes.
- Backfilling TVL history from before this ships — not possible, Meteora's API doesn't
  expose it and the user explicitly chose the worker approach knowing history starts short.

## Testing

Matches this project's established convention:
- `backend/src/services/meteora.test.ts`: field mapping (including the `base_fee_pct`
  conversion and the self-computed `feeApr24h`, not Meteora's `apr`/`apy`), curation
  filtering, malformed-row skip, `MeteoraUnavailableError` cases, TVL/OHLCV/volume-history
  merge-and-truncate logic, caching.
- `backend/src/worker/snapshotPoolTvl.test.ts`: idempotent upsert, partial-failure tolerance
  (one pool's fetch failing doesn't block the others' rows).
- `backend/src/routes/pools.test.ts`: injected fake service, 200/404/503 shapes (mirrors
  `screener.test.ts`).
- `frontend/src/lib/yield.ts`'s existing tests: no changes required, but add one case for a
  short/near-empty series (a pool with little TVL history yet), since that's now a real,
  reachable state instead of the mock's guaranteed-91-days.
- No new frontend component tests (matches the zero-component-test convention already
  established for every other page in this app).

## Verification

1. `cd backend && npm test` and `npx tsc --noEmit` — new service/worker/route tests pass,
   existing suite still green.
2. `cd frontend && npx tsc --noEmit -p tsconfig.app.json`.
3. Run the TVL worker's local npm script once manually against real Supabase, confirm rows
   land in `pool_tvl_daily` and a second run doesn't duplicate them (idempotency check).
4. Start both dev servers, load the Pools list — confirm real pool names/TVL/volume render
   (not the old SOL-USDC/JUP-USDC mock set), open a pool detail page, confirm the "not
   enough history yet" branch renders sensibly for a freshly-curated pool with 0-1 days of
   captured TVL, and that the IL calculator doesn't crash on that short series.
5. Manual Playwright pass (light + dark) over the Pools list and detail pages, consistent
   with how every other page in this app has been verified.
