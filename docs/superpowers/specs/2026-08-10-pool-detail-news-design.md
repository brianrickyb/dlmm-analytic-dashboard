# Pool Detail Related News — Design

## Context

The News page and the Screener's Pump Watch panel are the only two places in this dashboard
that surface crypto news, and neither connects news to a specific DLMM pool. A user looking
at a Pool Detail page (e.g. SOL-JUP) currently has no way to see whether there's recent news
that might explain a price move or inform an add-liquidity decision, without leaving the page
and manually searching. Pump Watch already proved the underlying pattern — match a token
symbol to recent CryptoPanic coverage — for freshly-launched pump candidates; this applies
the same idea to the tokens in whatever pool the user is already looking at.

This is one of three related ideas discussed (the other two — sentiment tagging and free-text
search on the News page — are deferred, separate specs) and was chosen to go first because the
CryptoPanic integration already exists and works (built for Pump Watch), so this is mostly
wiring, not new infrastructure.

## Goal

A "Related News" section on the Pool Detail page, positioned after the IL calculator and
before the Add Liquidity section, showing up to 3 recent (last 7 days) CryptoPanic articles
per non-stablecoin token in the pool, grouped by token symbol. Read-only, best-effort — if
CryptoPanic has nothing or is unavailable, the section still degrades gracefully without
blocking the rest of the page (matches the resilience pattern every other panel in this app
already follows: one data source failing never blocks a sibling panel).

## Approach

### Backend: extend `cryptopanic.ts`, don't modify it

Pump Watch's `getRecentNewsForSymbol(symbol): Promise<NewsMatch | null>` (single article, 48h
window) stays exactly as-is — it's still used by the Pump Watch route and must keep working
unchanged. Add a **new**, separate method to the same service:

```ts
getRecentNewsForToken(symbol: string, options?: { limit?: number; windowHours?: number }): Promise<NewsMatch[]>
```

- Default `limit: 3`, `windowHours: 168` (7 days) — different defaults than the existing
  method's 1-article/48h, since this feature is browsing established tokens' general coverage
  for context, not flagging a fresh pump.
- Same never-throws contract as the existing method: any failure (no API key, network error,
  non-ok response, bad JSON, no results) resolves to `[]`, never rejects. This is the one
  invariant that must hold for both methods, since routes built on this service rely on it to
  degrade instead of 500ing.
- Same `NewsMatch` type (`title`, `url`, `publishedAt`) — no new shape needed, just more of
  them per call, and a wider default freshness window.
- Own internal cache (separate `Map` from the existing method's cache, since the two methods
  answer different questions with different windows/limits — keeping them separate avoids one
  method's cached entry accidentally satisfying the other's different contract). Same
  TTL-tiering idea as the existing method (short TTL for a real result, longer TTL for "no
  results" to avoid burning API quota on quiet tokens) — reuse the same constants
  (`cacheTtlMs`/`NEGATIVE_CACHE_TTL_MS`) already defined in the file.

### Backend: new route `GET /api/pools/:poolAddress/news`

New handler in `backend/src/routes/pools.ts` (the same file Pump Watch's sibling `screener.ts`
pattern already established, alongside this feature's own existing `/api/pools/:poolAddress`
and `/history` routes):

1. Resolve the pool via `meteoraService.getPoolByAddress(poolAddress)` (already cached from
   the list fetch — no extra Meteora API call). 404 if not found, matching the existing two
   routes' behavior.
2. Determine which of `tokenX`/`tokenY` to query: skip a token whose symbol is in a small
   hardcoded stablecoin set (`USDC`, `USDT`, `DAI`, `BUSD`, `TUSD`, `USDP`, `FDUSD`) — same
   "small hardcoded lookup list" pattern already used for `CURRENCY_ALIASES` in
   `backend/src/services/rss.ts` and `FEED_SOURCES` in the same file. If *both* tokens are
   stablecoins (unlikely given the pool curation's volume/TVL floors, but possible), the
   response is simply an empty list — not an error.
3. Call `cryptoPanicService.getRecentNewsForToken(symbol)` once per remaining token
   (`Promise.all`, matching Pump Watch's per-candidate fan-out pattern).
4. Response: `{ tokens: { symbol: string; articles: NewsMatch[] }[] }` — one entry per queried
   token (even if its `articles` array is empty, so the frontend can render a
   "no recent coverage" state per-token rather than just omitting it silently).

No new error class needed — like Pump Watch's route, only the *pool lookup* can fail in a way
that matters (404/503 from Meteora), never the news lookup itself (best-effort, per the
service's never-throws contract).

### Frontend

- `frontend/src/lib/api/pools.ts` gains `fetchPoolNews(poolAddress): Promise<PoolTokenNews[]>`
  (new type `PoolTokenNews = { symbol: string; articles: NewsMatch[] }`, reusing the existing
  `NewsMatch` type already defined in `frontend/src/types/screener.ts` from Pump Watch — no
  duplicate type needed, just imported).
- New component `frontend/src/components/RelatedNews.tsx`: `loading`/`error`/`ready` states
  (same three-state shape as every other panel in this app), each token gets its own
  sub-heading (`SOL`, `JUP`, etc.) with its up-to-3 articles rendered as row-cards (title
  linking out, source-agnostic since CryptoPanic aggregates many outlets, `publishedAt`
  formatted the same way `NewsList.tsx` already formats dates). A token with zero articles
  shows a small "No recent coverage" line instead of an empty gap. If both tokens are
  stablecoins (empty `tokens` array from the backend), the whole section doesn't render at
  all rather than showing an empty box.
- `PoolDetailPage.tsx` gains its own `newsStatus`/`poolNews`/`newsRequestId` state block and
  `useEffect` (mirroring the existing `pumpStatus`/etc. pattern from `ScreenerPage.tsx`) —
  **independent** of the page's existing `pool`/`series` loading state, so a slow or failed
  CryptoPanic call never blocks or delays the stat tiles/charts/IL calculator from rendering.
  Rendered between `<IlCalculator />` and the `connected ? <AddLiquidityForm /> : ...` block.

## Out of scope

- Sentiment tagging and free-text search on the News page — separate, deferred specs.
- Any change to Pump Watch's existing `getRecentNewsForSymbol` method, route, or UI.
- Deduplicating articles that happen to mention both tokens in the same pool (e.g. a
  "SOL and JUP both rally" headline appearing under both token groups) — acceptable minor
  redundancy, not worth the complexity of cross-token dedup for this pass.
- Backfilling or caching news history — this is always a live CryptoPanic lookup (through the
  existing cache layer), same as Pump Watch.

## Testing

Matches this project's established convention:
- `backend/src/services/cryptopanic.test.ts` gains tests for the new
  `getRecentNewsForToken` method: returns up to `limit` articles within the window, excludes
  stale articles outside `windowHours`, never throws on failure (same failure-mode coverage
  as the existing method's tests), and uses a separate cache from `getRecentNewsForSymbol`.
- `backend/src/routes/pools.test.ts` gains tests for the new `/news` route: 200 with grouped
  results, stablecoin token skipped, 404 when the pool isn't found, empty `tokens` array when
  all pool tokens are stablecoins.
- No new frontend component tests (matches the zero-component-test convention already
  established for every other page/panel in this app).
