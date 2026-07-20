# News Feed Module — Design

## Context

The dashboard started as a DLMM pool analytics tool (Meteora, Solana). The user wants
to expand it into a broader crypto screening dashboard: daily news, a long/short
screener, X/Twitter narrative, and a project directory. These are four largely
independent subsystems; each gets its own design → plan → implementation cycle.
This spec covers the first and lowest-risk piece: **a crypto news feed page**.

## Revision note (2026-07-20)

The original version of this spec chose CryptoPanic as the data source. Mid-
implementation, CryptoPanic's docs revealed their free Developer API plan was
discontinued (removed April 1, 2026) — the free tier this decision was based on no
longer exists. Rather than pay for a news API in a portfolio project, the data source
was swapped to a self-built RSS aggregator. This is a real example of an external
dependency changing after a design was approved — see "Data source" and the sections
below for what changed and why.

## Goal

Show an up-to-date, filterable feed of crypto news inside the existing dashboard, at
a new route, resilient to any single upstream feed being slow or down, and without
overspending the news providers' goodwill by re-fetching every feed on every page
load.

## Data source

**Self-built RSS aggregator** over four established crypto news outlets' public RSS
feeds: CoinDesk, Cointelegraph, The Block, and Decrypt. No API key, no cost, no rate
limit to manage — these are the same public feeds their own readers can subscribe to.

Trade-offs versus the original CryptoPanic plan, made explicit rather than hidden:
- **No sentiment/vote data.** CryptoPanic exposed community bullish/bearish vote
  counts per article; plain RSS has no such field. The news card drops the sentiment
  badge — title, source, and relative time only.
- **No structured per-article coin tags.** CryptoPanic tagged each post with the
  currencies it was about; RSS gives us free-text title/description only. Coin
  filtering becomes a **keyword match** (e.g. "SOL" also matches "Solana" in the
  title) via a small alias table — good enough for coarse screening, not as precise
  as CryptoPanic's structured tags.
- **Category filter becomes a source filter.** CryptoPanic's `rising`/`hot`/
  `bullish`/`bearish`/`important` filters have no RSS equivalent; the only
  categorical dimension RSS naturally offers is *which outlet* published it, so the
  filter tabs become All / CoinDesk / Cointelegraph / The Block / Decrypt.

## Architecture

This is the first real backend work in the project (previously only the frontend was
built, against mock data). Per the stage-1 architecture decision, the backend is
**Fastify + TypeScript**.

- A new backend service (`backend/`) exposes `GET /api/news`, taking `currencies`
  (comma-separated ticker list, keyword-matched) and `source` (one of `coindesk`,
  `cointelegraph`, `theblock`, `decrypt`, or omitted for all four) as query params.
- The backend fetches all four feeds **in parallel** and tolerates partial failure:
  if one feed is down or returns invalid XML, the response still includes the
  other three (logged, not surfaced as a request-level error). Only a request where
  **every** feed fails returns an error to the client. This mirrors the
  partial-failure handling already decided for the DLMM pool snapshot fetcher in
  the stage-1 architecture review — the same principle applied to a second, unrelated
  data source.
- The merged, deduplicated (by article URL), sorted-by-date result is cached
  **in-memory, keyed by `source` only** (not by `currencies` — the currency filter is
  a cheap array filter applied after the cache read, so filtering by coin never
  triggers a redundant re-fetch of the same underlying feed data), with a short TTL
  (3–5 minutes).
- No database persistence for news, for the same reason as before: no historical
  trend requirement, so a short-lived in-memory cache is sufficient.

## Components

**Backend** (`backend/src/`)
- `server.ts` — Fastify app entrypoint.
- `routes/news.ts` — registers `GET /api/news`, validates/normalizes query params.
- `services/rss.ts` — fetches + parses the four RSS feeds (via `rss-parser`), merges,
  dedupes, sorts, caches, classifies total-failure vs. partial-failure.

**Frontend** (`frontend/src/`)
- `pages/NewsPage.tsx` — new route `/news`.
- `components/NewsFilters.tsx` — coin search/filter + source tabs (All, CoinDesk,
  Cointelegraph, The Block, Decrypt).
- `components/NewsList.tsx` — news cards: title, source, relative time, link opens
  the original article in a new tab. No sentiment badge (no data for one).
- `lib/api/news.ts` — typed fetch wrapper to the backend endpoint.
- `types/news.ts` — mirrors the backend's response type.

## Data flow

1. User opens `/news` (or changes a filter).
2. Frontend calls `GET /api/news?currencies=...&source=...`.
3. Backend checks its cache, keyed by `source` only.
   - Fresh (< TTL): reuse the cached merged feed.
   - Stale/missing: fetch all relevant feeds in parallel, merge, dedupe, sort, cache.
4. Backend applies the `currencies` keyword filter (if present) to the cached/fresh
   result and returns it.
5. Frontend renders the list; changing the source tab issues a new request with a
   new cache key, changing the coin filter re-filters the same cached data.

## Error handling

- All requested feeds fail (network error or unparseable XML) → backend responds
  `503` with a generic "news feeds are unavailable right now" message.
- Some feeds fail, at least one succeeds → backend returns the succeeding feeds'
  articles; the failure is logged server-side, not surfaced to the client as an
  error (a partial result is still useful to the user).

The frontend has three explicit states beyond the happy path: loading (skeleton),
empty (no articles match the current filter), and error (message + retry button).

## Testing

Testing effort concentrates on the logic most likely to fail silently:
- **Partial-failure tolerance** (`services/rss.ts`): mock one feed parser call to
  reject and others to resolve — verify the merged result still contains the
  succeeding feeds' articles, and that all-feeds-rejecting throws the total-failure
  error.
- **Dedupe and sort**: given two mocked feeds with an overlapping URL and
  out-of-order dates, verify the merged result has no duplicate URLs and is sorted
  newest-first.
- **Cache TTL**: using an injected `now`, verify a second call within the TTL reuses
  the cached merge (no second parse call), and a call after expiry re-fetches.
- **Currency keyword filter**: verify a title containing "Solana" matches a
  `currencies=SOL` query, and a title containing neither the code nor its alias does
  not.

The frontend is verified manually in a running browser (via the `run` skill/
Playwright screenshot check used earlier in this project), not with formal unit
tests, for this MVP.

## Out of scope (this spec)

- Long/short screener, X/Twitter narrative, project directory — separate specs.
- Persisting news history or building a "news archive" view.
- Per-pool news widget on the pool detail page (may be a follow-up, not required now).
- Revisiting CryptoPanic (or another paid news API) as a Plus-tier upgrade later, if
  the free RSS aggregator's coin-filtering precision proves too coarse in practice.
