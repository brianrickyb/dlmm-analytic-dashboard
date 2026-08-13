# Dark Terminal Redesign — Design Spec

## Context

The current frontend uses a light/dark auto-theming system (CSS variables following
`prefers-color-scheme`, Geist Sans, warm neutral surfaces). The user commissioned a Figma Make
mockup — a full standalone React+Vite+Tailwind v4 project at
`C:\Users\Brian\Downloads\Website Improvement Suggestions` — proposing a complete visual
redesign: a fixed dark, green-accented, monospace-numeric "terminal" aesthetic. The user wants
the real app to match this reference exactly ("harus sama persis").

The reference is a **pure visual/UX mockup**: every page's data is hardcoded (`Math.random()`
sparklines, static arrays whose numbers happen to match the screenshots) with zero real API
calls. The real app, by contrast, is backed by live data across every page (Meteora pools,
CoinDesk/Cointelegraph/etc. news with real sentiment, Bybit/GeckoTerminal screener data, Supabase
auth, on-chain positions, and the XAU/USD Market Signal feature — ml-service direction model +
FinBERT sentiment + FRED fundamentals + FXStreet/InvestingLive news — built earlier this session).

This spec covers a **full visual redesign of every real page** to match the mockup's design
language, keeping all existing real data/functionality intact, resolved through direct
conversation with the user (recorded below) rather than guessed.

## Confirmed with the user

- **Scope of fidelity**: match the mockup's visual language everywhere, including panels the
  real backend can't currently produce (see "Forex/Gold page" below) — estimate/derive real
  values where a reasonable derivation exists, and clearly label anything that isn't a real live
  signal rather than presenting it as one. Do not silently fabricate.
- **Sequencing**: design system first (this spec + one implementation plan), then implement every
  page in one pass — no per-page pause for review before moving to the next.
- **Light mode**: dropped entirely. One fixed dark palette; no `prefers-color-scheme` branching.
- **Pages not shown in the mockup** (Login, Signup, Account, wallet-connect UI, Add Liquidity
  form): restyled to match too, extrapolating the mockup's visual language since no exact
  reference exists for these.
- **Code style**: translate the mockup's visual result into this codebase's existing convention
  — Tailwind utility classes for layout/spacing, CSS variables (defined once in `index.css`,
  referenced via `var(--token)`) for every themed color — rather than porting the mockup's raw
  inline-style objects verbatim.
- **Panel-by-panel data treatment on the Forex/Gold page** (the one genuinely novel page):
  confirmed below, explicitly adjustable later — visual exactness is the priority now.

## Design system foundation

### Tokens (`frontend/src/index.css`)

Replace the current `:root` / `@media (prefers-color-scheme: dark)` / `[data-theme]` block
structure entirely with one fixed palette (values taken directly from the mockup's
`src/index.css`):

```css
:root {
  --bg: #070c0a;
  --surface: #0d1410;
  --card: #111916;
  --card2: #162019;
  --border: #1a2b1e;
  --border2: #213328;
  --green: #00d47e;
  --green-dim: #00aa63;
  --green-glow: rgba(0, 212, 126, 0.18);
  --green-subtle: rgba(0, 212, 126, 0.07);
  --text: #e2ede5;
  --muted: #52705a;
  --dim: #2e4234;
  --red: #ff4d6a;
  --red-muted: rgba(255, 77, 106, 0.1);
  --amber: #f5a623;
  --amber-muted: rgba(245, 166, 35, 0.1);
}
```

These are new token names, not a reskin of the existing `--text-primary`/`--surface-1`/
`--status-good` names — every existing component's inline `style={{ color: 'var(--old-token)' }}`
usage must be migrated to the new names as part of restyling that component (grep for every
`var(--` usage across `frontend/src` to find them all; there is no aliasing layer, this is a
clean cutover). Mapping from old → new for the migration:

| Old token | New token | Old token | New token |
|---|---|---|---|
| `--text-primary` | `--text` | `--status-good` | `--green` |
| `--text-secondary` | `--muted` (or `--text` if it reads as primary content) | `--status-critical` | `--red` |
| `--text-muted` | `--dim` | `--status-warning` | `--amber` |
| `--surface-1` | `--card` | `--accent` | `--green` |
| `--border` | `--border` (name unchanged, new value) | `--accent-bg` | `--green-subtle` |
| `--gridline` / `--axis` | `--border` / `--dim` | `--accent-fg` | `#000` (mockup's brand-mark uses black-on-green) |

### Typography

Replace `@fontsource/geist-sans` with two Google-Fonts imports matching the mockup exactly:
**Instrument Sans** (400/500/600/700 weights, body/UI text) and **JetBrains Mono** (400-700,
every numeric value — prices, percentages, wallet addresses, dates in data tables). This is a
real, consistent rule already visible across every mockup screenshot: any number or address is
monospace, every label/sentence is Instrument Sans.

### Component reuse strategy

Existing shared components (`StatTile`, `Badge`, `PillButton`, `HistoryChart`, `NewsList`,
`Layout`/`Sidebar`, `Tooltip`) are restyled in place — same props, same call sites, only their
internal `style`/`className` values change to the new tokens. This means every page consuming
them updates automatically without per-page prop changes. New components are added only where
the mockup introduces a pattern with no existing equivalent:

- `MLGauge` — circular 0-100 score gauge (Forex/Gold page)
- `SentimentBar` — bull/bear split bar with sub-breakdown rows (Forex/Gold page)
- `SessionStrip` — Asia/London/NY active-session indicator (Forex/Gold page)
- `TechnicalLevels` — support/resistance list (Forex/Gold page)

`Sidebar.tsx`'s nav restructures to match the mockup's list (Pools, Forex/Gold, Screener, News,
FAQ, My Positions) plus the existing Login/Account link and connected-wallet pill at the bottom,
in the mockup's exact order and icon set (see `Sidebar.tsx` in the reference — icons are inline
SVGs, portable as-is). The reference's separate "Portfolio Showcase" nav button is a Figma Make
scaffold artifact (`ShowcasePage.tsx`) with no equivalent real page or purpose — **excluded from
scope**, not built.

## Per-page treatment

### Pools list, Pool Detail, News, Screener, FAQ, My Positions

Pure styling passes — no data-fetching, routing, or component-prop changes. Restyle to match the
corresponding reference screenshot exactly:

- **Pools list**: stat-tile row (Total TVL / 24h Volume / Active Pools) styled per the mockup
  (Total TVL gets the green "hero" tinted-pill treatment, the other two are plain cards), table
  rows with monospace numeric columns, green fee-APR values, hover/active row states.
- **Pool Detail**: same stat-tile row pattern for TVL/Volume/Fees/Fee APR, three small line
  charts (TVL, Volume, Fee APR) restyled with the new grid/axis/tooltip colors, the IL calculator
  form and Add Liquidity form restyled to the mockup's input/label treatment (no exact reference
  for these two — extrapolate the same card/input language used elsewhere on the page).
- **News**: headline cards, `NEGATIVE`/`NEUTRAL`/`POSITIVE` sentiment pills (red/gray/green),
  source-filter pill row, coin-filter input — all restyled 1:1 from the News screenshot.
- **Screener**: Market Positioning table with the mockup's green-outlined-row treatment for
  `LONG-LEANING` pairs and red-tag treatment for `SHORT-LEANING` pairs (screenshot shows this
  clearly); Trending Watch and Pump Watch panels (not in the mockup) follow the same table/card
  language as Market Positioning.
- **FAQ**: collapsible sections restyled to the mockup's accordion look (▶ marker, card
  background, section-group headers in green).
- **My Positions**: position cards restyled per the mockup's card treatment (pool address,
  position address, "View on Solscan" link in green).

### Login, Signup, Account, wallet-connect, Add Liquidity form

No mockup reference. Extrapolate the same card/input/button/badge language established across
the pages above: dark card backgrounds (`--card`), green primary actions (`PillButton`
`variant="solid"` already maps to `--green`/black text), monospace for wallet addresses,
`--border`/`--border2` for input outlines.

## Forex/Gold page (`MarketSignalPage.tsx` → redesigned)

The one page requiring real design decisions beyond pure restyling, since the mockup's
`ForexPage.tsx` shows panels with no current real data source. Confirmed treatment per panel:

**Restyle only (already real, already built):**
- Price header (current price, day change, timeframe context) — real, from existing
  `xauHistoryService`/`/signal` data.
- Price chart with 1W/1M/3M toggle — real price history; the toggle is new (client-side slicing
  of the already-fetched history array, same technique as the existing `CHART_WINDOW_ROWS` slice,
  just exposed as three buttons instead of one fixed window).
- Macro Fundamentals panel — real FRED data (`fedFundsRate`, `realYield10y`, `cpi`,
  `dollarIndex`), restyled to the mockup's row layout (label + note on the left, value + ▲/▼
  delta on the right). The mockup's extra "Gold ETF Flows" and "COT Managed Money" rows have no
  real source and no reasonable derivation — **dropped**, not faked.
- Gold & Forex News — real FXStreet/InvestingLive articles with real FinBERT `mlSentiment`.
  Keep today's behavior (click title → opens the source article in a new tab) rather than the
  mockup's expand-to-excerpt interaction — our news data has no article-body/excerpt field, and
  inventing excerpt text would be exactly the kind of fabrication this spec avoids elsewhere.

**Real, derived from existing data (new small pieces of logic, not new external integrations):**
- **ML Model Signal gauge (0-100)**: `score = direction === 'bullish' ? 50 + confidence * 50 : 50 - confidence * 50`.
  A direct, honest transform of the real `DirectionResult` already returned by `/signal` — not a
  new number, just a different display scale. Gets its own pure function in `frontend/src/lib/`
  with a Vitest unit test (e.g. `lib/mlGauge.ts`, `computeGaugeScore(direction, confidence)`).
- **Active Sessions strip (Asia/London/NY)**: computed client-side from the current UTC time
  against real market session hours (approx. Asia 00:00-09:00 UTC, London 08:00-17:00 UTC, New
  York 13:00-22:00 UTC — sessions can overlap, more than one may show active). Pure function in
  `frontend/src/lib/`, e.g. `lib/tradingSessions.ts`, unit tested against fixed UTC timestamps.
- **Technical Levels (support/resistance)**: computed from the real price-history array — recent
  N-day high/low as resistance/support, not invented numbers. Pure function in
  `frontend/src/lib/`, e.g. `lib/technicalLevels.ts`, unit tested against a fixed fixture array.

**Real, requires a small ml-service addition (Phase-1-touching):**
- **Trend / Momentum / Volatility rows**: the model's feature-engineering step
  (`ml-service/training/features.py`) already computes real RSI, MA-crossover, and volatility as
  intermediate values during training and serving — `model_store.py`'s `DirectionModel.predict()`
  computes these via `compute_features()` but only returns the final direction+confidence,
  discarding the intermediate feature values. Add these three raw feature values to
  `/predict/direction`'s response (`DirectionResponse` in `schemas.py`), map them to the
  mockup's qualitative labels client-side (e.g., RSI/MA-crossover sign → "Uptrend"/"Downtrend",
  a volatility-feature threshold → "Low"/"Moderate"/"High"). This is the one place this redesign
  touches Python/ml-service code, not just the frontend.
- **"Reversal Risk"**: no single feature maps to this concept directly. Derive heuristically from
  how close `confidence` is to 0.5 (near 50% → higher reversal risk, matching the mockup's
  intent of "how sure is the model") — a clearly-derived heuristic from a real number, documented
  as such in a code comment, not presented as its own independent signal.

**No real path — kept but clearly labeled illustrative, not dropped (per the user's explicit
choice):**
- **Retail (COT) / Institutions / Options market sentiment breakdown**: these require real
  datasets this project has no integration for (CFTC Commitment-of-Traders reports, options-market
  positioning data) — building that integration is a separate project, not a redesign task. The
  panel stays, restyled per the mockup, with a visible **"Illustrative — not a live data source"**
  label (small caption, `--dim` color, matching how this project already handles the ml-service
  model's honest accuracy disclosure elsewhere). The overall Bullish/Bearish split bar above the
  sub-breakdown reuses the same gauge-score derivation (real), so only the three sub-rows
  (Retail/Institutions/Options) carry the illustrative label.

## Testing & verification

- No new component tests — this frontend has zero `.test.tsx` files by established convention;
  verification is `npx tsc -b` per component/page plus manual browser verification.
- New pure-logic derivations (`computeGaugeScore`, `tradingSessions`, `technicalLevels`) get real
  Vitest unit tests in `frontend/src/lib/`, matching how `lib/il.ts`/`lib/yield.ts` are tested
  today — fixed inputs, asserted outputs, no snapshot testing.
- Manual verification matters more than usual here since this is a visual redesign: for every
  restyled page, run the real dev server and take real screenshots (headless Chromium, matching
  the approach already used for the Gold Signal page's Phase 3 verification), compared side by
  side against the corresponding mockup screenshot, in addition to the usual real-data
  end-to-end checks (real Meteora pools, real news, real XAU signal, etc. — nothing here changes
  what data flows through the app, only how it's presented).
- ml-service's `schemas.py`/`model_store.py` change (exposing raw feature values) gets the same
  TDD treatment as the rest of that codebase: a failing pytest first, then the implementation,
  matching the existing `tests/test_direction_route.py` pattern.

## Out of scope

- The reference's `ShowcasePage.tsx` / "Portfolio Showcase" nav entry (Figma Make scaffold
  artifact, no real equivalent).
- Any new external data integration (COT reports, options-market positioning, Gold ETF flow
  data) — explicitly deferred, not part of this redesign.
- Adding NASDAQ/S&P500 or any additional `/markets/:symbol` instrument — this redesign only
  restyles the existing XAU/USD page.
- Changing any real data-fetching, caching, rate-limiting, or backend route contracts from the
  already-shipped XAU Market Signal feature, except the one confirmed `/predict/direction`
  response addition (raw feature values) needed for the Trend/Momentum/Volatility rows.
