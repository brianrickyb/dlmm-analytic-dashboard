# Dark Terminal Redesign — XAU/USD Market Signal Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `MarketSignalPage`, `DirectionSignal`, `FundamentalsPanel`, `MarketNewsList`, and
`PriceChart` from the old light-theme tokens to the dark terminal design system already
established on this branch — pure token migration, no behavior/data changes.

**Architecture:** These 5 files are the last files on this branch still referencing tokens
undefined in `frontend/src/index.css` — this is "Plan F", referenced but not written by
`docs/superpowers/plans/2026-08-14-dark-terminal-login-signup-account.md`, whose own final
verification step (`grep -rln` over `frontend/src`) confirmed these 5 files as the only ones
left after that plan's Login/Signup/Account migration landed. There is no Figma Make mockup
reference for this page (the reference project has no gold/forex signal screen) — per the
user's standing "restyle everything to match" decision, this plan extrapolates the established
visual language from the closest existing analogs already on this branch: `NewsList.tsx` (for
`MarketNewsList`, same shape: sentiment-badged headline list) and `HistoryChart.tsx` (for
`PriceChart`, same shape: single-series `recharts` `AreaChart` with a gradient fill and a
custom tooltip).

**Tech Stack:** React 19, TypeScript, Tailwind v4, recharts — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-dark-terminal-redesign-design.md`

## Global Constraints

- Every themed color is a CSS variable via `var(--token)` — never a hardcoded hex.
- Established old→new token mapping (verify each against `frontend/src/index.css` if in doubt):
  `--surface-1`→`--card`, `--text-primary`→`--text`, `--text-secondary`→`--text` (bold/
  `font-semibold` headings — confirmed precedent: `ScreenerPage.tsx`'s and `FaqPage.tsx`'s
  `text-sm font-semibold` section headers both use `var(--text)`) or `--muted` (regular-weight
  body/captions/subtitles — confirmed precedent: every page's `text-sm` subtitle paragraph
  under its `h1` uses `var(--muted)`), `--text-muted`→`--muted`, `--status-critical`→`--red`,
  `--status-good`→`--green`, `--accent`→`--green` (except the `PriceChart` line/gradient, see
  Task 2 — that one maps to `--series-blue` instead, not `--green`, for a reason specific to
  that file), `--gridline`→`--border`, `--axis`→`--border2`.
- `--dim` must never be used for text (this exact mistake has recurred twice already on this
  branch, both times caught and fixed in a final review — do not introduce it a third time).
- Numeric/data values (chart tooltip values, axis tick labels, the direction word, stat values)
  get `fontFamily: 'var(--font-mono)'` and, where the value is itself numeric, `tabular-nums` —
  confirmed established convention: `StatTile.tsx`, `HistoryChart.tsx`'s tooltip and axis ticks,
  `PoolTable.tsx`, `PositioningTable.tsx`, and `TrendingWatch.tsx` all apply this to every data
  value they render, never to prose.
- `Badge`'s variant prop already accepts `'good' | 'critical' | 'warning' | 'neutral' | 'accent'`
  and resolves each to the correct new token internally (`frontend/src/components/Badge.tsx`) —
  do not modify that file. `DirectionSignal.tsx` and `MarketNewsList.tsx` already pass
  `'good'`/`'critical'`/`'neutral'` variants; those call sites need no signature change.
- `StatTile`'s API is unchanged — `FundamentalsPanel.tsx` already uses it correctly and needs no
  prop changes, only the two `var(--surface-1)`/`var(--status-critical)` occurrences in its own
  loading/error branches.
- `PillButton`'s `variant="solid"` and default `variant="tinted"` are both already correct as
  defined in `frontend/src/components/PillButton.tsx` — do not modify that file, only use the
  component as-is.
- No prop/export signature changes to any component in this plan.
- No change to any `useEffect`, `fetch` call, data-fetching/retry logic, or loading/error/ready
  state machine — styling only.
- This frontend has zero `.test.tsx` files (established project convention) — no test file
  expected for any task in this plan.

---

### Task 1: Restyle `DirectionSignal.tsx`, `FundamentalsPanel.tsx`, `MarketNewsList.tsx`, and `PriceChart.tsx`

**Files:**
- Modify: `frontend/src/components/DirectionSignal.tsx`
- Modify: `frontend/src/components/FundamentalsPanel.tsx`
- Modify: `frontend/src/components/MarketNewsList.tsx`
- Modify: `frontend/src/components/PriceChart.tsx`

**Interfaces:**
- Consumes: `Badge`, `PillButton`, `StatTile` (all unchanged props), `DirectionResult`,
  `FredObservation`, `FredSummary`, `MarketNewsPost`, `PriceRow` (all unchanged, from
  `frontend/src/types/market.ts`).
- Produces: no exports change — all four keep their existing prop signatures, consumed by
  `MarketSignalPage.tsx` in Task 2 exactly as they are consumed today.

These four files are batched into one task because each is a small, independent, same-shape
token swap with no shared interface between them — the kind of work this branch has
consistently batched rather than reviewing four times over.

No test file — verification is `npx tsc -b` plus a real manual visual check (Step 5).

- [ ] **Step 1: Replace `DirectionSignal.tsx`**

```tsx
import { Badge } from './Badge';
import { PillButton } from './PillButton';
import type { DirectionResult } from '../types/market';

interface DirectionSignalProps {
  status: 'loading' | 'error' | 'ready';
  direction: DirectionResult | null;
  errorMessage?: string;
  onRetry: () => void;
}

export function DirectionSignal({ status, direction, errorMessage, onRetry }: DirectionSignalProps) {
  if (status === 'loading') {
    return <div className="h-28 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (status === 'error' || !direction) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Direction signal is unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  const isBullish = direction.direction === 'bullish';

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            Model Direction Signal (5-day horizon)
          </div>
          <div
            className="mt-1 text-2xl font-extrabold tracking-tight capitalize"
            style={{ color: isBullish ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}
          >
            {direction.direction}
          </div>
        </div>
        <Badge variant={isBullish ? 'good' : 'critical'}>{(direction.confidence * 100).toFixed(1)}% confidence</Badge>
      </div>
      <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
        A self-trained model's prediction for whether XAU/USD will be higher in 5 trading days —
        not a recommendation. This model's real backtested accuracy (51.7% mean on this horizon)
        is below a 55.6% naive baseline across 2020-2024 — see "How this signal works" below for
        the full picture.
      </p>
    </div>
  );
}
```

(The direction word gets `fontFamily: var(--font-mono)` but not `tabular-nums` — `tabular-nums`
only affects digit rendering and "Bullish"/"Bearish" has none; `font-mono` alone matches this
branch's convention of monospacing a stat block's primary value, the same treatment `StatTile`
gives every `value` it renders regardless of whether that value is numeric.)

- [ ] **Step 2: Replace `FundamentalsPanel.tsx`**

```tsx
import { StatTile } from './StatTile';
import { PillButton } from './PillButton';
import type { FredObservation, FredSummary } from '../types/market';

interface FundamentalsPanelProps {
  status: 'loading' | 'error' | 'ready';
  fundamentals: FredSummary | null;
  errorMessage?: string;
  onRetry: () => void;
}

function formatObservation(obs: FredObservation | null, suffix: string): string {
  if (!obs) return 'N/A';
  return `${obs.value.toFixed(2)}${suffix}`;
}

export function FundamentalsPanel({ status, fundamentals, errorMessage, onRetry }: FundamentalsPanelProps) {
  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error' || !fundamentals) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Fundamentals are unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
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

- [ ] **Step 3: Replace `MarketNewsList.tsx`**

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
          <div key={i} className="h-16 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'News is unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}>
        No gold or forex news found right now.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {posts.map((post) => {
        const badge = post.mlSentiment ? SENTIMENT_BADGE[post.mlSentiment.sentiment] : null;
        return (
          <li key={post.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <a href={post.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text)' }}>
              {post.title}
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
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

(Identical structure to the already-migrated `NewsList.tsx`, kept as a separate file rather than
merged with it because `MarketNewsPost.mlSentiment` is nullable — unlike `NewsPost.sentiment`,
which is always present — and needs the `post.mlSentiment ? … : null` fallback branch with its
own "Sentiment unavailable" badge. This is pre-existing behavior, not a change introduced here.)

- [ ] **Step 4: Replace `PriceChart.tsx`**

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PriceRow } from '../types/market';
import { formatUsd } from '../lib/format';

// The shared `formatDate` in lib/format.ts omits the year, which is correct for the shorter
// windows it's used for elsewhere (e.g. HistoryChart.tsx) but ambiguous here: this chart spans
// roughly 1.5 years, so two points 12 months apart would otherwise render identical labels
// (e.g. both "Aug 13"). Kept local to this file rather than changing the shared helper.
function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ background: 'var(--card2)', borderColor: 'var(--border2)', color: 'var(--text)' }}
    >
      <div style={{ color: 'var(--muted)' }}>{formatChartDate(label)}</div>
      <div className="font-medium tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
        {formatUsd(value)}
      </div>
    </div>
  );
}

export function PriceChart({ data }: { data: PriceRow[] }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        XAU/USD Price
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-close" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-blue)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--series-blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'var(--border2)' }}
            tickLine={false}
            minTickGap={60}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) => formatUsd(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="close" stroke="var(--series-blue)" strokeWidth={2} fill="url(#fill-close)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

(The price line uses `--series-blue`, not `--green`, even though `--accent`→`--green` is the
default mapping elsewhere: `--green` on this branch already carries a specific "bullish/good"
meaning — `DirectionSignal`'s bullish color and `Badge`'s `good` variant both use it — and this
chart plots raw price, not a directional judgment. `--series-blue` is the established color for
"a single value plotted over time" on this branch: `PoolDetailPage.tsx` already uses it for its
TVL `HistoryChart`. The gridline/axis/tooltip tokens (`--border`, `--border2`, `--card2`) are
copied directly from `HistoryChart.tsx`'s own values, the closest existing analog to this
chart.)

- [ ] **Step 5: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the real dev server. These four components only render inside `MarketSignalPage`
(Task 2) — until Task 2 lands, verify them via the still-old-token `MarketSignalPage.tsx` if
that renders acceptably, or defer the visual check to Task 2's Step 3, which verifies the fully
migrated page end to end. Either way, note in your report which you did.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DirectionSignal.tsx frontend/src/components/FundamentalsPanel.tsx frontend/src/components/MarketNewsList.tsx frontend/src/components/PriceChart.tsx
git commit -m "feat(frontend): restyle DirectionSignal, FundamentalsPanel, MarketNewsList, and PriceChart for the dark terminal look"
```

---

### Task 2: Restyle `MarketSignalPage.tsx`

**Files:**
- Modify: `frontend/src/pages/MarketSignalPage.tsx`

**Interfaces:**
- Consumes: `PriceChart`, `DirectionSignal`, `FundamentalsPanel`, `MarketNewsList`, `PillButton`,
  `StatTile` (all unchanged props, `PriceChart`/`DirectionSignal`/`FundamentalsPanel`/
  `MarketNewsList` restyled in Task 1), `fetchMarketHistory`, `fetchMarketSignal` (unchanged),
  `formatUsd` (unchanged), `MarketSignalResponse`, `PriceRow` (unchanged types).
- Produces: no exports change.

No test file — verification is `npx tsc -b` plus a real manual visual check (Step 3).

- [ ] **Step 1: Replace `MarketSignalPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { DirectionSignal } from '../components/DirectionSignal';
import { FundamentalsPanel } from '../components/FundamentalsPanel';
import { MarketNewsList } from '../components/MarketNewsList';
import { PillButton } from '../components/PillButton';
import { StatTile } from '../components/StatTile';
import { fetchMarketHistory, fetchMarketSignal } from '../lib/api/markets';
import { formatUsd } from '../lib/format';
import type { MarketSignalResponse, PriceRow } from '../types/market';

const SYMBOL = 'xau';
// The committed static dataset spans 2004-2026 (5500+ trading-day rows, not calendar days --
// weekends/holidays aren't included). Rendering the full series on every mount is unnecessary
// render weight for a chart whose purpose is recent trend context next to the direction signal,
// so we slice to the most recent CHART_WINDOW_ROWS rows (roughly 1.5 years) client-side after
// fetch. Note this slice only reduces render cost, not network cost: the full ~520KB /history
// payload is still fetched in full on every cache miss. The real mitigation for repeat-visit
// network cost is Phase 2's `Cache-Control: public, max-age=3600` header on the /history route
// (repeat visits within an hour are served from cache, not refetched) -- we deliberately did not
// add a `?days=`/`?limit=` backend query param, since that's out of scope for what this one
// chart needs.
const CHART_WINDOW_ROWS = 365;

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
  const chartData = history.slice(-CHART_WINDOW_ROWS);

  // Fold the top-level /signal fetch's own loading/error state together with each section's
  // independent SectionResult failure, so DirectionSignal/FundamentalsPanel/MarketNewsList
  // only ever need the same simple 3-state status prop every other panel in this app uses.
  const directionStatus: FetchStatus = signalStatus === 'ready' && !signal?.direction.data ? 'error' : signalStatus;
  const fundamentalsStatus: FetchStatus = signalStatus === 'ready' && !signal?.fundamentals.data ? 'error' : signalStatus;
  const newsStatus: FetchStatus = signalStatus === 'ready' && !signal?.news.data ? 'error' : signalStatus;

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            XAU/USD Market Signal
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Gold price, an experimental ML direction signal, live gold/forex news sentiment, and
            macro fundamentals — all in one place.
          </p>
        </div>
        {signal?.price ? <StatTile label="Spot Price (XAU/USD)" value={formatUsd(signal.price.close)} variant="hero" /> : null}
      </div>

      <div className="rounded-xl border-2 p-4 text-sm" style={{ borderColor: 'var(--red)', background: 'var(--card)' }}>
        <p className="font-bold" style={{ color: 'var(--red)' }}>
          Not financial advice.
        </p>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Everything on this page — the direction signal, news sentiment, and fundamentals — is
          for informational and educational purposes only, not a recommendation to buy, sell, or
          hold any asset. The direction model's real backtested accuracy on its 5-day horizon
          (51.7% mean across 2020-2024) is below a 55.6% naive baseline — it does not demonstrate
          an edge over simply guessing the more common outcome. See "How this signal works"
          below for the full picture. Always do your own research.
        </p>
      </div>

      {historyStatus === 'loading' ? (
        <div className="h-72 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      ) : historyStatus === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <p style={{ color: 'var(--red)' }}>{historyError}</p>
          <PillButton onClick={retry} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <PriceChart data={chartData} />
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Direction Signal
        </h2>
        <DirectionSignal
          status={directionStatus}
          direction={signal?.direction.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.direction.error}
          onRetry={retry}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Macro Fundamentals
        </h2>
        <FundamentalsPanel
          status={fundamentalsStatus}
          fundamentals={signal?.fundamentals.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.fundamentals.error}
          onRetry={retry}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Gold &amp; Forex News
        </h2>
        <MarketNewsList
          status={newsStatus}
          posts={signal?.news.data ?? []}
          errorMessage={signalStatus === 'error' ? signalError : signal?.news.error}
          onRetry={retry}
        />
      </div>

      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text)' }}>
          How this signal works
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>Direction signal:</strong> a
            self-trained classifier (four technical indicators — RSI, moving-average crossover,
            momentum, volatility — computed from 22 years of daily XAU/USD prices), predicting
            whether the price will be higher 5 trading days out. Walk-forward evaluated on 5
            yearly folds (2020-2024): mean accuracy 51.7%, versus a 55.6% naive "always guess the
            more common outcome" baseline. It does not currently demonstrate a real edge — this
            is the honest, real result of the evaluation, not a placeholder.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>News sentiment:</strong> each
            headline's sentiment tag is generated by FinBERT (a model pretrained specifically on
            financial text), run against the headline only — not the full article.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Fundamentals:</strong> the Fed funds
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

(`page-enter` added to the root div — every other page on this branch has it and this file was
simply missed when the class was first introduced; adding it here is in scope for "restyle to
match the established visual language," not a behavior change, since `page-enter` is a pure CSS
fade-in with no logic attached.)

- [ ] **Step 2: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: both succeed with no errors.

Start the real dev server, navigate to the route this page is mounted at (check
`frontend/src/App.tsx` or the router config for the exact path — likely `/market-signal` or
similar). Confirm: the page renders on the dark palette, the spot-price hero tile shows a green
value, the "Not financial advice" box has a red border and red heading text, the price chart
renders with a blue line/gradient, the Direction Signal panel shows green text for bullish or
red for bearish, the Fundamentals grid shows four stat tiles, the News list shows sentiment
badges, and the "How this signal works" `<details>` expands on click. Take real,
freshly-timestamped screenshots (with independently-checked filesystem timestamps, cited in the
report) of the page in its ready state and of at least one error/retry state (e.g. by
temporarily breaking the API base URL or observing a real network failure) — do not predict
"expected" visual changes from the code, and do not reuse any pre-existing screenshot file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MarketSignalPage.tsx
git commit -m "feat(frontend): restyle MarketSignalPage for the dark terminal look"
```

## Verification

1. `cd frontend && npx tsc -b && npm run build` — clean, both succeed.
2. `grep -rn "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\b\|var(--accent-bg\|var(--accent-fg\|var(--status-\|var(--gridline\|var(--axis)\|var(--dim)" frontend/src/pages/MarketSignalPage.tsx frontend/src/components/DirectionSignal.tsx frontend/src/components/FundamentalsPanel.tsx frontend/src/components/MarketNewsList.tsx frontend/src/components/PriceChart.tsx` returns zero matches.
3. Repo-wide gate — this plan's specific claim (that these are the last 5 files anywhere in the
   frontend still on old tokens):
   `grep -rln "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\b\|var(--accent-bg\|var(--accent-fg\|var(--status-" frontend/src` should, after this plan, return **no results** — the dark terminal token migration is then complete across the entire frontend.
4. Manual verification: real dev server, screenshots of the fully assembled `MarketSignalPage`
   in its ready state (all 4 sub-panels visible) and at least one error/retry state — every
   screenshot cited in any task report must have its timestamp independently checked before
   being cited as evidence, per this branch's established verification discipline.
