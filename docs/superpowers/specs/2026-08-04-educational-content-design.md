# Educational Content (Tooltips, Page Blurbs, FAQ) — Design

## Context

The dashboard's Pools, News, and Screener pages assume the reader already knows DLMM,
funding rates, and crypto-news jargon. The user wants beginners (new to web3/crypto)
to be able to understand the dashboard without leaving it. This request originally
also included a new Screener metric ("2:1 long/short ratio") intended as a future
paid feature — that was split out during brainstorming and deferred to whenever the
Stripe/payment module (not yet built) is designed, so the gating UI is built once,
correctly, rather than built now and reworked later. This spec covers only the
educational content: inline tooltips, short page-top blurbs, and a new FAQ page.

## Goal

A first-time web3/crypto user can look at any table on Pools, News, or Screener,
understand every column/label without external research, and find a categorized,
skimmable reference page (`/faq`) for anything not answered inline.

## Content source of truth

**`frontend/src/content/glossary.ts`** — a single array every tooltip and the FAQ
page both read from, so a term is never defined twice with two different wordings:

```typescript
export type GlossaryCategory = 'web3-basics' | 'dlmm' | 'trading' | 'news';

export interface GlossaryEntry {
  key: string;
  term: string;
  shortDefinition: string; // 1 sentence, used in tooltips
  longDefinition: string;  // 2-4 sentences, used on the FAQ page
  category: GlossaryCategory;
}
```

Full entry list (24 terms, grouped by category — this is the actual content, not a
placeholder; the implementation plan transcribes this list verbatim):

**`web3-basics`**
- **Wallet** — App/device that holds the cryptographic keys proving you own crypto
  assets (e.g. Phantom, Solflare on Solana). It doesn't store money physically — it
  stores the private key that proves ownership on the blockchain.
- **Blockchain** — A digital ledger recorded together by many independent computers
  (nodes), controlled by no single party, and very hard to alter once recorded.
- **Token / Cryptocurrency** — A digital asset that lives on a blockchain — a
  currency (SOL, BTC) or a project's own token representing some other value.
- **Solana** — A layer-1 blockchain known for fast, cheap transactions. This
  dashboard focuses on the Solana ecosystem — Meteora's DLMM pools live here.
- **Stablecoin** — A token pegged to a stable asset (usually USD), e.g. USDC. Used so
  its value doesn't swing wildly like most other tokens.

**`dlmm`**
- **Liquidity Pool** — A pool of two tokens deposited by users (liquidity providers,
  "LPs") so others can swap between them; LPs earn a share of the swap fees in return.
- **DLMM (Dynamic Liquidity Market Maker)** — Meteora's automated market maker model,
  which splits a price range into discrete "bins" instead of a smooth curve
  (unlike classic constant-product AMMs like Uniswap v2) — allowing more
  concentrated liquidity and dynamic fees.
- **Bin step** — The price "step size" between adjacent bins in a DLMM pool (in
  basis points). A smaller bin step means tighter, more precise price granularity.
- **TVL (Total Value Locked)** — The total current dollar value of both tokens
  deposited in a pool.
- **Fee APR** — An estimate of the annualized return LPs earn from swap fees,
  projected from the last 24 hours of fees.
- **Impermanent Loss (IL)** — The value difference between providing liquidity in a
  pool versus simply holding the same tokens in a wallet, caused by the pool's
  price moving while you're providing liquidity.
- **Net Yield** — Fees earned minus estimated impermanent loss — the number that
  answers "was providing liquidity here actually better than just holding?"
- **Strategy: Spot / Curve / Bid-Ask** — Three liquidity distribution shapes in
  DLMM: Spot spreads evenly across the whole range, Curve concentrates near the
  current price, Bid-Ask concentrates at both ends of the range (like an order book).

**`trading`**
- **Long** — A position that profits when the price goes up (betting the price will rise).
- **Short** — A position that profits when the price goes down (betting the price
  will fall).
- **Funding Rate** — A periodic payment between long and short traders in perpetual
  futures markets, keeping the futures price close to the spot price. A positive
  funding rate means longs are paying shorts — a sign more traders are long.
- **Long/Short Ratio** — The ratio of accounts holding long positions versus short
  positions on a pair — an indicator of which way the market is leaning.
- **Market Cap Rank** — A coin's rank by total market value (price × circulating
  supply) versus other coins — a lower number (#1, #2) means a larger, more
  established coin.
- **Trending** — A coin that's currently getting a lot of search attention on a given
  platform (here, CoinGecko) — a signal of market attention, **not** a guarantee the
  price will rise.

**`news`**
- **Bullish** — Sentiment/opinion that the price will rise.
- **Bearish** — Sentiment/opinion that the price will fall.
- **FUD (Fear, Uncertainty, Doubt)** — News or narratives — intentional or not — that
  spread fear or doubt, often triggering panic selling and price drops.
- **FOMO (Fear Of Missing Out)** — The psychological urge to buy quickly out of fear
  of missing a price rise — often leads people to buy right at a local peak.
- **Why news moves price** — Crypto markets are heavily sentiment-driven; news
  (regulation, institutional adoption, hacks, etc.) can shift perceived risk fast,
  triggering mass buying or selling.
- **Why multiple sources** — This dashboard aggregates several outlets (CoinDesk,
  Cointelegraph, The Block, Decrypt) so you're not relying on one outlet's bias or
  blind spots.

## Architecture

Purely additive frontend content — no backend changes, no new network calls, no new
async state.

- **`components/Tooltip.tsx`** — a small reusable primitive:
  `<Tooltip termKey="binStep">bin step</Tooltip>`. Renders its children with a
  dotted underline and a small "ⓘ" marker; the popover (the glossary entry's
  `shortDefinition`) opens on hover **and** on keyboard focus (so it's usable without
  a mouse), and is positioned to stay within the viewport.
- **`pages/FaqPage.tsx`** — renders the glossary grouped by category as four
  collapsible sections (accordion — click a question to expand its `longDefinition`),
  in the fixed order Web3 Basics → DLMM & Liquidity Pools → Screener & Trading →
  Reading Crypto News, preceded by a short "About this dashboard" section (not from
  the glossary — dashboard purpose + the same "not financial advice" framing already
  used on the Screener's trending panel).
- **Page-top blurbs**: one or two plain sentences (no component needed, just JSX) at
  the top of `PoolListPage.tsx`, `NewsPage.tsx`, and `ScreenerPage.tsx`, explaining
  what the page shows before the reader hits any jargon.

## Components touched

- `frontend/src/content/glossary.ts` (new) — the 24-entry content array above.
- `frontend/src/components/Tooltip.tsx` (new).
- `frontend/src/pages/FaqPage.tsx` (new).
- `frontend/src/pages/PoolListPage.tsx` — add intro blurb.
- `frontend/src/components/PoolTable.tsx` — wrap TVL / Volume (24h) / Fee APR (est.)
  headers in `<Tooltip>`.
- `frontend/src/pages/PoolDetailPage.tsx` — wrap the TVL / Fees (24h) / Fee APR (est.)
  stat tile labels, and the IL calculator's "Impermanent loss", "Net yield", and
  "Strategy" labels, in `<Tooltip>`.
- `frontend/src/pages/NewsPage.tsx` — add intro blurb + a collapsible "How to read
  crypto news" panel (Bullish/Bearish/FUD/FOMO/why-news-moves-price/why-multiple-sources,
  static content, same for every article — no per-article AI analysis).
- `frontend/src/pages/ScreenerPage.tsx` — add intro blurb.
- `frontend/src/components/PositioningTable.tsx` — wrap Long/Short Ratio / Funding
  Rate / 24h Change headers in `<Tooltip>`.
- `frontend/src/components/TrendingWatch.tsx` — wrap the `rank #X` label in `<Tooltip>`.
- `frontend/src/components/Layout.tsx` — add a "FAQ" nav link.
- `frontend/src/App.tsx` — add the `/faq` route.

## Data flow & error handling

None — static content, no network calls, nothing that can fail at runtime beyond
what already exists on each page.

## Testing

Consistent with this project's established pattern: no unit tests for static content
or presentational components (every prior UI-only module — news, screener, pool
pages — has none; only `il.ts`/`yield.ts`, the actual math, have unit tests). Verified
manually in the browser via a Playwright screenshot check: tooltips render and are
keyboard-focusable, the FAQ page's four sections expand/collapse and show the right
content, and — as a regression check — Pools/News/Screener still render correctly
with no console errors after the changes.

## Out of scope (this spec)

- The "2:1 long/short ratio" premium Screener metric and any paywall/gating UI —
  deferred to the future Stripe/payment module design, so gating is designed once
  rather than retrofitted.
- Per-article AI-generated news summaries/impact analysis — explicitly rejected in
  favor of one static, general explainer panel (no LLM integration, no added cost,
  consistent with every other module in this project using free/public data sources).
- Any user-editable or CMS-driven content — the glossary is a static TypeScript file,
  not a database table; editing definitions means editing code, which is appropriate
  for a portfolio-scale project with no non-technical content editor.
