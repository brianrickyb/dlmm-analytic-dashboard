# Pump Watch — Design

## Context

The Screener page currently has two panels, both reflecting *someone else's* ranking:
`PositioningTable` (Bybit funding rate/long-short ratio for a fixed list of 15 major pairs)
and `TrendingWatch` (CoinGecko's own curated "trending" list, ~15 coins, based on their
search-interest algorithm). Neither can catch a fast, unanticipated pump on a freshly
launched micro-cap token (the user's concrete example: a TUTUSDT-style move) — the Bybit
pair list is hardcoded to established majors, and CoinGecko's trending algorithm only
surfaces a coin after enough web traffic accumulates, which lags the move itself.

The user wants a third panel that computes its **own** pump signal from raw on-chain pool
data, early enough to be useful, plus a best-effort link to any news coverage that
already exists for a flagged token.

## Goal

Add a **Pump Watch** panel to the Screener page: a list of freshly created, high-momentum
liquidity pools across all chains GeckoTerminal indexes, computed from our own thresholds
(not a third party's trending algorithm), each optionally annotated with a recent news
link if one exists. Read-only, informational — like every other Screener panel, explicitly
not investment advice.

## Non-goals (explicitly out of scope, decided during brainstorming)

- **Not Solana-only.** General crypto market, same breadth as the existing Positioning
  panel — confirmed with the user.
- **Not the X/Twitter API.** X removed its free tier in Feb 2026 (pay-per-read, no free
  allowance) — out of step with every other integration in this project, which are all
  free/keyless. Declined by the user once this was surfaced.
- **Not Orion Terminal.** `orionterminal.com`'s screener API is unofficial (reverse-
  engineered, undocumented) and, confirmed by directly probing it, sits behind a
  Cloudflare bot challenge — a plain server-side `fetch()` (the pattern every other
  integration in this backend uses) cannot reach it at all without a headless browser.
  Declined by the user once this was surfaced.
- **Not WebSocket/push.** The user chose faster polling (1–2 min) over a real infra
  change; no part of this project uses WebSockets today.
- **Not a replacement for `TrendingWatch`.** That panel keeps showing CoinGecko's own
  trending algorithm as-is; Pump Watch is additive, a third panel, not a replacement.

## Data sources

### 1. GeckoTerminal — primary, new signal

Free, keyless, public API. Verified directly against the live endpoint during design
(not assumed from docs) — `GET https://api.geckoterminal.com/api/v2/networks/new_pools`
(all networks, no `{network}` path segment) returns, per pool:

```json
{
  "data": [
    {
      "id": "solana_GGfVS3SeLqrpufvMbi1KBwKw1ozqmRi2SjYJt7ew1LY5",
      "type": "pool",
      "attributes": {
        "name": "$VOLT / USDC",
        "pool_created_at": "2026-08-09T16:37:55Z",
        "price_change_percentage": { "m5": "0", "m15": "0", "h1": "0", "h6": "0", "h24": "0" },
        "volume_usd": { "m5": "18.49", "h1": "18.49", "h6": "18.49", "h24": "18.49" },
        "reserve_in_usd": "3187.88"
      },
      "relationships": {
        "network": { "data": { "id": "solana", "type": "network" } },
        "dex": { "data": { "id": "pump-fun", "type": "dex" } }
      }
    }
  ]
}
```

Confirmed live: this endpoint already indexes `pump-fun` (a well-known Solana memecoin
launchpad) pools minutes after creation — exactly the kind of source a TUTUSDT-style
event would show up in first, well before it reaches a centralized-exchange pair list or
a general-purpose news outlet.

Notes for implementation (not fully nailed down here, confirm against the live response
when building — the same "verify against the real thing" approach used for the Meteora
SDK and Bybit/CoinGecko integrations earlier in this project):
- `price_change_percentage.*` and `volume_usd.*` are returned as **strings**, need
  `Number()` parsing.
- Base token symbol is not a separate field on the pool — parse it from `attributes.name`
  (format `"SYMBOL / QUOTE"` or `"SYMBOL / QUOTE 0.25%"` for pools with a fee tier
  suffix) by taking the text before the first `/ `. Good enough for display and for the
  CryptoPanic currency-filter lookup; does not need the token's contract address or
  decimals for this feature.
- Multiple pages exist (`?page=1`, `?page=2`, ...) — fetch enough pages to have a
  reasonable candidate pool before filtering (see Detection heuristic below).

### 2. CryptoPanic — news correlation

Requires a free account and `auth_token` (unlike GeckoTerminal/CoinGecko/Bybit, which are
fully keyless) — the user needs to sign up at `cryptopanic.com/developers/api/keys` and
provide the token via a new `CRYPTOPANIC_API_KEY` env var before this feature can run.
Endpoint: `GET https://cryptopanic.com/api/v1/posts/?auth_token=...&currencies=SYMBOL`.
Supports filtering by ticker symbol directly, which is exactly the per-candidate lookup
this feature needs (query by the base token symbol parsed above).

### 3. Existing sources — unchanged

`PositioningTable`/Bybit and `TrendingWatch`/CoinGecko keep working exactly as they do
today; nothing about this feature touches them.

## Detection heuristic

A GeckoTerminal pool becomes a Pump Watch **candidate** when it passes all three:

| Rule | Threshold | Why |
|---|---|---|
| Pool age | `pool_created_at` within the last **72 hours** | "New" pool — this is what makes it plausible nobody's anticipated it yet |
| Momentum | `price_change_percentage.h6` ≥ **25%** | 6h window, not 1h/5m — filters out single-trade noise on a thin pool while still catching a same-day move |
| Liquidity floor | `volume_usd.h24` ≥ **$50,000** | Filters out dead/wash-traded dust pools that technically pass the price-change rule on two trades |

Candidates are sorted by `price_change_percentage.h6` descending, top **15** kept — same
list length as `TrendingWatch`, for visual consistency on the page.

These three numbers are starting defaults, not something the user asked to be tuned
precisely — the implementation plan should make them named constants in one place so
they're trivial to adjust after seeing real results.

## News correlation flow

For each of the (up to 15) candidates, after the heuristic filter runs:
1. Query CryptoPanic with `currencies=<parsed base token symbol>`.
2. Take the single most recent result, if any, **and** only use it if its `published_at`
   is within the last 48 hours (an old, unrelated article for a common ticker symbol
   shouldn't be shown as if it explains today's move).
3. If a fresh article exists: candidate gets a "News" `Badge` (existing shared component)
   linking to it. If not: candidate is still shown, just without the badge — the absence
   of coverage is itself informative for "a token nobody's anticipated yet," not an error
   state.

CryptoPanic failing entirely (network error, bad token, rate limited) degrades the same
way per-candidate: candidates still render, just with no News badges anywhere — GeckoTerminal
being reachable is what gates whether the panel renders at all; CryptoPanic is best-effort.

## Backend architecture

**New files:**
- `backend/src/services/geckoterminal.ts` — fetches + parses `new_pools`, applies the
  three-rule heuristic, returns typed candidates. Same shape as `bybit.ts`/`coingecko.ts`:
  a `createGeckoTerminalService(deps)` factory taking an injectable `fetchImpl`/`now`,
  in-memory cache with TTL.
- `backend/src/services/cryptopanic.ts` — `createCryptoPanicService(deps)` factory,
  `getRecentNewsForSymbol(symbol)` method, its own in-memory cache keyed by symbol (short
  TTL, since it's queried once per candidate per refresh cycle).

**Modified:**
- `backend/src/routes/screener.ts` — new `GET /api/screener/pump-watch` endpoint.
  Composes: call GeckoTerminal service for candidates, then call the CryptoPanic service
  once per candidate (`Promise.all`, matching the existing `fetchAccountRatio` fan-out
  pattern in `bybit.ts`), return the combined list.
- `backend/.env.example` — add `CRYPTOPANIC_API_KEY=`.

**Cache TTL:** 90 seconds for both new services — within the "faster polling, 1–2 min"
range the user approved, same in-memory-cache-in-the-service-factory pattern already used
by every existing Screener data source (no new caching mechanism introduced).

## Frontend architecture

**New files:**
- `frontend/src/components/PumpWatch.tsx` — loading/error/ready states, same shape as
  `TrendingWatch.tsx` it sits next to: wrapped row of pill-cards (`rounded-xl`, `--surface-1`/
  `--border` tokens), each showing symbol, network, 6h % change (`--status-good`/
  `--status-critical` colored, same convention as the rest of Screener), 24h volume, pool
  age, and the News `Badge` when applicable. Error state uses the existing `PillButton`
  retry pattern.
- `frontend/src/lib/api/screener.ts` — add a `fetchPumpWatch()` call alongside the
  existing `fetchMajors`/`fetchTrending`.
- `frontend/src/types/screener.ts` — add a `PumpCandidate` type.

**Modified:**
- `frontend/src/pages/ScreenerPage.tsx` — third `useEffect`/status-state block (mirroring
  the two that already exist for majors/trending) and a third `<div className="space-y-2">`
  section rendering `<PumpWatch />`, below Trending/Narrative Watch.

## Testing

Matches this project's existing convention (no automated frontend component tests
anywhere in this codebase; backend gets unit + route tests):
- `backend/src/services/geckoterminal.test.ts` — heuristic filtering with concrete
  fixtures: a pool that passes all three rules, one each that fails on age/momentum/
  volume alone, and one that's borderline-exact on a threshold (boundary condition).
- `backend/src/services/cryptopanic.test.ts` — symbol lookup, the 48-hour freshness
  cutoff, and the "no article found" case.
- `backend/src/routes/screener.test.ts` — extend with a `pump-watch` route test covering
  the composed response and the CryptoPanic-down-but-GeckoTerminal-up degradation case.
- Frontend: manual Playwright verification of the new panel (loading/error/ready states,
  light+dark), same as every prior visual-only check in this project — no new automated
  component test.

## Open item carried into implementation (not blocking design approval)

The exact GeckoTerminal pagination/page-count needed to reliably gather ≥15 candidates
across all networks (some pages will be mostly filtered out by the heuristic) should be
tuned empirically during implementation against the live endpoint, the same way the
`bybit.ts`/`coingecko.ts` services were built against real API responses rather than
assumed shapes.
