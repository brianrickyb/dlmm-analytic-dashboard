# XAU Market Signal — Frontend Page (Phase 3 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `MarketSignalPage` React page — a live XAU/USD price chart, the ML direction
signal, gold/forex news with FinBERT sentiment, and macro fundamentals — consuming the two
backend endpoints built in Phase 2 (`GET /api/markets/xau/{signal,history}`), with a permanent,
always-visible "not financial advice" disclaimer.

**Architecture:** One new page (`MarketSignalPage.tsx`) driven by two independent `useEffect`
fetches (`/signal` and `/history`, sharing one retry counter since both come from the same
backend and a retry should refresh both), four small presentational components (one per
section), a typed API client (`lib/api/markets.ts`), and shared types (`types/market.ts`)
mirroring the backend's response contract exactly. No new backend or ml-service work — Phases 1
and 2 are complete and already live-verified.

**Tech Stack:** React 19, TypeScript, react-router-dom 7, recharts 3, Tailwind (inline
`style={{ color: 'var(--...)' }}` tokens, matching every existing page) — no new dependencies.

## Global Constraints

- Follow the codebase's established page pattern exactly: `useState<'loading'|'error'|'ready'>`
  per independent fetch, a `requestId` counter bumped to retry, `useEffect` with a `cancelled`
  flag guarding against setting state after unmount (see `NewsPage.tsx`, `ScreenerPage.tsx`).
- Follow the established component prop pattern exactly: `{ status, data-or-list, errorMessage?,
  onRetry }`, matching `NewsList.tsx`, `TrendingWatch.tsx`, `PumpWatch.tsx`.
- No new frontend component tests — this project has zero `.test.tsx` files; only `lib/*.ts`
  pure-logic files get Vitest unit tests (see `lib/il.test.ts`, `lib/yield.test.ts`). This page
  has no non-trivial pure logic to extract, so no new test files are created. Verification is
  `npx tsc -b` (must be clean) plus a manual dev-server + browser check (light and dark) at the
  end, matching how every other page in this app was verified.
- Styling: every color is a CSS variable via inline `style`, never a hardcoded hex — reuse the
  exact tokens already used elsewhere: `--text-primary`, `--text-secondary`, `--text-muted`,
  `--surface-1`, `--border`, `--accent`, `--accent-bg`, `--accent-fg`, `--status-good`,
  `--status-critical`, `--status-warning`, `--gridline`, `--axis`.
- API base URL: `import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'`, matching
  `lib/api/news.ts` exactly.
- The backend's `/signal` response wraps `direction`, `news`, and `fundamentals` each in a
  `SectionResult<T> = { data: T; error?: undefined } | { data: null; error: string }`. `price`
  is a bare `PriceRow | null` (not wrapped — it comes from `xauHistoryService.getFullHistory()`,
  which never throws, so there is no failure case to represent for it).
- The **disclaimer is permanent and always visible** — not a `<details>` element, not
  dismissible, not collapsed by default. It renders unconditionally above the fold, regardless
  of loading/error/ready state.
- Never overclaim the model's accuracy. The real, honest numbers from
  `ml-service/training/REPORT.md` (Phase 1's actual walk-forward evaluation) must appear
  verbatim in the disclaimer or the methodology section: **5-day horizon (the one served): mean
  accuracy 0.5174 vs. a 0.5560 naive majority-class baseline** — the model does not demonstrate
  an edge over the simplest possible baseline. State this plainly, not softened.
- Route: `/markets/xau`. Nav label: "Gold Signal".

---

### Task 1: `types/market.ts` and `lib/api/markets.ts`

**Files:**
- Create: `frontend/src/types/market.ts`
- Create: `frontend/src/lib/api/markets.ts`

**Interfaces:**
- Consumes: nothing (this is the foundation task).
- Produces: the `PriceRow`, `DirectionResult`, `MlSentiment`, `FredObservation`, `FredSummary`,
  `MarketNewsPost`, `SectionResult<T>`, `MarketSignalResponse` types, and
  `fetchMarketSignal(symbol: string): Promise<MarketSignalResponse>` /
  `fetchMarketHistory(symbol: string): Promise<PriceRow[]>` functions. Every later task imports
  from these two files.

This task has no non-trivial logic to TDD (it's types plus two thin fetch wrappers, mirroring
`types/news.ts` and `lib/api/news.ts` exactly) — write it directly, then verify with `tsc`.

- [ ] **Step 1: Write the types**

`frontend/src/types/market.ts`:

```ts
export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DirectionResult {
  direction: 'bullish' | 'bearish';
  confidence: number;
}

export interface MlSentiment {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
}

export interface FredObservation {
  date: string;
  value: number;
}

export interface FredSummary {
  fedFundsRate: FredObservation | null;
  realYield10y: FredObservation | null;
  cpi: FredObservation | null;
  dollarIndex: FredObservation | null;
}

export interface MarketNewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  mlSentiment: MlSentiment | null;
}

export type SectionResult<T> = { data: T; error?: undefined } | { data: null; error: string };

export interface MarketSignalResponse {
  price: PriceRow | null;
  direction: SectionResult<DirectionResult>;
  news: SectionResult<MarketNewsPost[]>;
  fundamentals: SectionResult<FredSummary>;
}
```

- [ ] **Step 2: Write the API client**

`frontend/src/lib/api/markets.ts`:

```ts
import type { MarketSignalResponse, PriceRow } from '../../types/market';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function fetchMarketSignal(symbol: string): Promise<MarketSignalResponse> {
  const url = new URL(`/api/markets/${symbol}/signal`, API_BASE_URL);
  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load market signal.');
  }

  return body as MarketSignalResponse;
}

export async function fetchMarketHistory(symbol: string): Promise<PriceRow[]> {
  const url = new URL(`/api/markets/${symbol}/history`, API_BASE_URL);
  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load price history.');
  }

  return (body.history ?? []) as PriceRow[];
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors (these two files have no consumers yet, so this just confirms the files
themselves are syntactically and structurally valid TypeScript).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/market.ts frontend/src/lib/api/markets.ts
git commit -m "feat(frontend): add types and API client for the XAU market signal endpoints"
```

---

### Task 2: `components/PriceChart.tsx`

**Files:**
- Create: `frontend/src/components/PriceChart.tsx`

**Interfaces:**
- Consumes: `PriceRow` from `types/market.ts` (Task 1); `formatDate`, `formatUsd` from
  `lib/format.ts` (existing, unmodified).
- Produces: `PriceChart({ data: PriceRow[] }): JSX.Element`. Task 6 (`MarketSignalPage.tsx`)
  renders this with a client-side-sliced recent window of the full history.

This mirrors `components/HistoryChart.tsx`'s structure (same recharts `AreaChart` pattern,
same `CustomTooltip` shape) but is a new, separate component rather than a modification of
`HistoryChart.tsx`, because `HistoryChart.tsx` is tightly coupled to `PoolSnapshot`'s field names
(`snapshotAt`, and a `dataKey` prop restricted to `'tvlUsd' | 'volume24hUsd' | 'feeApr24h'`) —
forcing gold-price data through that same component would require loosening its type to `any`,
which is worse than a second small, focused file with its own tight types.

- [ ] **Step 1: Write the component**

`frontend/src/components/PriceChart.tsx`:

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PriceRow } from '../types/market';
import { formatDate, formatUsd } from '../lib/format';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div style={{ color: 'var(--text-muted)' }}>{formatDate(label)}</div>
      <div className="font-medium tabular-nums">{formatUsd(value)}</div>
    </div>
  );
}

export function PriceChart({ data }: { data: PriceRow[] }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
        XAU/USD Price
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-close" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--gridline)" vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            minTickGap={60}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) => formatUsd(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="close" stroke="var(--accent)" strokeWidth={2} fill="url(#fill-close)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PriceChart.tsx
git commit -m "feat(frontend): add PriceChart component for XAU/USD price history"
```

---

### Task 3: `components/DirectionSignal.tsx`

**Files:**
- Create: `frontend/src/components/DirectionSignal.tsx`

**Interfaces:**
- Consumes: `DirectionResult` from `types/market.ts` (Task 1); `Badge` from
  `components/Badge.tsx` (existing, unmodified — variants used: `'good'`, `'critical'`).
- Produces: `DirectionSignal({ status, direction, errorMessage }): JSX.Element`. Task 6 renders
  this with the `/signal` response's `direction` section.

- [ ] **Step 1: Write the component**

`frontend/src/components/DirectionSignal.tsx`:

```tsx
import { Badge } from './Badge';
import type { DirectionResult } from '../types/market';

interface DirectionSignalProps {
  status: 'loading' | 'error' | 'ready';
  direction: DirectionResult | null;
  errorMessage?: string;
}

export function DirectionSignal({ status, direction, errorMessage }: DirectionSignalProps) {
  if (status === 'loading') {
    return <div className="h-28 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />;
  }

  if (status === 'error' || !direction) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Direction signal is unavailable right now.'}</p>
      </div>
    );
  }

  const isBullish = direction.direction === 'bullish';

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Model Direction Signal (5-day horizon)
          </div>
          <div
            className="mt-1 text-2xl font-extrabold tracking-tight capitalize"
            style={{ color: isBullish ? 'var(--status-good)' : 'var(--status-critical)' }}
          >
            {direction.direction}
          </div>
        </div>
        <Badge variant={isBullish ? 'good' : 'critical'}>{(direction.confidence * 100).toFixed(1)}% confidence</Badge>
      </div>
      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        A self-trained model's prediction for whether XAU/USD will be higher in 5 trading days —
        not a recommendation. This model's real backtested accuracy (51.7% mean on this horizon)
        is below a 55.6% naive baseline across 2020-2024 — see "How this signal works" below for
        the full picture.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DirectionSignal.tsx
git commit -m "feat(frontend): add DirectionSignal component"
```

---

### Task 4: `components/FundamentalsPanel.tsx`

**Files:**
- Create: `frontend/src/components/FundamentalsPanel.tsx`

**Interfaces:**
- Consumes: `FredSummary` from `types/market.ts` (Task 1); `StatTile` from
  `components/StatTile.tsx` (existing, unmodified).
- Produces: `FundamentalsPanel({ status, fundamentals, errorMessage }): JSX.Element`. Task 6
  renders this with the `/signal` response's `fundamentals` section.

- [ ] **Step 1: Write the component**

`frontend/src/components/FundamentalsPanel.tsx`:

```tsx
import { StatTile } from './StatTile';
import type { FredObservation, FredSummary } from '../types/market';

interface FundamentalsPanelProps {
  status: 'loading' | 'error' | 'ready';
  fundamentals: FredSummary | null;
  errorMessage?: string;
}

function formatObservation(obs: FredObservation | null, suffix: string): string {
  if (!obs) return 'N/A';
  return `${obs.value.toFixed(2)}${suffix}`;
}

export function FundamentalsPanel({ status, fundamentals, errorMessage }: FundamentalsPanelProps) {
  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error' || !fundamentals) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Fundamentals are unavailable right now.'}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Fed Funds Rate" value={formatObservation(fundamentals.fedFundsRate, '%')} />
      <StatTile label="10Y Real Yield" value={formatObservation(fundamentals.realYield10y, '%')} />
      <StatTile label="CPI Index" value={formatObservation(fundamentals.cpi, '')} />
      <StatTile label="Dollar Index" value={formatObservation(fundamentals.dollarIndex, '')} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FundamentalsPanel.tsx
git commit -m "feat(frontend): add FundamentalsPanel component"
```

---

### Task 5: `components/MarketNewsList.tsx`

**Files:**
- Create: `frontend/src/components/MarketNewsList.tsx`

**Interfaces:**
- Consumes: `MarketNewsPost` from `types/market.ts` (Task 1); `Badge` from
  `components/Badge.tsx`; `PillButton` from `components/PillButton.tsx` (both existing,
  unmodified).
- Produces: `MarketNewsList({ status, posts, errorMessage, onRetry }): JSX.Element`. Task 6
  renders this with the `/signal` response's `news` section.

This is deliberately a new component, not a reuse of `components/NewsList.tsx`: that component
renders `NewsPost.sentiment` (an existing keyword-based classifier, tuned for crypto headlines),
whereas this page's news feature is specifically about the FinBERT-based `mlSentiment` field —
the actual ML sentiment analysis the original feature request asked for. Showing the wrong
sentiment source here would defeat the point of the feature.

- [ ] **Step 1: Write the component**

`frontend/src/components/MarketNewsList.tsx`:

```tsx
import { Badge } from './Badge';
import { PillButton } from './PillButton';
import type { MarketNewsPost } from '../types/market';

const SENTIMENT_BADGE: Record<'positive' | 'negative' | 'neutral', { variant: 'good' | 'critical' | 'neutral'; label: string }> = {
  positive: { variant: 'good', label: 'Positive' },
  negative: { variant: 'critical', label: 'Negative' },
  neutral: { variant: 'neutral', label: 'Neutral' },
};

interface MarketNewsListProps {
  status: 'loading' | 'error' | 'ready';
  posts: MarketNewsPost[];
  errorMessage?: string;
  onRetry: () => void;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MarketNewsList({ status, posts, errorMessage, onRetry }: MarketNewsListProps) {
  if (status === 'loading') {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'News is unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        No gold or forex news found right now.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {posts.map((post) => {
        const badge = post.mlSentiment ? SENTIMENT_BADGE[post.mlSentiment.sentiment] : null;
        return (
          <li key={post.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <a href={post.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
              {post.title}
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Badge variant="neutral">Sentiment unavailable</Badge>}
              <span>{post.sourceTitle}</span>
              <span>&middot;</span>
              <span>{timeAgo(post.publishedAt)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MarketNewsList.tsx
git commit -m "feat(frontend): add MarketNewsList component with FinBERT sentiment badges"
```

---

### Task 6: `pages/MarketSignalPage.tsx`, routing, and manual verification

**Files:**
- Create: `frontend/src/pages/MarketSignalPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `fetchMarketSignal`, `fetchMarketHistory` (Task 1); `PriceChart` (Task 2);
  `DirectionSignal` (Task 3); `FundamentalsPanel` (Task 4); `MarketNewsList` (Task 5);
  `PillButton` from `components/PillButton.tsx` (existing).
- Produces: the `/markets/xau` route, wired into the app's router and nav.

- [ ] **Step 1: Write the page**

`frontend/src/pages/MarketSignalPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { DirectionSignal } from '../components/DirectionSignal';
import { FundamentalsPanel } from '../components/FundamentalsPanel';
import { MarketNewsList } from '../components/MarketNewsList';
import { PillButton } from '../components/PillButton';
import { fetchMarketHistory, fetchMarketSignal } from '../lib/api/markets';
import type { MarketSignalResponse, PriceRow } from '../types/market';

const SYMBOL = 'xau';
// The committed static dataset spans 2004-2026 (5500+ daily rows). Rendering the full series
// on every mount is unnecessary weight for a chart whose purpose is recent trend context next
// to the direction signal -- slice to the most recent ~year client-side instead of adding
// backend query-param support for something only this one chart needs.
const CHART_WINDOW_DAYS = 365;

type FetchStatus = 'loading' | 'error' | 'ready';

export function MarketSignalPage() {
  const [signalStatus, setSignalStatus] = useState<FetchStatus>('loading');
  const [signal, setSignal] = useState<MarketSignalResponse | null>(null);
  const [signalError, setSignalError] = useState<string | undefined>(undefined);

  const [historyStatus, setHistoryStatus] = useState<FetchStatus>('loading');
  const [history, setHistory] = useState<PriceRow[]>([]);
  const [historyError, setHistoryError] = useState<string | undefined>(undefined);

  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSignalStatus('loading');

    fetchMarketSignal(SYMBOL)
      .then((result) => {
        if (cancelled) return;
        setSignal(result);
        setSignalStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSignalError(err instanceof Error ? err.message : 'Failed to load market signal.');
        setSignalStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryStatus('loading');

    fetchMarketHistory(SYMBOL)
      .then((result) => {
        if (cancelled) return;
        setHistory(result);
        setHistoryStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : 'Failed to load price history.');
        setHistoryStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const retry = () => setRequestId((n) => n + 1);
  const chartData = history.slice(-CHART_WINDOW_DAYS);

  // Fold the top-level /signal fetch's own loading/error state together with each section's
  // independent SectionResult failure, so DirectionSignal/FundamentalsPanel/MarketNewsList
  // only ever need the same simple 3-state status prop every other panel in this app uses.
  const directionStatus: FetchStatus = signalStatus === 'ready' && !signal?.direction.data ? 'error' : signalStatus;
  const fundamentalsStatus: FetchStatus = signalStatus === 'ready' && !signal?.fundamentals.data ? 'error' : signalStatus;
  const newsStatus: FetchStatus = signalStatus === 'ready' && !signal?.news.data ? 'error' : signalStatus;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          XAU/USD Market Signal
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Gold price, an experimental ML direction signal, live gold/forex news sentiment, and
          macro fundamentals — all in one place.
        </p>
      </div>

      <div className="rounded-xl border-2 p-4 text-sm" style={{ borderColor: 'var(--status-critical)', background: 'var(--surface-1)' }}>
        <p className="font-bold" style={{ color: 'var(--status-critical)' }}>
          Not financial advice.
        </p>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          Everything on this page — the direction signal, news sentiment, and fundamentals — is
          for informational and educational purposes only, not a recommendation to buy, sell, or
          hold any asset. The direction model's real backtested accuracy on its 5-day horizon
          (51.7% mean across 2020-2024) is below a 55.6% naive baseline — it does not demonstrate
          an edge over simply guessing the more common outcome. See "How this signal works"
          below for the full picture. Always do your own research.
        </p>
      </div>

      {historyStatus === 'loading' ? (
        <div className="h-72 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
      ) : historyStatus === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <p style={{ color: 'var(--status-critical)' }}>{historyError}</p>
          <PillButton onClick={retry} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <PriceChart data={chartData} />
      )}

      <DirectionSignal
        status={directionStatus}
        direction={signal?.direction.data ?? null}
        errorMessage={signalStatus === 'error' ? signalError : signal?.direction.error}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Macro Fundamentals
        </h2>
        <FundamentalsPanel
          status={fundamentalsStatus}
          fundamentals={signal?.fundamentals.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.fundamentals.error}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Gold &amp; Forex News
        </h2>
        <MarketNewsList
          status={newsStatus}
          posts={signal?.news.data ?? []}
          errorMessage={signalStatus === 'error' ? signalError : signal?.news.error}
          onRetry={retry}
        />
      </div>

      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text-primary)' }}>
          How this signal works
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--text-secondary)' }}>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Direction signal:</strong> a
            self-trained classifier (four technical indicators — RSI, moving-average crossover,
            momentum, volatility — computed from 22 years of daily XAU/USD prices), predicting
            whether the price will be higher 5 trading days out. Walk-forward evaluated on 5
            yearly folds (2020-2024): mean accuracy 51.7%, versus a 55.6% naive "always guess the
            more common outcome" baseline. It does not currently demonstrate a real edge — this
            is the honest, real result of the evaluation, not a placeholder.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>News sentiment:</strong> each
            headline's sentiment tag is generated by FinBERT (a model pretrained specifically on
            financial text), run against the headline only — not the full article.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Fundamentals:</strong> the Fed funds
            rate, 10-year real yield, CPI, and a broad dollar index, sourced from the Federal
            Reserve's FRED database — commonly cited drivers of gold's price, shown for context,
            not as a combined score.
          </p>
          <p>
            This page covers XAU/USD only. See the disclaimer above — none of this is investment
            advice.
          </p>
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route into `App.tsx`**

In `frontend/src/App.tsx`, change:

```tsx
import { MyPositionsPage } from './pages/MyPositionsPage';
```

to:

```tsx
import { MyPositionsPage } from './pages/MyPositionsPage';
import { MarketSignalPage } from './pages/MarketSignalPage';
```

and change:

```tsx
              <Route path="/positions" element={<MyPositionsPage />} />
            </Routes>
```

to:

```tsx
              <Route path="/positions" element={<MyPositionsPage />} />
              <Route path="/markets/xau" element={<MarketSignalPage />} />
            </Routes>
```

- [ ] **Step 3: Add the nav link in `Layout.tsx`**

In `frontend/src/components/Layout.tsx`, change:

```tsx
const NAV_LINKS = [
  { to: '/', label: 'Pools' },
  { to: '/news', label: 'News' },
  { to: '/screener', label: 'Screener' },
  { to: '/faq', label: 'FAQ' },
  { to: '/positions', label: 'My Positions' },
];
```

to:

```tsx
const NAV_LINKS = [
  { to: '/', label: 'Pools' },
  { to: '/news', label: 'News' },
  { to: '/screener', label: 'Screener' },
  { to: '/markets/xau', label: 'Gold Signal' },
  { to: '/faq', label: 'FAQ' },
  { to: '/positions', label: 'My Positions' },
];
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MarketSignalPage.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): add MarketSignalPage and wire it into routing/nav"
```

- [ ] **Step 6: Manual verification**

Start the real ml-service, the real backend, and the frontend dev server:

```bash
cd ml-service && uv run uvicorn app.main:app --port 8000
cd backend && npm run dev
cd frontend && npm run dev
```

Open the app in a browser, navigate to "Gold Signal" in the nav (or `/markets/xau` directly).
Confirm, against the real running stack (not mocks):
- The permanent disclaimer renders immediately, above the fold, without needing to expand
  anything.
- The price chart renders a real XAU/USD price line covering roughly the last year.
- The direction signal shows a real "Bullish" or "Bearish" badge with a real confidence
  percentage (not a hardcoded placeholder).
- The macro fundamentals panel shows four real stat tiles (Fed funds rate, 10Y real yield, CPI,
  dollar index) if `FRED_API_KEY` is configured. If it isn't (the state Phase 2 was verified
  against), `fredService.getSummary()` throws before any fetch, so the whole `fundamentals`
  section comes back as `{data: null, error: '...'}` — expect `FundamentalsPanel` to render its
  single error message ("Fundamentals are unavailable right now."), not four "N/A" tiles. Four
  "N/A" tiles would only appear if FRED responded successfully but every individual series came
  back empty — a different, narrower case. Either way, seeing the error state with no key
  configured is the correct, honest outcome, not a bug.
- The news list shows real, genuinely gold/forex-relevant headlines (confirm none are
  off-topic, e.g. no unrelated "Goldman Sachs" articles — this was a real bug found and fixed in
  Phase 2), each with a real sentiment badge from FinBERT.
- The "How this signal works" section, when expanded, shows the real 51.7%/55.6% numbers from
  `ml-service/training/REPORT.md`.
- Reload the page a second time and confirm the FinBERT sentiment tags don't visibly re-flicker
  through a loading state for the same headlines (Phase 2's sentiment cache should make the
  second `/signal` call fast for repeated headlines within the news cache window).
- This app has no in-page theme toggle — dark mode follows the OS/browser's
  `prefers-color-scheme` (see `frontend/src/index.css`). Switch your OS or browser to dark mode
  and reload, and confirm every color on the page still reads correctly (all styling here uses
  the same CSS variable tokens as the rest of the app, so this should already hold, but confirm
  visually rather than assuming).
- Resize to a narrow viewport and confirm the fundamentals grid collapses to 2 columns and
  nothing overflows horizontally.

## Verification

1. `cd frontend && npx tsc -b` — clean, no type errors.
2. `cd frontend && npm run build` — production build succeeds.
3. Manual verification per Task 6 Step 6, confirming real end-to-end behavior against the real
   running ml-service, backend, and frontend — including the permanent disclaimer, real model
   output, real news with correct topical relevance, and real per-section degradation display
   when `FRED_API_KEY` is unset.
