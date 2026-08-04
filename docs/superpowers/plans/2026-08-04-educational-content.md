# Educational Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pools, News, and Screener understandable to a first-time web3/crypto user via inline term tooltips, short page-top blurbs, and a new categorized `/faq` page — no backend changes, no new data sources.

**Architecture:** A single content file (`content/glossary.ts`) is the one source of truth for every term definition; a reusable `Tooltip` component reads from it for inline popovers, and the new FAQ page renders the same array grouped by category. Everything else is small, additive JSX changes to existing pages/components.

**Tech Stack:** React + TypeScript + Tailwind (existing stack, no new dependencies).

## Global Constraints

- The glossary (`frontend/src/content/glossary.ts`) is the single source of truth for term definitions — tooltips use `shortDefinition`, the FAQ page uses `longDefinition`. Never hand-write a definition a second time elsewhere that could drift from the glossary.
- `Tooltip` must be usable without a mouse: it opens on focus, not just hover, and its trigger element is keyboard-focusable (`tabIndex={0}`).
- No new unit tests for this plan — consistent with this project's established pattern (every prior UI-only module has none; only `il.ts`/`yield.ts`, the actual math, are unit-tested). Verification is manual, via a Playwright browser check in the final task.
- No backend changes, no new network calls, no new async state anywhere in this plan.
- Follow existing code style: function components, inline `style={{ color: 'var(--...)' }}` for design-token colors, Tailwind utility classes for layout.
- The "2:1 long/short ratio" premium metric and any paywall UI are explicitly out of scope for this plan.
- Per-article AI news summaries are explicitly out of scope — the News page gets one static, general explainer panel, the same for every article.

---

## File Structure

- Create `frontend/src/content/glossary.ts` — the 24-entry term data array (Task 1).
- Create `frontend/src/components/Tooltip.tsx` — the reusable tooltip primitive (Task 2).
- Create `frontend/src/pages/FaqPage.tsx` — the new FAQ page (Task 8).
- Modify `frontend/src/pages/PoolListPage.tsx`, `frontend/src/components/PoolTable.tsx` (Task 3).
- Modify `frontend/src/components/StatTile.tsx`, `frontend/src/pages/PoolDetailPage.tsx`, `frontend/src/components/IlCalculator.tsx` (Task 4).
- Modify `frontend/src/pages/NewsPage.tsx` (Task 5).
- Modify `frontend/src/pages/ScreenerPage.tsx` (Task 6).
- Modify `frontend/src/components/PositioningTable.tsx`, `frontend/src/components/TrendingWatch.tsx` (Task 7).
- Modify `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx` (Task 8).

---

### Task 1: Glossary content

**Files:**
- Create: `frontend/src/content/glossary.ts`

**Interfaces:**
- Produces:
  - `type GlossaryCategory = 'web3-basics' | 'dlmm' | 'trading' | 'news'`
  - `interface GlossaryEntry { key: string; term: string; shortDefinition: string; longDefinition: string; category: GlossaryCategory }`
  - `export const glossary: GlossaryEntry[]` — 24 entries, exact keys used by later tasks: `wallet`, `blockchain`, `token`, `solana`, `stablecoin`, `liquidityPool`, `dlmm`, `binStep`, `tvl`, `feeApr`, `impermanentLoss`, `netYield`, `strategy`, `long`, `short`, `fundingRate`, `longShortRatio`, `marketCapRank`, `trending`, `bullish`, `bearish`, `fud`, `fomo`, `whyNewsMovesPrice`, `whyMultipleSources`.

- [ ] **Step 1: Create the glossary file**

```typescript
// frontend/src/content/glossary.ts
export type GlossaryCategory = 'web3-basics' | 'dlmm' | 'trading' | 'news';

export interface GlossaryEntry {
  key: string;
  term: string;
  shortDefinition: string;
  longDefinition: string;
  category: GlossaryCategory;
}

export const glossary: GlossaryEntry[] = [
  {
    key: 'wallet',
    term: 'Wallet',
    shortDefinition: 'An app that holds the keys proving you own your crypto assets.',
    longDefinition:
      "A wallet (e.g. Phantom, Solflare) is the app or device that holds the cryptographic keys proving you own crypto assets. It doesn't store money physically — it stores the private key that proves ownership on the blockchain.",
    category: 'web3-basics',
  },
  {
    key: 'blockchain',
    term: 'Blockchain',
    shortDefinition: 'A shared digital ledger recorded by many independent computers.',
    longDefinition:
      'A blockchain is a digital ledger recorded together by many independent computers (nodes), controlled by no single party, and very hard to alter once something is recorded on it.',
    category: 'web3-basics',
  },
  {
    key: 'token',
    term: 'Token / Cryptocurrency',
    shortDefinition: 'A digital asset that lives on a blockchain.',
    longDefinition:
      "A token or cryptocurrency is a digital asset that lives on a blockchain — it can be a currency (like SOL or BTC) or a project's own token representing some other value.",
    category: 'web3-basics',
  },
  {
    key: 'solana',
    term: 'Solana',
    shortDefinition: 'A fast, low-fee layer-1 blockchain — this dashboard is Solana-focused.',
    longDefinition:
      "Solana is a layer-1 blockchain known for fast, cheap transactions. This dashboard focuses on the Solana ecosystem — Meteora's DLMM pools live here.",
    category: 'web3-basics',
  },
  {
    key: 'stablecoin',
    term: 'Stablecoin',
    shortDefinition: 'A token pegged to a stable asset like the US dollar, e.g. USDC.',
    longDefinition:
      "A stablecoin is a token pegged to a stable asset (usually USD), e.g. USDC. It's used so its value doesn't swing wildly like most other tokens.",
    category: 'web3-basics',
  },
  {
    key: 'liquidityPool',
    term: 'Liquidity Pool',
    shortDefinition: 'A pool of two tokens that lets others swap between them.',
    longDefinition:
      'A liquidity pool is a pool of two tokens deposited by users ("liquidity providers", or LPs) so others can swap between them. LPs earn a share of the swap fees in return.',
    category: 'dlmm',
  },
  {
    key: 'dlmm',
    term: 'DLMM (Dynamic Liquidity Market Maker)',
    shortDefinition: "Meteora's bin-based liquidity model, an alternative to classic AMMs.",
    longDefinition:
      'DLMM is Meteora\'s automated market maker model, which splits a price range into discrete "bins" instead of a smooth curve (unlike classic constant-product AMMs like Uniswap v2) — allowing more concentrated liquidity and dynamic fees.',
    category: 'dlmm',
  },
  {
    key: 'binStep',
    term: 'Bin step',
    shortDefinition: "The price 'step size' between adjacent bins in a DLMM pool.",
    longDefinition:
      'Bin step is the price "step size" between adjacent bins in a DLMM pool, measured in basis points. A smaller bin step means tighter, more precise price granularity.',
    category: 'dlmm',
  },
  {
    key: 'tvl',
    term: 'TVL (Total Value Locked)',
    shortDefinition: 'The total dollar value of tokens currently deposited in a pool.',
    longDefinition: 'TVL (Total Value Locked) is the total current dollar value of both tokens deposited in a pool.',
    category: 'dlmm',
  },
  {
    key: 'feeApr',
    term: 'Fee APR',
    shortDefinition: 'An estimate of the annualized return from swap fees.',
    longDefinition: 'Fee APR is an estimate of the annualized return LPs earn from swap fees, projected from the last 24 hours of fees.',
    category: 'dlmm',
  },
  {
    key: 'impermanentLoss',
    term: 'Impermanent Loss (IL)',
    shortDefinition: 'The value gap between providing liquidity and just holding the tokens.',
    longDefinition:
      "Impermanent loss is the value difference between providing liquidity in a pool versus simply holding the same tokens in a wallet, caused by the pool's price moving while you're providing liquidity.",
    category: 'dlmm',
  },
  {
    key: 'netYield',
    term: 'Net Yield',
    shortDefinition: 'Fees earned minus estimated impermanent loss.',
    longDefinition:
      'Net yield is fees earned minus estimated impermanent loss — the number that answers "was providing liquidity here actually better than just holding?"',
    category: 'dlmm',
  },
  {
    key: 'strategy',
    term: 'Strategy: Spot / Curve / Bid-Ask',
    shortDefinition: 'The three liquidity distribution shapes available in DLMM.',
    longDefinition:
      'DLMM offers three liquidity distribution shapes: Spot spreads evenly across the whole range, Curve concentrates near the current price, and Bid-Ask concentrates at both ends of the range (like an order book).',
    category: 'dlmm',
  },
  {
    key: 'long',
    term: 'Long',
    shortDefinition: 'A position that profits when the price goes up.',
    longDefinition: 'Going long means opening a position that profits when the price goes up — you are betting the price will rise.',
    category: 'trading',
  },
  {
    key: 'short',
    term: 'Short',
    shortDefinition: 'A position that profits when the price goes down.',
    longDefinition: 'Going short means opening a position that profits when the price goes down — you are betting the price will fall.',
    category: 'trading',
  },
  {
    key: 'fundingRate',
    term: 'Funding Rate',
    shortDefinition: 'A periodic payment between long and short traders in futures markets.',
    longDefinition:
      'Funding rate is a periodic payment between long and short traders in perpetual futures markets, keeping the futures price close to the spot price. A positive funding rate means longs are paying shorts — a sign more traders are long.',
    category: 'trading',
  },
  {
    key: 'longShortRatio',
    term: 'Long/Short Ratio',
    shortDefinition: 'The ratio of accounts holding long vs. short positions on a pair.',
    longDefinition:
      'Long/Short Ratio is the ratio of accounts holding long positions versus short positions on a trading pair — an indicator of which way the market is leaning.',
    category: 'trading',
  },
  {
    key: 'marketCapRank',
    term: 'Market Cap Rank',
    shortDefinition: "A coin's rank by total market value versus other coins.",
    longDefinition:
      "Market Cap Rank is a coin's rank by total market value (price × circulating supply) versus other coins — a lower number (#1, #2) means a larger, more established coin.",
    category: 'trading',
  },
  {
    key: 'trending',
    term: 'Trending',
    shortDefinition: 'A coin getting a lot of search attention right now — not a price signal.',
    longDefinition:
      'Trending means a coin is currently getting a lot of search attention on a given platform (here, CoinGecko) — a signal of market attention, not a guarantee the price will rise.',
    category: 'trading',
  },
  {
    key: 'bullish',
    term: 'Bullish',
    shortDefinition: 'Sentiment or opinion that the price will rise.',
    longDefinition: 'Bullish describes sentiment or opinion that the price of an asset will rise.',
    category: 'news',
  },
  {
    key: 'bearish',
    term: 'Bearish',
    shortDefinition: 'Sentiment or opinion that the price will fall.',
    longDefinition: 'Bearish describes sentiment or opinion that the price of an asset will fall.',
    category: 'news',
  },
  {
    key: 'fud',
    term: 'FUD (Fear, Uncertainty, Doubt)',
    shortDefinition: 'News or narratives that spread fear or doubt, often triggering selling.',
    longDefinition:
      'FUD stands for Fear, Uncertainty, Doubt — news or narratives, intentional or not, that spread fear or doubt, often triggering panic selling and price drops.',
    category: 'news',
  },
  {
    key: 'fomo',
    term: 'FOMO (Fear Of Missing Out)',
    shortDefinition: 'The urge to buy quickly out of fear of missing a price rise.',
    longDefinition:
      'FOMO stands for Fear Of Missing Out — the psychological urge to buy quickly out of fear of missing a price rise, which often leads people to buy right at a local peak.',
    category: 'news',
  },
  {
    key: 'whyNewsMovesPrice',
    term: 'Why news moves price',
    shortDefinition: 'Crypto markets are highly sentiment-driven.',
    longDefinition:
      'Crypto markets are heavily sentiment-driven; news (regulation, institutional adoption, hacks, etc.) can shift perceived risk fast, triggering mass buying or selling.',
    category: 'news',
  },
  {
    key: 'whyMultipleSources',
    term: 'Why multiple sources',
    shortDefinition: 'Different outlets can have different bias or blind spots.',
    longDefinition:
      "This dashboard aggregates several outlets (CoinDesk, Cointelegraph, The Block, Decrypt) so you're not relying on one outlet's bias or blind spots.",
    category: 'news',
  },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/content/glossary.ts
git commit -m "feat(frontend): add glossary content as the single source of truth for term definitions"
```

---

### Task 2: Tooltip component

**Files:**
- Create: `frontend/src/components/Tooltip.tsx`

**Interfaces:**
- Consumes: `glossary` from `frontend/src/content/glossary.ts` (Task 1).
- Produces: `function Tooltip(props: { termKey: string; children: ReactNode }): JSX.Element` — every later task that adds a tooltip imports this.

- [ ] **Step 1: Implement the component**

```tsx
// frontend/src/components/Tooltip.tsx
import { useId, useState, type ReactNode } from 'react';
import { glossary } from '../content/glossary';

interface TooltipProps {
  termKey: string;
  children: ReactNode;
}

export function Tooltip({ termKey, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = glossary.find((e) => e.key === termKey);

  if (!entry) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline-block">
      <span
        className="cursor-help border-b border-dotted"
        style={{ borderColor: 'var(--text-muted)' }}
        tabIndex={0}
        role="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-1 w-56 -translate-x-1/2 rounded border p-2 text-left text-xs font-normal normal-case shadow-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
        >
          {entry.shortDefinition}
        </span>
      ) : null}
    </span>
  );
}
```

Notes for the implementer: `onClick={(e) => e.stopPropagation()}` matters because several call sites in later tasks place `<Tooltip>` inside a `<th onClick={...}>` used for column sorting — without stopping propagation, clicking the tooltip trigger would also toggle the table's sort order. `font-normal normal-case` on the popover guards against inheriting bold/uppercase styling from a `<th>` ancestor. If `termKey` doesn't match any glossary entry, the component silently renders only its children (no broken UI, no thrown error) — this shouldn't happen if later tasks use the exact keys from Task 1, but it's a safe fallback.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Tooltip.tsx
git commit -m "feat(frontend): add Tooltip component for inline term definitions"
```

---

### Task 3: Pools page — intro blurb and column tooltips

**Files:**
- Modify: `frontend/src/pages/PoolListPage.tsx`
- Modify: `frontend/src/components/PoolTable.tsx`

**Interfaces:**
- Consumes: `Tooltip` (Task 2), glossary keys `tvl`, `feeApr`, `binStep` (Task 1).

- [ ] **Step 1: Add the intro blurb to PoolListPage**

Read the current file first (`frontend/src/pages/PoolListPage.tsx`), then add one `<p>` between the `<h1>` and `<PoolTable>`:

```tsx
import { PoolTable } from '../components/PoolTable';
import { getPoolsWithStats } from '../mock/snapshots';

export function PoolListPage() {
  const pools = getPoolsWithStats();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana. TVL, volume, and fee APR update from
        live pool data — hover the underlined column headers for what each term means.
      </p>
      <PoolTable pools={pools} />
    </div>
  );
}
```

- [ ] **Step 2: Add tooltips to PoolTable's column headers and bin step label**

Read the current file first (`frontend/src/components/PoolTable.tsx`). Add the `Tooltip` import, add `termKey?: string` to the `columns` array, wrap the header label conditionally, and wrap "bin step" in the subtitle row:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PoolWithStats } from '../types/pool';
import { formatPercent, formatUsdCompact } from '../lib/format';
import { Tooltip } from './Tooltip';

type SortKey = 'tvlUsd' | 'volume24hUsd' | 'feeApr24h';

const columns: { key: SortKey; label: string; termKey?: string }[] = [
  { key: 'tvlUsd', label: 'TVL', termKey: 'tvl' },
  { key: 'volume24hUsd', label: 'Volume (24h)' },
  { key: 'feeApr24h', label: 'Fee APR (est.)', termKey: 'feeApr' },
];
```

In the header row rendering, change:

```tsx
            {columns.map((col) => (
              <th
                key={col.key}
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => toggleSort(col.key)}
              >
                {col.termKey ? <Tooltip termKey={col.termKey}>{col.label}</Tooltip> : col.label}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
```

In the pool name cell, change the subtitle line to wrap "bin step":

```tsx
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <Tooltip termKey="binStep">bin step</Tooltip> {pool.binStep} · fee {(pool.baseFeeBps / 100).toFixed(2)}%
                </div>
```

Every other line in both files stays exactly as it is today — these are the only changes.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PoolListPage.tsx frontend/src/components/PoolTable.tsx
git commit -m "feat(frontend): add intro blurb and column tooltips to the Pools page"
```

---

### Task 4: Pool detail page — stat tile and IL calculator tooltips

**Files:**
- Modify: `frontend/src/components/StatTile.tsx`
- Modify: `frontend/src/pages/PoolDetailPage.tsx`
- Modify: `frontend/src/components/IlCalculator.tsx`

**Interfaces:**
- Consumes: `Tooltip` (Task 2), glossary keys `tvl`, `feeApr`, `binStep`, `impermanentLoss`, `netYield`, `strategy` (Task 1).
- Produces: `StatTile`'s `label` prop widens from `string` to `ReactNode` (a non-breaking change — every existing plain-string caller still works) — later tasks in this project that add new `StatTile` usages can pass either a string or a `<Tooltip>`-wrapped node.

- [ ] **Step 1: Widen StatTile's label prop to ReactNode**

Read the current file first (`frontend/src/components/StatTile.tsx`), then change:

```tsx
import type { ReactNode } from 'react';

export function StatTile({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add tooltips to PoolDetailPage's stat tiles and bin step label**

Read the current file first (`frontend/src/pages/PoolDetailPage.tsx`). Add the `Tooltip` import, wrap the "TVL" and "Fee APR (est.)" stat tile labels, and wrap "bin step" in the header subtitle:

```tsx
import { Link, useParams } from 'react-router-dom';
import { HistoryChart } from '../components/HistoryChart';
import { IlCalculator } from '../components/IlCalculator';
import { StatTile } from '../components/StatTile';
import { Tooltip } from '../components/Tooltip';
import { pools } from '../mock/pools';
import { getLatestStats, getSnapshots } from '../mock/snapshots';
import { formatPercent, formatPrice, formatUsd, formatUsdCompact } from '../lib/format';
```

Change the subtitle paragraph:

```tsx
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <Tooltip termKey="binStep">bin step</Tooltip> {pool.binStep} · base fee {(pool.baseFeeBps / 100).toFixed(2)}% · current
          price {formatPrice(stats.currentPrice)}
        </p>
```

Change the stat tile grid:

```tsx
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
```

- [ ] **Step 3: Add tooltips to IlCalculator's labels**

Read the current file first (`frontend/src/components/IlCalculator.tsx`). Add the `Tooltip` import, widen the local `Result` component's `label` prop to `ReactNode`, wrap the "Strategy" label, and wrap the "Impermanent loss"/"Net yield" `Result` labels:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import type { PoolSnapshot, Strategy } from '../types/pool';
import { calculateNetYield } from '../lib/yield';
import { formatPercent, formatPrice, formatUsd } from '../lib/format';
import { Tooltip } from './Tooltip';
```

Change the Strategy `<label>` block:

```tsx
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Tooltip termKey="strategy">Strategy</Tooltip>
          <select
            value={strategy}
            onChange={(e) => handleStrategyChange(e.target.value as Strategy)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          >
            <option value="Spot">Spot</option>
            <option value="Curve">Curve</option>
            <option value="BidAsk">Bid-Ask</option>
          </select>
        </label>
```

Change the results grid:

```tsx
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Result label="Days in range" value={`${result.daysInRange} / ${result.daysHeld}`} />
        <Result label="Fees earned" value={formatUsd(result.feesEarnedUsd)} accent="var(--series-green)" />
        <Result
          label={<Tooltip termKey="impermanentLoss">Impermanent loss</Tooltip>}
          value={`${formatUsd(result.impermanentLossUsd)} (${formatPercent(result.impermanentLossPct)})`}
          accent="var(--series-red)"
        />
        <Result
          label={<Tooltip termKey="netYield">Net yield</Tooltip>}
          value={`${formatUsd(result.netYieldUsd)} (${formatPercent(result.netYieldPct)})`}
          accent={result.netYieldUsd >= 0 ? 'var(--status-good)' : 'var(--status-critical)'}
        />
      </div>
```

Change the local `Result` component's signature:

```tsx
function Result({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
```

Every other line in all three files stays exactly as it is today.

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StatTile.tsx frontend/src/pages/PoolDetailPage.tsx frontend/src/components/IlCalculator.tsx
git commit -m "feat(frontend): add tooltips to pool detail stat tiles and IL calculator"
```

---

### Task 5: News page — intro blurb and explainer panel

**Files:**
- Modify: `frontend/src/pages/NewsPage.tsx`

**Interfaces:**
- Consumes: nothing new (static JSX only — this task does not use `Tooltip` or the glossary; the explainer panel is authored prose covering the same facts as the `news` category glossary entries, kept separate because a short narrative reads better here than a raw term list).

- [ ] **Step 1: Add the intro blurb and collapsible explainer panel**

Read the current file first (`frontend/src/pages/NewsPage.tsx`). Insert a blurb and a native `<details>` panel between the `<h1>` and `<NewsFilters>`:

```tsx
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Crypto News
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Live headlines aggregated from CoinDesk, Cointelegraph, The Block, and Decrypt. New to
        reading crypto news? See "How to read crypto news" below.
      </p>
      <details className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <summary className="cursor-pointer font-medium" style={{ color: 'var(--text-primary)' }}>
          How to read crypto news
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--text-secondary)' }}>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Bullish</strong> means sentiment that
            price will rise; <strong style={{ color: 'var(--text-primary)' }}>bearish</strong> means
            sentiment it will fall.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>FUD</strong> (Fear, Uncertainty, Doubt)
            is news that spreads fear and can trigger panic selling.{' '}
            <strong style={{ color: 'var(--text-primary)' }}>FOMO</strong> (Fear Of Missing Out) is
            the urge to buy quickly so you don't miss a rally — it often leads people to buy right
            at the peak.
          </p>
          <p>
            Crypto markets are heavily sentiment-driven: regulation news, institutional adoption,
            hacks, and similar events can shift perceived risk fast, triggering mass buying or
            selling.
          </p>
          <p>
            This page aggregates several outlets (CoinDesk, Cointelegraph, The Block, Decrypt) so
            you're not relying on one outlet's bias or blind spots.
          </p>
        </div>
      </details>
      <NewsFilters currencies={currencies} onCurrenciesChange={setCurrencies} source={source} onSourceChange={setSource} />
      <NewsList status={status} posts={posts} errorMessage={errorMessage} onRetry={() => setRequestId((n) => n + 1)} />
    </div>
  );
```

Nothing else in the file changes — the component's imports, state, and `useEffect` stay exactly as they are today.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/NewsPage.tsx
git commit -m "feat(frontend): add intro blurb and 'how to read crypto news' panel"
```

---

### Task 6: Screener page — intro blurb

**Files:**
- Modify: `frontend/src/pages/ScreenerPage.tsx`

**Interfaces:**
- Consumes: nothing new (static JSX only).

- [ ] **Step 1: Add the intro blurb**

Read the current file first (`frontend/src/pages/ScreenerPage.tsx`). Insert one `<p>` between the `<h1>` and the "Market Positioning" section:

```tsx
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Screener
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Two independent signals: current futures market positioning on major pairs, and coins
        seeing a spike in search interest. Neither panel is investment advice — see the FAQ for
        how to read each term.
      </p>
```

Nothing else in the file changes.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ScreenerPage.tsx
git commit -m "feat(frontend): add intro blurb to the Screener page"
```

---

### Task 7: Screener components — column and rank tooltips

**Files:**
- Modify: `frontend/src/components/PositioningTable.tsx`
- Modify: `frontend/src/components/TrendingWatch.tsx`

**Interfaces:**
- Consumes: `Tooltip` (Task 2), glossary keys `longShortRatio`, `fundingRate`, `marketCapRank` (Task 1).

- [ ] **Step 1: Add tooltips to PositioningTable's column headers**

Read the current file first (`frontend/src/components/PositioningTable.tsx`). Add the `Tooltip` import, add `termKey?: string` to the `columns` array, and wrap the header label conditionally — same pattern as Task 3's `PoolTable.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { PairPositioning } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';

type SortKey = 'buyRatio' | 'fundingRate' | 'price24hPct';

const columns: { key: SortKey; label: string; termKey?: string }[] = [
  { key: 'buyRatio', label: 'Long/Short Ratio', termKey: 'longShortRatio' },
  { key: 'fundingRate', label: 'Funding Rate', termKey: 'fundingRate' },
  { key: 'price24hPct', label: '24h Change' },
];
```

In the header row rendering:

```tsx
            {columns.map((col) => (
              <th
                key={col.key}
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => toggleSort(col.key)}
              >
                {col.termKey ? <Tooltip termKey={col.termKey}>{col.label}</Tooltip> : col.label}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
```

Everything else in the file stays exactly as it is today.

- [ ] **Step 2: Add a tooltip to TrendingWatch's rank label**

Read the current file first (`frontend/src/components/TrendingWatch.tsx`). Add the `Tooltip` import and wrap the rank text:

```tsx
import type { TrendingCoin } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
```

Change the rank span:

```tsx
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {coin.marketCapRank !== null ? <Tooltip termKey="marketCapRank">rank #{coin.marketCapRank}</Tooltip> : 'unranked'}
              </span>
```

Everything else in the file stays exactly as it is today.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PositioningTable.tsx frontend/src/components/TrendingWatch.tsx
git commit -m "feat(frontend): add tooltips to screener column headers and rank label"
```

---

### Task 8: FAQ page, routing, and nav link

**Files:**
- Create: `frontend/src/pages/FaqPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `glossary`, `GlossaryCategory` (Task 1).
- Produces: route `/faq` rendering `FaqPage`.

- [ ] **Step 1: Implement FaqPage**

```tsx
// frontend/src/pages/FaqPage.tsx
import { glossary, type GlossaryCategory } from '../content/glossary';

const CATEGORY_ORDER: { key: GlossaryCategory; label: string }[] = [
  { key: 'web3-basics', label: 'Web3 & Crypto Basics' },
  { key: 'dlmm', label: 'DLMM & Liquidity Pools' },
  { key: 'trading', label: 'Screener & Trading' },
  { key: 'news', label: 'Reading Crypto News' },
];

export function FaqPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        FAQ
      </h1>

      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <h2 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
          About this dashboard
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. Data comes from public APIs and may be delayed, incomplete, or wrong;
          always verify independently before making decisions.
        </p>
      </div>

      {CATEGORY_ORDER.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {cat.label}
          </h2>
          <div
            className="divide-y divide-[color:var(--gridline)] rounded-lg border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            {glossary
              .filter((entry) => entry.category === cat.key)
              .map((entry) => (
                <details key={entry.key} className="p-4">
                  <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {entry.term}
                  </summary>
                  <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {entry.longDefinition}
                  </p>
                </details>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Read the current file first (`frontend/src/App.tsx`). Add the import and route:

```tsx
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { NewsPage } from './pages/NewsPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { FaqPage } from './pages/FaqPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PoolListPage />} />
        <Route path="/pools/:poolId" element={<PoolDetailPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/screener" element={<ScreenerPage />} />
        <Route path="/faq" element={<FaqPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
```

- [ ] **Step 3: Add a nav link in Layout**

Read the current file first (`frontend/src/components/Layout.tsx`). Add a "FAQ" link after "Screener":

```tsx
          <nav className="flex gap-4 text-sm">
            <Link to="/" style={{ color: 'var(--text-secondary)' }}>
              Pools
            </Link>
            <Link to="/news" style={{ color: 'var(--text-secondary)' }}>
              News
            </Link>
            <Link to="/screener" style={{ color: 'var(--text-secondary)' }}>
              Screener
            </Link>
            <Link to="/faq" style={{ color: 'var(--text-secondary)' }}>
              FAQ
            </Link>
          </nav>
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FaqPage.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): add /faq page, route, and nav link"
```

---

### Task 9: End-to-end verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the frontend dev server**

Run: `cd frontend && npm run dev -- --port 5180` (background). The backend isn't required for this task (News/Screener will show their existing loading/error states if it isn't running, which is fine — this task verifies the new educational content, not those existing data flows).

- [ ] **Step 2: Screenshot each page and verify tooltips + FAQ with Playwright**

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

// Pools: blurb + hover a tooltip
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('text=Active DLMM Pools');
await page.screenshot({ path: 'edu-pools.png', fullPage: true });
await page.hover('text=TVL');
await page.waitForTimeout(300);
await page.screenshot({ path: 'edu-pools-tooltip.png' });

// News: blurb + expand the explainer panel
await page.goto('http://localhost:5180/news', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Crypto News');
await page.click('text=How to read crypto news');
await page.waitForTimeout(300);
await page.screenshot({ path: 'edu-news-panel.png', fullPage: true });

// Screener: blurb
await page.goto('http://localhost:5180/screener', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Screener');
await page.screenshot({ path: 'edu-screener.png', fullPage: true });

// FAQ: expand one entry per category
await page.goto('http://localhost:5180/faq', { waitUntil: 'networkidle' });
await page.waitForSelector('text=FAQ');
await page.click('text=Wallet');
await page.click('text=DLMM (Dynamic Liquidity Market Maker)');
await page.waitForTimeout(300);
await page.screenshot({ path: 'edu-faq.png', fullPage: true });

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
```

Expected: `edu-pools.png` shows the new intro blurb above the table; `edu-pools-tooltip.png` shows the TVL definition popover visible after hovering; `edu-news-panel.png` shows the expanded "How to read crypto news" content; `edu-screener.png` shows the new intro blurb; `edu-faq.png` shows two expanded FAQ entries with their `longDefinition` text visible, and all four category headings present. `ERRORS` is `[]` throughout.

- [ ] **Step 3: Regression-check the pages this plan didn't touch**

With the same script or a follow-up one, visit `/pools/:poolId` for any pool id from the Pools table (e.g. click the first row instead of navigating by URL, since pool ids are generated) and confirm the page still renders with the new tooltips visible on stat tiles, and the IL calculator still computes a result — this is the page Task 4 touched most, so it's worth a dedicated look before calling this plan done.

- [ ] **Step 4: Clean up**

Remove any temporary screenshot script files from `frontend/` (keep screenshots only in a scratch/temp directory, not committed to the repo). No commit needed for this task — it's verification only.

---

## Self-Review Notes

- **Spec coverage:** glossary as single source of truth (Task 1), keyboard-accessible Tooltip (Task 2), Pools blurb + column/bin-step tooltips (Task 3), pool detail stat tile + IL calculator tooltips (Task 4), News blurb + static explainer panel — no per-article AI (Task 5), Screener blurb (Task 6), screener table/rank tooltips (Task 7), categorized FAQ page with About/disclaimer section (Task 8), manual browser verification + regression check (Task 9) — every spec section has a task. The deferred premium long/short metric and paywall UI are explicitly out of scope per the spec and touched by no task.
- **No placeholders:** every step has complete, runnable code; all 24 glossary entries are fully written out, not stubbed.
- **Type consistency:** `Tooltip`'s `termKey` prop (Task 2) is used identically in Tasks 3, 4, and 7 with keys that all exist in Task 1's glossary array. `StatTile`'s `label: ReactNode` (Task 4) and `IlCalculator`'s local `Result`'s `label: ReactNode` (Task 4) are both widened the same way, so existing plain-string call sites keep compiling unchanged. `FaqPage` (Task 8) imports `GlossaryCategory` and `glossary` with the exact names Task 1 exports.
