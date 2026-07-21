# Long/Short + Narrative Screener Module — Design

## Context

This is the second module in the crypto-screening expansion of the dashboard
(after the news feed). The user's original ask was "top 3 longs and top 3 shorts,"
which turned out to have two distinct sub-goals once clarified:
1. Where is current futures market positioning leaning (majors, liquid pairs)?
2. What's a small/low-cap coin that might be about to move because a narrative is
   forming around it — the "screening awal masih low... karena ada narasi" framing?

These are different signals from different kinds of data, so this spec covers both
as two independent panels on one page rather than pretending they're the same thing.

**Constraint discovered during brainstorming:** Binance's API is blocked from the
user's network (Indonesia). Bybit was confirmed reachable and was verified (via curl)
to expose everything needed on public, unauthenticated endpoints.

## Goal

Show, on one `/screener` page:
- A sortable table of ~15 liquid futures pairs' long/short account positioning and
  funding rate, with the top 3 most long-leaning and top 3 most short-leaning pairs
  visually flagged regardless of current sort.
- A "trending" watchlist of coins seeing a spike in search interest (a narrative-
  forming proxy), biased toward lower market-cap entries, explicitly labeled as an
  attention signal — not a return-potential score.

## Data sources

**Bybit V5 public API** (no key, confirmed reachable) for majors positioning:
- `GET /v5/market/tickers?category=linear` (no `symbol` param) returns funding rate
  and 24h price change for **all** ~755 linear pairs in one call — used once per
  cache refresh, then filtered down to the fixed 15-pair list.
- `GET /v5/market/account-ratio?category=linear&symbol={SYMBOL}&period=5min&limit=1`
  returns `buyRatio`/`sellRatio` (the long/short account ratio) — **no bulk variant
  exists**, so this is one call per pair in the fixed list (15 parallel calls per
  cache miss).
- Fixed pair list: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT,
  AVAXUSDT, LINKUSDT, TONUSDT, SUIUSDT, DOTUSDT, LTCUSDT, TRXUSDT, NEARUSDT.

**CoinGecko public API** (no key, free tier) for the trending panel:
- `GET /api/v3/search/trending` returns up to 15 coins by current search-interest
  ranking, each with `market_cap_rank`, price, 24h price change, symbol/name/thumb.
  Not exchange-specific, so unlikely to share Bybit's/Binance's blocking profile.
  Free tier is rate-limited more aggressively than Bybit, hence the longer cache TTL
  below.

## Architecture

Two new backend endpoints, deliberately **not merged into one response** — their
data sources, cache lifetimes, and failure modes are independent, and a CoinGecko
outage must never blank out the Bybit panel or vice versa.

- `GET /api/screener/majors` — bulk Bybit ticker fetch (1 call) + per-pair
  account-ratio (15 parallel calls, partial-failure tolerant per pair, same pattern
  as the news RSS aggregator: only erroring the whole request if the foundational
  bulk-ticker call itself fails). Cached in-memory, ~5 minute TTL (matches Bybit's
  own `5min` account-ratio granularity).
- `GET /api/screener/trending` — CoinGecko trending fetch, cached in-memory, ~10
  minute TTL (CoinGecko's free tier has a much lower rate limit than Bybit's public
  endpoints, so refresh less often).

## Components

**Backend** (`backend/src/`)
- `services/bybit.ts` — bulk ticker fetch, per-pair account-ratio fetch, merge by
  symbol, partial-failure tolerance, cache, top-3-long/top-3-short computation.
- `services/coingecko.ts` — trending fetch, cache, error classification, sort by
  market-cap rank (descending, so smaller/more speculative entries surface first).
- `routes/screener.ts` — registers both `GET /api/screener/majors` and
  `GET /api/screener/trending`.

**Frontend** (`frontend/src/`)
- `pages/ScreenerPage.tsx` — new route `/screener`; owns two independent
  loading/error/ready states, one per panel.
- `components/PositioningTable.tsx` — sortable table (same interaction pattern as
  the existing `PoolTable`): Symbol, Long/Short Ratio, Funding Rate, 24h Change. The
  top 3 pairs by `buyRatio` are highlighted green ("Long-Leaning"); the bottom 3 are
  highlighted red ("Short-Leaning") — computed from the ratio independent of
  whichever column the user currently has the table sorted by.
- `components/TrendingWatch.tsx` — trending list sorted by market-cap rank
  descending, with a persistent caption clarifying it's a search-interest signal,
  not a recommendation.
- `lib/api/screener.ts` — typed fetch wrappers for both endpoints.
- `types/screener.ts` — shared response types.

## Data flow

1. User opens `/screener`.
2. Frontend calls `GET /api/screener/majors` and `GET /api/screener/trending` in
   parallel and independently — one failing never blocks the other's render.
3. `/api/screener/majors`: check cache → if stale, fetch bulk tickers (1 call) +
   account-ratio (15 parallel calls) → merge by symbol → cache → return.
4. `/api/screener/trending`: check cache → if stale, fetch CoinGecko trending →
   sort by market-cap rank descending → cache → return.
5. Frontend renders each panel from its own state; a slow/failed CoinGecko call
   never delays or blanks the Bybit-backed positioning table.

## Error handling

- **Majors**: an individual pair's account-ratio call failing is tolerated — that
  pair is simply omitted from the ranked table (logged, not surfaced as an error).
  If the foundational bulk-tickers call itself fails, the whole endpoint returns
  `503` (there is no usable data at all without it).
- **Trending**: CoinGecko returning `429`/`5xx` or malformed JSON → endpoint returns
  `502`/`503` with a specific message; the frontend shows an error card with retry
  in the trending panel only.
- Both panels reuse the same loading (skeleton) / empty / error state pattern
  already established by `NewsList` in the news feed module.

## Testing

Testing effort concentrates on the logic most likely to fail silently or produce a
subtly wrong ranking:
- **`services/bybit.ts`**: partial-failure tolerance (some pairs' account-ratio
  calls fail, others succeed — verify the merged result still ranks correctly from
  the successes); total failure when the bulk-ticker call itself fails; cache TTL
  (reuse within window, re-fetch after expiry); and, most importantly, **top-3-long
  / top-3-short computation** from a known set of `buyRatio` values — this is the
  screening module's core value and the part most likely to have an off-by-one or
  sort-direction bug.
- **`services/coingecko.ts`**: error classification (429/5xx/malformed JSON), cache
  TTL, and sort-by-market-cap-rank ordering.
- The frontend is verified manually in a running browser (Playwright screenshot, as
  used for the earlier DLMM and news pages), not with formal unit tests, for this
  MVP.

## Out of scope (this spec)

- X/Twitter narrative module and project directory — separate specs, per the
  original four-module crypto-screening breakdown.
- Any actual "buy/sell signal" or return prediction — the trending panel is
  explicitly a search-interest attention signal, never presented as investment
  advice.
- Persisting screener history or charting positioning/trending over time (no
  historical-trend requirement was raised for this module, unlike DLMM pool data).
- Expanding beyond the fixed 15-pair majors list or beyond CoinGecko's top-15
  trending — both can be revisited later if the fixed lists prove too narrow.
