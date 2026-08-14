# Dark Terminal Redesign — News, Screener, FAQ, My Positions Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `NewsPage`/`NewsFilters`, `ScreenerPage`/`PositioningTable`/`TrendingWatch`/`PumpWatch`,
`FaqPage`, and `MyPositionsPage` from the old light-theme tokens to the dark terminal design system
already established on this branch — pure token migration, no behavior/data changes.

**Architecture:** Every file listed above was read directly from the feature branch's worktree
(not master) immediately before writing this plan, to avoid repeating an earlier mistake on this
branch where a task was planned against a stale file read from the wrong checkout. Each file's
`var(--old-token)` references are replaced with their established new-palette equivalents; no
structural, prop, or data-fetching changes anywhere in this plan.

**Tech Stack:** React 19, TypeScript, Tailwind v4 — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-dark-terminal-redesign-design.md`

## Global Constraints

- Every themed color is a CSS variable via `var(--token)` — never a hardcoded hex.
- Established old→new token mapping (verify each against `frontend/src/index.css` if in doubt):
  `--surface-1`→`--card`, `--surface-page`→`--bg`, `--text-primary`→`--text`,
  `--text-secondary`→`--text` (bold headings) or `--muted` (regular-weight body/captions — judge
  by font-weight, matching the precedent already used across this branch's earlier plans),
  `--text-muted`→`--muted`, `--status-critical`→`--red`, `--status-good`→`--green`,
  `--accent`→`--green`, `--accent-bg`→`--green-subtle`, `--accent-fg`→`--green-fg`.
- `--dim` must never be used for text (confirmed too low-contrast, ~1.65:1, on this branch's own
  final reviews twice already) — every file in this plan already uses `--text-muted`/
  `--text-secondary` for its secondary text, never the old `--dim`-equivalent, so this constraint
  should require no special handling, just don't introduce `--dim` for text while migrating.
- Numeric/data values (percentages, prices, ratios, wallet/pool addresses) use
  `fontFamily: 'var(--font-mono)'` where not already present.
- No prop/export signature changes to any component in this plan.
- No change to any `useEffect`, data-fetching call, or loading/error/empty state machine —
  styling only.

---

### Task 1: Restyle `NewsPage.tsx` and `NewsFilters.tsx`

**Files:**
- Modify: `frontend/src/pages/NewsPage.tsx`
- Modify: `frontend/src/components/NewsFilters.tsx`

**Interfaces:**
- Consumes: `NewsFilters`/`NewsList` (unchanged props).
- Produces: no exports change.

No test file — this frontend has zero `.test.tsx` files; verification is `npx tsc -b` plus a real
manual visual check (Step 3).

- [ ] **Step 1: Replace `NewsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { NewsFilters } from '../components/NewsFilters';
import { NewsList } from '../components/NewsList';
import { fetchNews } from '../lib/api/news';
import type { NewsPost, NewsSource } from '../types/news';

export function NewsPage() {
  const [currencies, setCurrencies] = useState('');
  const [source, setSource] = useState<NewsSource | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchNews({ currencies: currencies || undefined, source })
      .then((result) => {
        if (cancelled) return;
        setPosts(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load news.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [currencies, source, requestId]);

  return (
    <div className="page-enter space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Crypto News
      </h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Live headlines aggregated from CoinDesk, Cointelegraph, The Block, and Decrypt. New to
        reading crypto news? See "How to read crypto news" below.
      </p>
      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text)' }}>
          How to read crypto news
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>Bullish</strong> means sentiment that
            price will rise; <strong style={{ color: 'var(--text)' }}>bearish</strong> means
            sentiment it will fall.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>FUD</strong> (Fear, Uncertainty, Doubt)
            is news that spreads fear and can trigger panic selling.{' '}
            <strong style={{ color: 'var(--text)' }}>FOMO</strong> (Fear Of Missing Out) is
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
          <p>
            The sentiment tag (Positive/Negative/Neutral) on each headline is a simple keyword
            match against the title only — not the full article, and not AI analysis. Treat it
            as a rough scan aid, not a signal.
          </p>
        </div>
      </details>
      <NewsFilters currencies={currencies} onCurrenciesChange={setCurrencies} source={source} onSourceChange={setSource} />
      <NewsList status={status} posts={posts} errorMessage={errorMessage} onRetry={() => setRequestId((n) => n + 1)} />
    </div>
  );
}
```

(`page-enter` added to the root div, matching the convention already applied to `PoolListPage`/
`PoolDetailPage` in the previous plan on this branch.)

- [ ] **Step 2: Replace `NewsFilters.tsx`**

```tsx
import type { NewsSource } from '../types/news';

const SOURCES: { value: NewsSource | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'coindesk', label: 'CoinDesk' },
  { value: 'cointelegraph', label: 'Cointelegraph' },
  { value: 'theblock', label: 'The Block' },
  { value: 'decrypt', label: 'Decrypt' },
];

interface NewsFiltersProps {
  currencies: string;
  onCurrenciesChange: (value: string) => void;
  source: NewsSource | undefined;
  onSourceChange: (source: NewsSource | undefined) => void;
}

export function NewsFilters({ currencies, onCurrenciesChange, source, onSourceChange }: NewsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        type="text"
        value={currencies}
        onChange={(e) => onCurrenciesChange(e.target.value.toUpperCase())}
        placeholder="Filter by coin, e.g. BTC,SOL"
        aria-label="Filter news by coin"
        className="rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)] sm:w-64"
        style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
      />
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => {
          const active = s.value === source;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onSourceChange(s.value)}
              aria-pressed={active}
              className="rounded-full border px-3 py-1 text-xs font-bold"
              style={{
                borderColor: active ? 'transparent' : 'var(--border)',
                background: active ? 'var(--green)' : 'var(--card)',
                color: active ? 'var(--green-fg)' : 'var(--muted)',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

(A coin ticker filter is a data value — `font-mono` added; `aria-label`/`aria-pressed` added to
match the accessibility affordances established for the equivalent Pools-page search/filter
controls in the previous plan on this branch, applied here proactively rather than needing a
follow-up review round.)

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the real dev server, navigate to `/news`. Confirm: the page renders on the dark palette,
typing a coin filter and clicking a source pill both still work against real news data, and the
"How to read crypto news" `<details>` expands correctly. Take a real screenshot (with a
freshly-checked timestamp — do not cite any pre-existing screenshot file) and compare against
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image-1.png`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/NewsPage.tsx frontend/src/components/NewsFilters.tsx
git commit -m "feat(frontend): restyle News page and filters for the dark terminal look"
```

---

### Task 2: Restyle `ScreenerPage.tsx` and `PositioningTable.tsx`

**Files:**
- Modify: `frontend/src/pages/ScreenerPage.tsx`
- Modify: `frontend/src/components/PositioningTable.tsx`

**Interfaces:**
- Consumes: `PositioningTable`/`TrendingWatch`/`PumpWatch`/`PillButton` (unchanged props).
- Produces: no exports change.

No test file — visual-only. Verify via Step 3.

- [ ] **Step 1: Replace `ScreenerPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { PositioningTable } from '../components/PositioningTable';
import { TrendingWatch } from '../components/TrendingWatch';
import { PumpWatch } from '../components/PumpWatch';
import { PillButton } from '../components/PillButton';
import { fetchMajors, fetchTrending, fetchPumpWatch } from '../lib/api/screener';
import type { MajorsResponse, TrendingCoin, PumpCandidate } from '../types/screener';

export function ScreenerPage() {
  const [majorsStatus, setMajorsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [majors, setMajors] = useState<MajorsResponse | null>(null);
  const [majorsError, setMajorsError] = useState<string | undefined>(undefined);
  const [majorsRequestId, setMajorsRequestId] = useState(0);

  const [trendingStatus, setTrendingStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [trendingError, setTrendingError] = useState<string | undefined>(undefined);
  const [trendingRequestId, setTrendingRequestId] = useState(0);

  const [pumpStatus, setPumpStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pumpCandidates, setPumpCandidates] = useState<PumpCandidate[]>([]);
  const [pumpError, setPumpError] = useState<string | undefined>(undefined);
  const [pumpRequestId, setPumpRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMajorsStatus('loading');
    fetchMajors()
      .then((result) => {
        if (cancelled) return;
        setMajors(result);
        setMajorsStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMajorsError(err instanceof Error ? err.message : 'Failed to load market positioning.');
        setMajorsStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [majorsRequestId]);

  useEffect(() => {
    let cancelled = false;
    setTrendingStatus('loading');
    fetchTrending()
      .then((result) => {
        if (cancelled) return;
        setTrending(result);
        setTrendingStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTrendingError(err instanceof Error ? err.message : 'Failed to load trending coins.');
        setTrendingStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [trendingRequestId]);

  useEffect(() => {
    let cancelled = false;
    setPumpStatus('loading');
    fetchPumpWatch()
      .then((result) => {
        if (cancelled) return;
        setPumpCandidates(result);
        setPumpStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPumpError(err instanceof Error ? err.message : 'Failed to load pump watch.');
        setPumpStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pumpRequestId]);

  return (
    <div className="page-enter space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Screener
      </h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Three independent signals: current futures market positioning on major pairs, coins
        seeing a spike in search interest, and freshly created pools showing an unusual price
        move. None of these panels is investment advice — see the FAQ for how to read each term.
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Market Positioning
        </h2>
        {majorsStatus === 'loading' ? (
          <div className="h-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ) : majorsStatus === 'error' ? (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <p style={{ color: 'var(--red)' }}>{majorsError}</p>
            <PillButton onClick={() => setMajorsRequestId((n) => n + 1)} className="mt-2 text-xs">
              Retry
            </PillButton>
          </div>
        ) : (
          <PositioningTable pairs={majors!.pairs} topLongSymbols={majors!.topLongSymbols} topShortSymbols={majors!.topShortSymbols} />
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Trending / Narrative Watch
        </h2>
        <TrendingWatch
          status={trendingStatus}
          coins={trending}
          errorMessage={trendingError}
          onRetry={() => setTrendingRequestId((n) => n + 1)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Pump Watch
        </h2>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Pools created in the last 72 hours with a 6h price move of 25%+ and meaningful volume —
          computed from raw on-chain data across all networks GeckoTerminal indexes, not a
          third-party trending list. A "News" tag means a recent (last 48h) article was found for
          that token; no tag doesn't mean nothing's happening, just that nothing's been published
          yet. Not investment advice — verify independently.
        </p>
        <PumpWatch
          status={pumpStatus}
          candidates={pumpCandidates}
          errorMessage={pumpError}
          onRetry={() => setPumpRequestId((n) => n + 1)}
        />
      </div>
    </div>
  );
}
```

(Note: the three `<h2>` section headings change from `--text-secondary` to `--text` here, not
`--muted` — these are `font-semibold` section headers, matching the "bold heading → `--text`"
half of the Global Constraint's judgment rule, consistent with how `IlCalculator.tsx`'s own
`font-semibold` heading was migrated in the previous plan.)

- [ ] **Step 2: Replace `PositioningTable.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { PairPositioning } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
import { Badge } from './Badge';

type SortKey = 'buyRatio' | 'fundingRate' | 'price24hPct';

const columns: { key: SortKey; label: string; termKey?: string }[] = [
  { key: 'buyRatio', label: 'Long/Short Ratio', termKey: 'longShortRatio' },
  { key: 'fundingRate', label: 'Funding Rate', termKey: 'fundingRate' },
  { key: 'price24hPct', label: '24h Change' },
];

const GRID_COLS = 'grid-cols-[1.5fr_1fr_1fr_1fr]';

interface PositioningTableProps {
  pairs: PairPositioning[];
  topLongSymbols: string[];
  topShortSymbols: string[];
}

export function PositioningTable({ pairs, topLongSymbols, topShortSymbols }: PositioningTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('buyRatio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...pairs];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [pairs, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="space-y-1.5 text-sm">
        <div className={`grid ${GRID_COLS} gap-4 border border-transparent px-4`}>
          <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Pair
          </span>
          {columns.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleSort(col.key)}
              className="text-right text-xs font-medium"
              style={{ color: 'var(--muted)' }}
            >
              {col.termKey ? (
                <Tooltip termKey={col.termKey} interactive={false}>
                  {col.label}
                </Tooltip>
              ) : (
                col.label
              )}
              {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          ))}
        </div>
        {sorted.map((pair) => {
          const isTopLong = topLongSymbols.includes(pair.symbol);
          const isTopShort = topShortSymbols.includes(pair.symbol);
          return (
            <div
              key={pair.symbol}
              className={`grid ${GRID_COLS} items-center gap-4 rounded-xl border px-4 py-3`}
              style={{
                borderColor: isTopLong ? 'var(--green)' : 'var(--border)',
                background: isTopLong ? 'linear-gradient(to right, var(--green-subtle), var(--card))' : 'var(--card)',
              }}
            >
              <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
                {pair.symbol}
                {isTopLong ? <Badge variant="accent">Long-leaning</Badge> : null}
                {isTopShort ? <Badge variant="critical">Short-leaning</Badge> : null}
              </div>
              <div className="text-right tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                {(pair.buyRatio * 100).toFixed(1)}% / {(pair.sellRatio * 100).toFixed(1)}%
              </div>
              <div className="text-right tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                {formatPercent(pair.fundingRate * 100, 4)}
              </div>
              <div
                className="text-right tabular-nums"
                style={{ color: pair.price24hPct >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}
              >
                {formatPercent(pair.price24hPct)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

(This already matches the mockup's green-outlined "LONG-LEANING" row treatment structurally —
only tokens change. `font-mono` added to the three numeric columns, which didn't have it before.)

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the dev server, navigate to `/screener`. Confirm the Market Positioning table renders with
real futures data, long-leaning rows show the green outline/gradient, short-leaning rows show the
red badge, and column-header sorting still works. Take a real, freshly-timestamped screenshot and
compare against
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image-3.png`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ScreenerPage.tsx frontend/src/components/PositioningTable.tsx
git commit -m "feat(frontend): restyle Screener page and positioning table for the dark terminal look"
```

---

### Task 3: Restyle `TrendingWatch.tsx` and `PumpWatch.tsx`

**Files:**
- Modify: `frontend/src/components/TrendingWatch.tsx`
- Modify: `frontend/src/components/PumpWatch.tsx`

**Interfaces:**
- Consumes: `Tooltip`/`Badge`/`PillButton` (unchanged props).
- Produces: no exports change.

No test file — visual-only. Verify via Step 3.

- [ ] **Step 1: Replace `TrendingWatch.tsx`**

```tsx
import type { TrendingCoin } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';
import { PillButton } from './PillButton';

interface TrendingWatchProps {
  status: 'loading' | 'error' | 'ready';
  coins: TrendingCoin[];
  errorMessage?: string;
  onRetry: () => void;
}

export function TrendingWatch({ status, coins, errorMessage, onRetry }: TrendingWatchProps) {
  if (status === 'loading') {
    return (
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 w-40 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Failed to load trending coins.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Search-interest signal from CoinGecko — not a return-potential score. Sorted smallest/most speculative market
        cap first.
      </p>
      <div className="flex flex-wrap gap-2">
        {coins.map((coin) => (
          <div key={coin.id} className="min-w-[160px] rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {coin.symbol}
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: coin.priceChangePct24h >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}
              >
                {formatPercent(coin.priceChangePct24h)}
              </span>
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              {coin.name} · {coin.marketCapRank !== null ? <Tooltip termKey="marketCapRank">rank #{coin.marketCapRank}</Tooltip> : 'unranked'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `PumpWatch.tsx`**

```tsx
import type { PumpCandidate } from '../types/screener';
import { formatPercent, formatUsdCompact } from '../lib/format';
import { Badge } from './Badge';
import { PillButton } from './PillButton';

interface PumpWatchProps {
  status: 'loading' | 'error' | 'ready';
  candidates: PumpCandidate[];
  errorMessage?: string;
  onRetry: () => void;
}

function poolAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return '<1h old';
  if (hours < 24) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

export function PumpWatch({ status, candidates, errorMessage, onRetry }: PumpWatchProps) {
  if (status === 'loading') {
    return (
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'Failed to load pump watch.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}>
        No pools currently match the pump criteria — check back soon.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {candidates.map((candidate) => (
        <div
          key={candidate.poolId}
          className="min-w-[180px] rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <a
            href={candidate.poolUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 hover:opacity-80"
          >
            <span className="font-semibold" style={{ color: 'var(--text)' }}>
              {candidate.symbol}
            </span>
            <span className="tabular-nums text-xs font-semibold" style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
              +{formatPercent(candidate.priceChangePct6h)}
            </span>
          </a>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {candidate.network} · {formatUsdCompact(candidate.volumeUsd24h)} vol · {poolAge(candidate.poolCreatedAt)}
          </div>
          {candidate.news ? (
            <a
              href={candidate.news.url}
              target="_blank"
              rel="noreferrer"
              title={candidate.news.title}
              className="mt-1.5 inline-block hover:opacity-80"
            >
              <Badge variant="accent">News</Badge>
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the dev server, navigate to `/screener` and check the Trending/Narrative Watch and Pump
Watch sections specifically. Confirm real data renders correctly on the dark palette with green/
red percentage coloring. Take a real, freshly-timestamped screenshot.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TrendingWatch.tsx frontend/src/components/PumpWatch.tsx
git commit -m "feat(frontend): restyle Trending Watch and Pump Watch for the dark terminal look"
```

---

### Task 4: Restyle `FaqPage.tsx` and `MyPositionsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/FaqPage.tsx`
- Modify: `frontend/src/pages/MyPositionsPage.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no exports change.

No test file — visual-only. Verify via Step 3.

- [ ] **Step 1: Replace `FaqPage.tsx`**

```tsx
import { glossary, type GlossaryCategory } from '../content/glossary';

const CATEGORY_ORDER: { key: GlossaryCategory; label: string }[] = [
  { key: 'web3-basics', label: 'Web3 & Crypto Basics' },
  { key: 'dlmm', label: 'DLMM & Liquidity Pools' },
  { key: 'trading', label: 'Screener & Trading' },
  { key: 'news', label: 'Reading Crypto News' },
];

export function FaqPage() {
  return (
    <div className="page-enter space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        FAQ
      </h1>

      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <h2 className="mb-2 font-semibold" style={{ color: 'var(--text)' }}>
          About this dashboard
        </h2>
        <p style={{ color: 'var(--muted)' }}>
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. The News, Screener, and Pools pages all use live public APIs and may be
          delayed, incomplete, or wrong. Always verify independently before making decisions.
        </p>
      </div>

      {CATEGORY_ORDER.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {cat.label}
          </h2>
          <div className="space-y-1.5">
            {glossary
              .filter((entry) => entry.category === cat.key)
              .map((entry) => (
                <details key={entry.key} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                  <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {entry.term}
                  </summary>
                  <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
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

- [ ] **Step 2: Replace `MyPositionsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchPositions } from '../lib/api/positions';
import { usePositionsRefresh } from '../lib/positionsRefresh';
import type { Position } from '../types/liquidity';

export function MyPositionsPage() {
  const { connected, publicKey } = useWallet();
  const { version } = usePositionsRefresh();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [positions, setPositions] = useState<Position[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!connected || !publicKey) return;

    let cancelled = false;
    setStatus('loading');

    fetchPositions(publicKey.toBase58())
      .then((rows) => {
        if (cancelled) return;
        setPositions(rows);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load positions.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, version]);

  if (!connected) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Connect a wallet to see your positions.
      </p>
    );
  }

  if (status === 'loading') {
    return <div className="h-24 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (status === 'error') {
    return (
      <p className="text-sm" style={{ color: 'var(--red)' }}>
        {errorMessage}
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No positions yet.
      </p>
    );
  }

  return (
    <div className="page-enter space-y-3">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        My Positions
      </h1>
      <ul className="space-y-1.5">
        {positions.map((position) => (
          <li key={position.positionAddress} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <p style={{ color: 'var(--text)' }}>Pool: {position.poolAddress}</p>
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Position: {position.positionAddress}</p>
            <a href={`https://solscan.io/account/${position.positionAddress}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
              View on Solscan
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

(The position-address line gets `font-mono` — it's a wallet/account address, a data value per the
Global Constraint, which didn't have it before. The `page-enter` class is added only to the
`ready` return branch's root div, matching the pattern already used by `PoolDetailPage.tsx` where
the fade-in fires once real content is present, not on every early-return branch — see that
plan's final review, which noted this is arguably the nicer behavior.)

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the dev server, navigate to `/faq` (confirm the accordion sections expand/collapse
correctly and match
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image-4.png`) and `/positions`
(confirm both the disconnected-wallet state and, if a wallet is connected with real positions, the
connected state — compare against
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image-5.png`). Take real,
freshly-timestamped screenshots for both.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/FaqPage.tsx frontend/src/pages/MyPositionsPage.tsx
git commit -m "feat(frontend): restyle FAQ and My Positions pages for the dark terminal look"
```

## Verification

1. `cd frontend && npx tsc -b && npm run build` — clean, both succeed.
2. `grep -rn "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\b\|var(--accent-bg\|var(--accent-fg\|var(--status-" frontend/src/pages/NewsPage.tsx frontend/src/components/NewsFilters.tsx frontend/src/pages/ScreenerPage.tsx frontend/src/components/PositioningTable.tsx frontend/src/components/TrendingWatch.tsx frontend/src/components/PumpWatch.tsx frontend/src/pages/FaqPage.tsx frontend/src/pages/MyPositionsPage.tsx` returns zero matches.
3. Manual verification: real dev server, screenshots of News, Screener (all three panels), FAQ, and My Positions — compare against the mockup screenshots. Every screenshot cited in any task report must have its timestamp independently checked before being cited as evidence — this branch has had two prior incidents of stale/unverified screenshots being cited as current, and that discipline must continue.
