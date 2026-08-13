# Dark Terminal Redesign — Pools & Pool Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Pools list and Pool Detail pages (and their supporting components: `PoolTable`,
`IlCalculator`, `AddLiquidityForm`, `RelatedNews`, `Tooltip`) to the dark terminal design system,
adding the mockup's search/sort controls to the pool list — all real data and behavior unchanged.

**Architecture:** Pure page-level restyle continuing the design-system foundation (already merged):
migrate every old-token reference to the new palette, add two new client-side-only UX features to
the pool list (search-by-name filter, TVL/Volume/APR sort-pill row) that operate on data already in
memory, and drop the mockup's per-row sparkline (no real per-pool historical array exists on the
list endpoint today — noted as a deferred backend enhancement, not faked).

**Tech Stack:** React 19, TypeScript, Tailwind v4 — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-dark-terminal-redesign-design.md`

## Global Constraints

- Every themed color is a CSS variable via `var(--token)` — never a hardcoded hex in a `.tsx`
  file. Use only tokens that exist in `frontend/src/index.css` as of this branch's tip (`--bg`,
  `--surface`, `--card`, `--card2`, `--border`, `--border2`, `--green` family, `--text`/`--muted`/
  `--dim`, `--red` family, `--amber` family, `--series-blue`/`--series-violet`, `--green-fg`,
  `--green-gradient-end`).
- Old-token migration mapping, established by the design-system foundation plan's own fix rounds —
  apply consistently:
  `--surface-1`→`--card`, `--surface-page`→`--bg`, `--text-primary`→`--text`,
  `--text-secondary`→`--text` (bold headings) or `--muted` (regular-weight captions — judge by
  weight, matching the precedent set when `HistoryChart.tsx`/`IlCalculator.tsx` were migrated),
  `--text-muted`→`--muted`, `--status-critical`→`--red`, `--status-good`→`--green`,
  `--accent`→`--green`, `--accent-fg`→`--green-fg`, `--series-green`→`--green`,
  `--series-red`→`--red` (`--series-blue`/`--series-violet` are unchanged — they're real tokens
  already re-colored for this palette).
- Numeric/data values (TVL, volume, fee APR, prices, deposit amounts, days) use
  `fontFamily: 'var(--font-mono)'`.
- No prop/export signature changes to any shared component (`StatTile`, `PillButton`, `Badge`,
  `HistoryChart`, `Tooltip`) — this plan only touches page-level files and components local to the
  Pools feature.
- No change to any data-fetching logic, loading/error/not-found state machines, or the
  `calculateNetYield` IL math — this is a styling and two-new-client-side-filters pass only.

---

### Task 1: Restyle `PoolListPage.tsx` and `PoolTable.tsx`, add search and sort controls

**Files:**
- Modify: `frontend/src/pages/PoolListPage.tsx`
- Modify: `frontend/src/components/PoolTable.tsx`

**Interfaces:**
- Consumes: `PoolWithStats[]` (existing type, unchanged), `fetchPools()` (existing, unchanged),
  `StatTile`/`PillButton` (existing, unchanged props).
- Produces: no new exports — `PoolTable` keeps its `{ pools: PoolWithStats[] }` prop signature.
  `PoolListPage` gains internal `search`/`sortKey` state, not exposed to any consumer.

Reference: `C:\Users\Brian\Downloads\Website Improvement Suggestions\src\components\PoolsPage.tsx`
for the stat-tile icon/glow treatment, search input, and sort-pill row. The mockup's per-row 7-day
sparkline (via `Sparkline`/`genSpark`) is deliberately NOT ported — the real `/api/pools` response
has no per-pool historical array, and fabricating one client-side (or fetching each of 50 pools'
full history just for a list-page decoration) is out of scope for a styling pass. Note this in a
code comment; it's a real, deferred backend enhancement, not an oversight.

No test file — this frontend has zero `.test.tsx` files; verification is `npx tsc -b` plus a real
manual visual check (Step 4).

- [ ] **Step 1: Restyle `PoolListPage.tsx` and add the search input + sort-pill row**

Replace `frontend/src/pages/PoolListPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { PoolTable } from '../components/PoolTable';
import { StatTile } from '../components/StatTile';
import { PillButton } from '../components/PillButton';
import { fetchPools } from '../lib/api/pools';
import { formatUsdCompact } from '../lib/format';
import type { PoolWithStats } from '../types/pool';

type SortKey = 'tvlUsd' | 'volume24hUsd' | 'feeApr24h';

const SORT_LABELS: Record<SortKey, string> = {
  tvlUsd: 'TVL',
  volume24hUsd: 'Volume',
  feeApr24h: 'APR',
};

export function PoolListPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pools, setPools] = useState<PoolWithStats[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('tvlUsd');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchPools()
      .then((result) => {
        if (cancelled) return;
        setPools(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load pools.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const filtered = useMemo(
    () => pools.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [pools, search],
  );

  return (
    <div className="page-enter space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana, live from Meteora's public API,
        curated to the top 50 by TVL — hover or tab to the underlined column headers for what
        each term means.
      </p>
      {status === 'loading' ? (
        <div className="h-64 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      ) : status === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <p style={{ color: 'var(--red)' }}>{errorMessage}</p>
          <PillButton onClick={() => setRequestId((n) => n + 1)} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label="Total TVL"
              value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0))}
              variant="hero"
            />
            <StatTile label="24h Volume" value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.volume24hUsd, 0))} />
            <StatTile label="Active Pools" value={String(pools.length)} />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative max-w-[280px] flex-1">
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--muted)"
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              >
                <circle cx={11} cy={11} r={8} />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pools…"
                className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
              />
            </div>
            <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: sortKey === key ? 'var(--green-subtle)' : 'transparent',
                    color: sortKey === key ? 'var(--green)' : 'var(--muted)',
                  }}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs" style={{ color: 'var(--dim)' }}>
              {filtered.length} pools
            </span>
          </div>

          <PoolTable pools={filtered} sortKey={sortKey} />
        </>
      )}
    </div>
  );
}
```

(The mockup's per-row sparkline column is intentionally omitted — no real per-pool historical
array exists on `/api/pools` today. `PoolTable` gains a `sortKey` prop below so the sort-pill row
here drives the same sort the table already implements internally via column-header clicks.)

- [ ] **Step 2: Restyle `PoolTable.tsx` and accept an external `sortKey`**

Replace `frontend/src/components/PoolTable.tsx`:

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

const GRID_COLS = 'grid-cols-[2fr_1fr_1fr_1fr]';

export function PoolTable({ pools, sortKey: externalSortKey }: { pools: PoolWithStats[]; sortKey?: SortKey }) {
  const [internalSortKey, setInternalSortKey] = useState<SortKey>('tvlUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  const sortKey = externalSortKey ?? internalSortKey;

  const sorted = useMemo(() => {
    const copy = [...pools];
    copy.sort((a, b) => {
      const diff = a.stats[sortKey] - b.stats[sortKey];
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [pools, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setInternalSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="space-y-1.5 text-sm">
        <div className={`grid ${GRID_COLS} gap-4 border border-transparent px-4`}>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--dim)' }}>
            Pool
          </span>
          {columns.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleSort(col.key)}
              className="text-right text-[10px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--dim)' }}
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
        {sorted.map((pool) => (
          <div
            key={pool.id}
            role="button"
            tabIndex={0}
            aria-label={`View ${pool.name} pool details`}
            onClick={() => navigate(`/pools/${pool.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/pools/${pool.id}`);
              }
            }}
            className={`grid ${GRID_COLS} cursor-pointer items-center gap-4 rounded-xl border px-4 py-3`}
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <div>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>
                {pool.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                <Tooltip termKey="binStep" interactive={false}>
                  bin step
                </Tooltip>{' '}
                {pool.binStep} · fee {(pool.baseFeeBps / 100).toFixed(2)}%
              </div>
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {formatUsdCompact(pool.stats.tvlUsd)}
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {formatUsdCompact(pool.stats.volume24hUsd)}
            </div>
            <div className="text-right tabular-nums font-semibold" style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
              {formatPercent(pool.stats.feeApr24h)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

(`sortKey` is optional so `PoolTable` still works standalone with its own column-header-click sort
if ever used without the list page's pill row — but `PoolListPage` always passes it now, so the
pill row and the table stay in sync. The `hover:opacity-80` class was dropped in favor of the
mockup's static-card look — hover feedback comes from cursor + the `role="button"` semantics,
matching the mockup's row treatment, which uses hover-state background/border changes that would
need local `useState` per row; given this table already has 50 rows, skip per-row hover state for
this pass and rely on the pointer cursor — this is a deliberate, minor simplification, not an
oversight.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the real dev server (`npm run dev`), navigate to `/` (Pools list). Confirm: stat tiles
render with the hero TVL treatment, the search input filters the real pool list as you type, the
sort-pill row changes highlight and re-sorts the real table, and clicking a pool row navigates to
its detail page. Take a real screenshot (Playwright if available, saved to the scratchpad — not
inside `frontend/`) and compare against
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image.png`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PoolListPage.tsx frontend/src/components/PoolTable.tsx
git commit -m "feat(frontend): restyle Pools list, add search and sort-pill controls"
```

---

### Task 2: Restyle `PoolDetailPage.tsx`

**Files:**
- Modify: `frontend/src/pages/PoolDetailPage.tsx`

**Interfaces:**
- Consumes: `HistoryChart`/`StatTile`/`PillButton`/`Tooltip` (all already restyled by the
  design-system foundation plan, unchanged props), `IlCalculator`/`AddLiquidityForm`/`RelatedNews`
  (restyled by Task 3 of this plan — their own props are unchanged, so this task can be done in
  either order, but this task's own JSX only touches page-level markup, not those components'
  internals).
- Produces: no exports change.

No test file — visual-only. Verify via Step 3.

- [ ] **Step 1: Migrate every old-token reference to the new palette**

In `frontend/src/pages/PoolDetailPage.tsx`, apply these exact replacements (every occurrence):

- `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}` (loading skeleton,
  error card) → `style={{ borderColor: 'var(--border)', background: 'var(--card)' }}`
- `style={{ color: 'var(--text-primary)' }}` ("Pool not found." text, `<h1>`) →
  `style={{ color: 'var(--text)' }}`
- `style={{ color: 'var(--accent)' }}` (both "Back to pool list" links) →
  `style={{ color: 'var(--green)' }}`
- `style={{ color: 'var(--status-critical)' }}` (error message) → `style={{ color: 'var(--red)' }}`
- `className="text-xs" style={{ color: 'var(--text-muted)' }}` (bin-step/fee/price subtitle) →
  `style={{ color: 'var(--muted)' }}` (unchanged className)
- `accent="var(--series-green)"` (Fee APR StatTile) → `accent="var(--green)"`
- The "not enough recorded history" empty-state card's
  `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}`
  → `style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}`
- The "Connect a wallet to add liquidity" paragraph's `style={{ color: 'var(--text-muted)' }}` →
  `style={{ color: 'var(--muted)' }}`

Do NOT change the `color="var(--series-blue)"` / `color="var(--series-violet)"` /
`color="var(--series-green)"` props passed to the three `<HistoryChart>` calls — those three
tokens are unchanged in the new palette (confirm by checking `index.css`; only `--series-green`/
`--series-red` were retired as separate tokens, not `--series-blue`/`--series-violet`, and the
Fee APR chart's `color="var(--series-green)"` prop should become `color="var(--green)"` since
`--series-green` no longer exists — this is the one `HistoryChart` call-site color that DOES
change, matching the StatTile accent change above).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Start the dev server, navigate to any real pool's detail page (click through from the Pools list).
Confirm: header, stat tiles, all three charts, the "not enough history" fallback (if a freshly
curated pool has one — otherwise skip this specific check), and the wallet-disconnected message
all render on the dark palette with no leftover light-theme colors. Take a real screenshot and
compare against
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image-2.png`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PoolDetailPage.tsx
git commit -m "feat(frontend): restyle Pool Detail page header and layout"
```

---

### Task 3: Restyle `IlCalculator.tsx`, `AddLiquidityForm.tsx`, `RelatedNews.tsx`, `Tooltip.tsx`

**Files:**
- Modify: `frontend/src/components/IlCalculator.tsx`
- Modify: `frontend/src/components/AddLiquidityForm.tsx`
- Modify: `frontend/src/components/RelatedNews.tsx`
- Modify: `frontend/src/components/Tooltip.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no prop/export changes to any of the four components.

No test file — visual-only. Verify via Step 5.

- [ ] **Step 1: Migrate `IlCalculator.tsx`**

Apply these exact replacements (every occurrence):

- Outer card `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}` →
  `style={{ borderColor: 'var(--border)', background: 'var(--card)' }}`
- Heading `style={{ color: 'var(--text-secondary)' }}` → `style={{ color: 'var(--text)' }}`
  (bold `font-semibold` heading, per the Global Constraint's bold-heading rule)
- Every `<label>`'s `style={{ color: 'var(--text-muted)' }}` (4 occurrences) →
  `style={{ color: 'var(--muted)' }}`
- Every `<input>`/`<select>`'s
  `style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}`
  (5 occurrences) →
  `style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}`
  (adding `font-mono` since these are numeric/date inputs)
- The entry-price/range explanatory paragraph's `style={{ color: 'var(--text-muted)' }}` →
  `style={{ color: 'var(--muted)' }}`
- `accent="var(--series-green)"` (Fees earned) → `accent="var(--green)"`
- `accent="var(--series-red)"` (Impermanent loss) → `accent="var(--red)"`
- `accent={result.netYieldUsd >= 0 ? 'var(--status-good)' : 'var(--status-critical)'}` (Net
  yield) → `accent={result.netYieldUsd >= 0 ? 'var(--green)' : 'var(--red)'}`
- The `Result` sub-component's label `style={{ color: 'var(--text-muted)' }}` →
  `style={{ color: 'var(--muted)' }}`, and its value `style={{ color: accent ?? 'var(--text-primary)' }}`
  → `style={{ color: accent ?? 'var(--text)', fontFamily: 'var(--font-mono)' }}` (adding
  `font-mono` — these are the four result numbers).

- [ ] **Step 2: Migrate `AddLiquidityForm.tsx`**

Apply these exact replacements (every occurrence):

- Outer card `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}` →
  `style={{ borderColor: 'var(--border)', background: 'var(--card)' }}`
- Heading `style={{ color: 'var(--text-primary)' }}` → `style={{ color: 'var(--text)' }}`
- Every input's
  `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}`
  (5 occurrences) →
  `style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}`
- `style={{ color: 'var(--status-critical)' }}` (error paragraph) → `style={{ color: 'var(--red)' }}`
- `style={{ color: 'var(--status-good)' }}` (success paragraph) → `style={{ color: 'var(--green)' }}`
- `style={{ color: 'var(--accent)' }}` (Solscan link) → `style={{ color: 'var(--green)' }}`

- [ ] **Step 3: Migrate `RelatedNews.tsx`**

Apply these exact replacements (every occurrence):

- Outer card `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}` →
  `style={{ borderColor: 'var(--border)', background: 'var(--card)' }}`
- Heading `style={{ color: 'var(--text-secondary)' }}` → `style={{ color: 'var(--text)' }}`
- Loading skeleton `style={{ borderColor: 'var(--border)', background: 'var(--surface-page)' }}` →
  `style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}`
- `style={{ color: 'var(--status-critical)' }}` (error message) → `style={{ color: 'var(--red)' }}`
- Both token-group heading and "no coverage" paragraph's `style={{ color: 'var(--text-muted)' }}`
  (2 occurrences) → `style={{ color: 'var(--muted)' }}`
- Article-card `style={{ borderColor: 'var(--border)', background: 'var(--surface-page)' }}` →
  `style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}`
- Article title `style={{ color: 'var(--text-primary)' }}` → `style={{ color: 'var(--text)' }}`
- Article meta row `style={{ color: 'var(--text-muted)' }}` → `style={{ color: 'var(--muted)' }}`

- [ ] **Step 4: Migrate `Tooltip.tsx`**

Apply these exact replacements:

- `borderColor: 'var(--border)'` → unchanged (token name/value both still valid)
- `background: 'var(--surface-1)'` → `background: 'var(--card2)'` (a tooltip popover is a
  raised-above-card surface, matching the same rule already applied to `HistoryChart`'s
  `CustomTooltip` in the design-system foundation plan — use `--card2`, not `--card`, for
  consistency with that precedent)
- `color: 'var(--text-secondary)'` → `color: 'var(--text)'`

- [ ] **Step 5: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the dev server, navigate to a real pool detail page, expand the IL calculator (change
inputs, confirm real numbers update in monospace), check a pool's related-news panel, hover a
tooltip term (e.g. "bin step"), and — if a wallet is connected — view the Add Liquidity form.
Confirm all four components render correctly on the dark palette. Take a real screenshot and
compare against the mockup's Pool Detail screenshot
(`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image-2.png`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IlCalculator.tsx frontend/src/components/AddLiquidityForm.tsx frontend/src/components/RelatedNews.tsx frontend/src/components/Tooltip.tsx
git commit -m "feat(frontend): restyle IL calculator, Add Liquidity form, related news, and tooltips"
```

## Verification

1. `cd frontend && npx tsc -b && npm run build` — clean, both succeed.
2. `grep -rn "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\b\|var(--status-\|var(--series-green\|var(--series-red" frontend/src/pages/PoolListPage.tsx frontend/src/pages/PoolDetailPage.tsx frontend/src/components/PoolTable.tsx frontend/src/components/IlCalculator.tsx frontend/src/components/AddLiquidityForm.tsx frontend/src/components/RelatedNews.tsx frontend/src/components/Tooltip.tsx` returns zero matches.
3. Manual verification: real dev server, screenshot the Pools list (search + sort working) and a Pool Detail page (charts, IL calculator, related news, Add Liquidity form) — compare against the mockup screenshots.
