# News Feed Module — Design

## Context

The dashboard started as a DLMM pool analytics tool (Meteora, Solana). The user wants
to expand it into a broader crypto screening dashboard: daily news, a long/short
screener, X/Twitter narrative, and a project directory. These are four largely
independent subsystems; each gets its own design → plan → implementation cycle.
This spec covers the first and lowest-risk piece: **a crypto news feed page**.

## Goal

Show an up-to-date, filterable feed of crypto news inside the existing dashboard, at
a new route, without exposing any third-party API key to the browser and without
overspending the news provider's rate limit on every page load.

## Data source

**CryptoPanic API** (free tier, API key required). Chosen over a self-built RSS
aggregator (more work, no free sentiment) and NewsAPI.org (not crypto-specific, 24h
delay + 100 req/day on free tier). CryptoPanic already aggregates from CoinDesk,
Cointelegraph, etc., supports filtering by currency and by category
(`rising` / `hot` / `bullish` / `bearish` / `important`), and exposes community vote
counts we can show as a lightweight sentiment badge without building any NLP.

## Architecture

This is the first real backend work in the project (previously only the frontend was
built, against mock data). Per the stage-1 architecture decision, the backend is
**Fastify + TypeScript**.

- The frontend never calls CryptoPanic directly — the API key must never reach the
  browser (anyone could read it from DevTools and burn the quota, or worse).
- A new backend service (`backend/`) exposes `GET /api/news`, taking `currencies`
  (comma-separated ticker list) and `filter` (one of CryptoPanic's category filters)
  as query params.
- The backend calls CryptoPanic server-side using an API key from an environment
  variable, and caches the response **in-memory**, keyed by the exact
  `(currencies, filter)` combination, with a short TTL (3–5 minutes).
- No database persistence for news. Unlike pool TVL/volume, news has no historical
  trend requirement in this dashboard — a short-lived in-memory cache is sufficient
  and far simpler than the partitioned `pool_snapshots` design used for DLMM data.

## Components

**Backend** (`backend/src/`)
- `server.ts` — Fastify app entrypoint.
- `routes/news.ts` — registers `GET /api/news`, validates/normalizes query params.
- `services/cryptopanic.ts` — HTTP client to CryptoPanic, in-memory TTL cache,
  upstream-error classification.
- `types/news.ts` — shared response types.

**Frontend** (`frontend/src/`)
- `pages/NewsPage.tsx` — new route `/news`.
- `components/NewsFilters.tsx` — coin search/filter + category tabs (All, Rising,
  Hot, Bullish, Bearish, Important — mirrors CryptoPanic's `filter` values).
- `components/NewsList.tsx` — news cards: title, source, relative time, sentiment
  badge (from community vote counts), link opens the original article in a new tab.
- `lib/api/news.ts` — typed fetch wrapper to the backend endpoint.
- `types/news.ts` — mirrors the backend's response type.

## Data flow

1. User opens `/news` (or changes a filter).
2. Frontend calls `GET /api/news?currencies=...&filter=...`.
3. Backend checks its cache for that exact param combination.
   - Fresh (< TTL): return cached payload.
   - Stale/missing: fetch CryptoPanic, store in cache, return it.
4. Frontend renders the list; changing filters issues a new request with a new
   cache key.

## Error handling

The backend distinguishes failure modes rather than passing through raw upstream
errors:
- CryptoPanic unreachable / times out → backend responds `503`.
- CryptoPanic responds `401` (bad key) or `429` (rate limited) → backend responds
  `502` with a specific, non-leaking message.

The frontend has three explicit states beyond the happy path: loading (skeleton),
empty (no articles match the current filter), and error (message + retry button).

## Testing

Testing effort concentrates on the logic most likely to fail silently:
- **Cache TTL** (`services/cryptopanic.ts`): using fake timers, verify a second call
  within the TTL window reuses the cached value (no second upstream call), and that
  a call after the TTL expires triggers a fresh fetch.
- **Upstream error classification**: mock the upstream fetch to return a success
  payload, a `429`, a `500`, and malformed JSON — verify each maps to the correct
  internal error type / HTTP status.

The frontend is verified manually in a running browser (via the `run` skill/
Playwright screenshot check used earlier in this project), not with formal unit
tests, for this MVP.

## Out of scope (this spec)

- Long/short screener, X/Twitter narrative, project directory — separate specs.
- Persisting news history or building a "news archive" view.
- Per-pool news widget on the pool detail page (may be a follow-up, not required now).
