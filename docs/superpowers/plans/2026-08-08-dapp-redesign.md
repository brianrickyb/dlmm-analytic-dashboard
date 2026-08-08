# dApp Visual Redesign ("Clean DeFi Modern") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every existing page and shared component in this dashboard to the "Clean DeFi Modern" visual language (emerald accent, bold typography, card/row-card layout) in both light and dark mode, with zero functional or data changes.

**Architecture:** Pure CSS-token + JSX-structure pass. `frontend/src/index.css` gets new token *values* under the same token *names*, so most components pick up the new palette automatically. A handful of components restructure `<table>` markup into gapped "row-card" `<div>` grids, add a shared `Badge` component, and swap the old `--series-blue` "primary action" color for the new `--accent` token on buttons/links. No backend, route, or data-shape changes anywhere in this plan.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 (`@import "tailwindcss"`, arbitrary-value classes supported natively), react-router-dom v7, recharts (chart internals untouched).

## Global Constraints

- New design tokens (same names, new values) in `frontend/src/index.css`:
  | Token | Light | Dark |
  |---|---|---|
  | `--surface-page` | `#fafaf9` | `#0a0d0b` |
  | `--surface-1` | `#ffffff` | `#111612` |
  | `--text-primary` | `#18181b` | `#ffffff` |
  | `--text-secondary` | `#3f3f46` | `#dfe3e1` |
  | `--text-muted` | `#a1a1aa` | `#8b9490` |
  | `--border` / `--gridline` | `#e7e5e4` | `#1e2622` |
  | `--accent` (new) | `#059669` | `#34d399` |
  | `--accent-bg` (new) | `#ecfdf5` | `rgba(52,211,153,.12)` |
  - `--series-*`, `--status-*`, `--axis` are **unchanged** — leave every value exactly as it is today.
- Card/row radius: bump `rounded-lg` (8px) → `rounded-xl` (12px) everywhere a card/tile/row currently uses `rounded-lg`. Small chrome elements (dropdown menus, popovers) that used the Tailwind default `rounded` (4px) bump one step to `rounded-lg` (8px). Pills/buttons that become "filled accent" elements use `rounded-full`. Form `<input>`/`<select>` elements keep their existing default `rounded` — not in scope.
- Row-card pattern (Pools table, Screener positioning table): replace the single bordered `<table>` with a `space-y-1.5` stack — a plain (no border/background) header row of column-sort buttons, followed by one individually-bordered, `rounded-xl` `<div>` per data row, using a shared CSS grid `grid-cols-[…]` template so header and row columns align.
- Badge pattern (new shared component `frontend/src/components/Badge.tsx`): `rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide`, tinted background + matching text color, variants `accent` (`--accent-bg`/`--accent`), `good` (tinted `--status-good`), `critical` (tinted `--status-critical`), `warning` (tinted `--status-warning`).
- Typography: page `<h1>` titles become `text-2xl font-extrabold tracking-tight` (was `text-xl font-semibold`); section `<h2>` labels and card headers step from `font-medium`/`font-semibold` up one weight (`font-semibold`/`font-bold`). Font stack itself (`system-ui, -apple-system, "Segoe UI", sans-serif`) does not change.
- **Accent-as-solid-fill text color:** any element using `background: var(--accent)` as a **solid fill** (not the tinted `--accent-bg`) must use fixed dark text `color: '#052e1f'`, not white. Reason: the dark-mode accent `#34d399` is light/bright — white text on it is ~1.9:1 contrast (fails WCAG); `#052e1f` (near-black) passes comfortably against the accent fill in both light and dark mode. This applies to: `WalletConnectButton`'s "Connect Wallet" button, `AddLiquidityForm`'s submit button, `LoginPage`/`SignupPage` submit buttons, `NewsFilters`' active source pill. Text-only usages of `var(--accent)` (links, badges, tinted-pill text) are unaffected — the spec's own token table already validated `--accent` as accessible text-on-surface color.
- `var(--series-blue)` stops being used as a "primary action" button/link color anywhere in `frontend/src`; replace those specific usages with `var(--accent)` (buttons) or `var(--accent-bg)`/`var(--accent)` (tinted pills, links). `var(--series-blue)` stays exactly as-is where it colors an actual chart series line (`HistoryChart` TVL line in `PoolDetailPage.tsx`) — that usage is unchanged.
- Out of scope, do not touch: `UpgradePage.tsx` (doesn't exist on this branch), `PositioningTable.tsx`'s premium "⚡ 2:1" signal (`isPremium` prop doesn't exist on this branch), any animation/motion design, any mobile-specific responsive layout change, any new backend endpoint or data field.
- No new automated component tests are added (project convention — only pure-logic files like `il.ts`/`yield.ts` have unit tests). Every task verifies with `npx tsc --noEmit -p tsconfig.app.json`; the final task does a full manual Playwright pass.

---

### Task 1: Design tokens

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: token names `--surface-page`, `--surface-1`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--gridline`, `--accent` (new), `--accent-bg` (new) — every later task's `style={{ ... }}` calls read these by name, unchanged from today.

- [ ] **Step 1: Replace the token values**

Read the current file first (`frontend/src/index.css`), then replace its entire contents with:

```css
@import "tailwindcss";

:root {
  color-scheme: light;
  --surface-1: #ffffff;
  --surface-page: #fafaf9;
  --text-primary: #18181b;
  --text-secondary: #3f3f46;
  --text-muted: #a1a1aa;
  --gridline: #e7e5e4;
  --axis: #c3c2b7;
  --border: #e7e5e4;
  --accent: #059669;
  --accent-bg: #ecfdf5;

  --series-blue: #2a78d6;
  --series-green: #008300;
  --series-magenta: #e87ba4;
  --series-yellow: #eda100;
  --series-aqua: #1baf7a;
  --series-orange: #eb6834;
  --series-violet: #4a3aa7;
  --series-red: #e34948;

  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-serious: #ec835a;
  --status-critical: #d03b3b;
}

@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --surface-1: #111612;
    --surface-page: #0a0d0b;
    --text-primary: #ffffff;
    --text-secondary: #dfe3e1;
    --text-muted: #8b9490;
    --gridline: #1e2622;
    --axis: #383835;
    --border: #1e2622;
    --accent: #34d399;
    --accent-bg: rgba(52, 211, 153, 0.12);

    --series-blue: #3987e5;
    --series-green: #008300;
    --series-magenta: #d55181;
    --series-yellow: #c98500;
    --series-aqua: #199e70;
    --series-orange: #d95926;
    --series-violet: #9085e9;
    --series-red: #e66767;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --surface-1: #111612;
  --surface-page: #0a0d0b;
  --text-primary: #ffffff;
  --text-secondary: #dfe3e1;
  --text-muted: #8b9490;
  --gridline: #1e2622;
  --axis: #383835;
  --border: #1e2622;
  --accent: #34d399;
  --accent-bg: rgba(52, 211, 153, 0.12);

  --series-blue: #3987e5;
  --series-green: #008300;
  --series-magenta: #d55181;
  --series-yellow: #c98500;
  --series-aqua: #199e70;
  --series-orange: #d95926;
  --series-violet: #9085e9;
  --series-red: #e66767;
}

body {
  margin: 0;
  background: var(--surface-page);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

Note: `--border` was previously `rgba(11,11,11,.1)`/`rgba(255,255,255,.1)` (a semi-transparent black/white) — it's now a flat hex value matching `--gridline`, per the design spec's merged token row. `--gridline` and `--axis` are otherwise unchanged in this task except `--gridline`'s new hex value shown above.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (this is a CSS-only change; the check just confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style(frontend): apply Clean DeFi Modern design tokens"
```

---

### Task 2: Shared UI primitives — Badge, Tooltip, StatTile

**Files:**
- Create: `frontend/src/components/Badge.tsx`
- Modify: `frontend/src/components/Tooltip.tsx`
- Modify: `frontend/src/components/StatTile.tsx`

**Interfaces:**
- Consumes: tokens from Task 1 (`--accent`, `--accent-bg`, `--status-good`, `--status-critical`, `--status-warning`).
- Produces: `Badge({ variant?: 'accent' | 'good' | 'critical' | 'warning', children: ReactNode })` — a `<span>`. Consumed by Task 5 (`PositioningTable.tsx`). `StatTile({ label: ReactNode, value: string, accent?: string })` signature is unchanged — consumed by Task 4 (`PoolListPage.tsx`) and Task 6 (`PoolDetailPage.tsx`).

- [ ] **Step 1: Create the Badge component**

```tsx
import type { ReactNode } from 'react';

type BadgeVariant = 'accent' | 'good' | 'critical' | 'warning';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  good: { bg: 'rgba(12, 163, 12, 0.12)', color: 'var(--status-good)' },
  critical: { bg: 'rgba(208, 59, 59, 0.12)', color: 'var(--status-critical)' },
  warning: { bg: 'rgba(250, 178, 25, 0.12)', color: 'var(--status-warning)' },
};

export function Badge({ variant = 'accent', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const { bg, color } = VARIANT_STYLES[variant];
  return (
    <span className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: bg, color }}>
      {children}
    </span>
  );
}
```

Save as `frontend/src/components/Badge.tsx`.

- [ ] **Step 2: Restyle the Tooltip popover**

Read the current file first (`frontend/src/components/Tooltip.tsx`). Change only the popover's className, from:

```tsx
              className={`fixed z-50 w-56 -translate-x-1/2 rounded border p-2 text-left text-xs font-normal normal-case shadow-sm ${
```

to:

```tsx
              className={`fixed z-50 w-56 -translate-x-1/2 rounded-lg border p-2 text-left text-xs font-normal normal-case shadow-sm ${
```

(`rounded` → `rounded-lg`). Every other line in the file stays exactly as it is today.

- [ ] **Step 3: Restyle StatTile**

Read the current file first (`frontend/src/components/StatTile.tsx`), then replace its entire contents with:

```tsx
import type { ReactNode } from 'react';

export function StatTile({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Badge.tsx frontend/src/components/Tooltip.tsx frontend/src/components/StatTile.tsx
git commit -m "feat(frontend): add Badge component, restyle Tooltip and StatTile"
```

---

### Task 3: Nav shell — Layout, WalletConnectButton

**Files:**
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/components/WalletConnectButton.tsx`

**Interfaces:**
- Consumes: tokens from Task 1.

- [ ] **Step 1: Add an active-route indicator to Layout**

Read the current file first (`frontend/src/components/Layout.tsx`), then replace its entire contents with:

```tsx
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { WalletConnectButton } from './WalletConnectButton';

const NAV_LINKS = [
  { to: '/', label: 'Pools' },
  { to: '/news', label: 'News' },
  { to: '/screener', label: 'Screener' },
  { to: '/faq', label: 'FAQ' },
  { to: '/positions', label: 'My Positions' },
];

function HeaderLink({ to, label }: { to: string; label: ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className="border-b-2 pb-1 font-medium"
      style={{
        borderColor: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/" className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              DLMM Pool Analytics
            </Link>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Meteora DLMM pools on Solana — TVL, volume, fee APR & impermanent loss
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_LINKS.map((link) => (
              <HeaderLink key={link.to} to={link.to} label={link.label} />
            ))}
            {session ? <HeaderLink to="/account" label={session.user.email} /> : <HeaderLink to="/login" label="Login" />}
            <WalletConnectButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Restyle WalletConnectButton**

Read the current file first (`frontend/src/components/WalletConnectButton.tsx`), then replace its entire contents with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { wallets, wallet, select, connect, disconnect, connecting, connected, publicKey } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  async function handleConnectClick() {
    setError(null);
    if (wallet) {
      try {
        await connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect wallet.');
      }
      return;
    }
    setPickerOpen(true);
  }

  function handleSelect(walletName: (typeof wallets)[number]['adapter']['name']) {
    setPickerOpen(false);
    select(walletName);
  }

  if (connected && publicKey) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="rounded-full px-3 py-1.5 text-xs font-bold"
        style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
      >
        {shortenAddress(publicKey.toBase58())}
      </button>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleConnectClick}
        disabled={connecting}
        className="rounded-full px-3 py-1.5 text-sm font-bold"
        style={{ background: 'var(--accent)', color: '#052e1f' }}
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error ? (
        <p className="absolute right-0 mt-1 whitespace-nowrap text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      ) : null}
      {pickerOpen ? (
        <div
          className="absolute right-0 z-10 mt-1 rounded-xl border text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          {wallets.map((w) => (
            <button
              key={w.adapter.name}
              type="button"
              onClick={() => handleSelect(w.adapter.name)}
              className="block w-full px-3 py-1.5 text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              {w.adapter.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/components/WalletConnectButton.tsx
git commit -m "style(frontend): accent nav active-state and wallet pill"
```

---

### Task 4: Pools page

**Files:**
- Modify: `frontend/src/components/PoolTable.tsx`
- Modify: `frontend/src/pages/PoolListPage.tsx`

**Interfaces:**
- Consumes: `Tooltip` (unchanged export), `StatTile` (Task 2).

- [ ] **Step 1: Convert PoolTable to row-cards**

Read the current file first (`frontend/src/components/PoolTable.tsx`), then replace its entire contents with:

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

export function PoolTable({ pools }: { pools: PoolWithStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('tvlUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

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
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="space-y-1.5">
      <div className={`grid ${GRID_COLS} gap-4 px-4`}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Pool
        </span>
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            onClick={() => toggleSort(col.key)}
            className="text-right text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            {col.termKey ? <Tooltip termKey={col.termKey}>{col.label}</Tooltip> : col.label}
            {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
      </div>
      {sorted.map((pool) => (
        <div
          key={pool.id}
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/pools/${pool.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate(`/pools/${pool.id}`);
          }}
          className={`grid ${GRID_COLS} cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 hover:opacity-80`}
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          <div>
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {pool.name}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <Tooltip termKey="binStep">bin step</Tooltip> {pool.binStep} · fee {(pool.baseFeeBps / 100).toFixed(2)}%
            </div>
          </div>
          <div className="text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {formatUsdCompact(pool.stats.tvlUsd)}
          </div>
          <div className="text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {formatUsdCompact(pool.stats.volume24hUsd)}
          </div>
          <div className="text-right tabular-nums font-semibold" style={{ color: 'var(--series-green)' }}>
            {formatPercent(pool.stats.feeApr24h)}
          </div>
        </div>
      ))}
    </div>
  );
}
```

The click-to-navigate row is now a `<div role="button" tabIndex={0}>` (was a native `<tr onClick>`) — the `onKeyDown` handler is added so Enter still navigates, since this row is no longer a native interactive table element.

- [ ] **Step 2: Add the stats strip to PoolListPage**

Read the current file first (`frontend/src/pages/PoolListPage.tsx`), then replace its entire contents with:

```tsx
import { PoolTable } from '../components/PoolTable';
import { StatTile } from '../components/StatTile';
import { getPoolsWithStats } from '../mock/snapshots';
import { formatUsdCompact } from '../lib/format';

export function PoolListPage() {
  const pools = getPoolsWithStats();
  const totalTvlUsd = pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0);
  const totalVolume24hUsd = pools.reduce((sum, p) => sum + p.stats.volume24hUsd, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Active DLMM Pools
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Each row is a Meteora DLMM liquidity pool on Solana. TVL, volume, and fee APR shown here
        are sample data for this demo — hover or tab to the underlined column headers for what
        each term means.
      </p>
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Total TVL" value={formatUsdCompact(totalTvlUsd)} />
        <StatTile label="24h Volume" value={formatUsdCompact(totalVolume24hUsd)} />
        <StatTile label="Active Pools" value={String(pools.length)} />
      </div>
      <PoolTable pools={pools} />
    </div>
  );
}
```

The three tile values are computed client-side from `pools` (already in memory) — no new data source.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PoolTable.tsx frontend/src/pages/PoolListPage.tsx
git commit -m "style(frontend): row-card Pools table and stats strip"
```

---

### Task 5: Screener page

**Files:**
- Modify: `frontend/src/components/PositioningTable.tsx`
- Modify: `frontend/src/components/TrendingWatch.tsx`
- Modify: `frontend/src/pages/ScreenerPage.tsx`

**Interfaces:**
- Consumes: `Badge` (Task 2), `Tooltip` (unchanged export).

- [ ] **Step 1: Convert PositioningTable to row-cards with badges**

Read the current file first (`frontend/src/components/PositioningTable.tsx`), then replace its entire contents with:

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
    <div className="space-y-1.5">
      <div className={`grid ${GRID_COLS} gap-4 px-4`}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Pair
        </span>
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            onClick={() => toggleSort(col.key)}
            className="text-right text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            {col.termKey ? <Tooltip termKey={col.termKey}>{col.label}</Tooltip> : col.label}
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
              borderColor: isTopLong ? 'var(--accent)' : 'var(--border)',
              background: isTopLong ? 'linear-gradient(to right, var(--accent-bg), var(--surface-1))' : 'var(--surface-1)',
            }}
          >
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              {pair.symbol}
              {isTopLong ? <Badge variant="accent">Long-leaning</Badge> : null}
              {isTopShort ? <Badge variant="critical">Short-leaning</Badge> : null}
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {(pair.buyRatio * 100).toFixed(1)}% / {(pair.sellRatio * 100).toFixed(1)}%
            </div>
            <div className="text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatPercent(pair.fundingRate * 100, 4)}
            </div>
            <div
              className="text-right tabular-nums"
              style={{ color: pair.price24hPct >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
            >
              {formatPercent(pair.price24hPct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Only `isTopLong` rows get the accent-tinted background/border (per the design spec's mockup — "Long-leaning" is the highlighted example); `isTopShort` rows stay on the plain surface with just the critical-variant badge.

- [ ] **Step 2: Convert TrendingWatch to wrapped pill cards**

Read the current file first (`frontend/src/components/TrendingWatch.tsx`), then replace its entire contents with:

```tsx
import type { TrendingCoin } from '../types/screener';
import { formatPercent } from '../lib/format';
import { Tooltip } from './Tooltip';

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
          <div key={i} className="h-16 w-40 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load trending coins.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Search-interest signal from CoinGecko — not a return-potential score. Sorted smallest/most speculative market
        cap first.
      </p>
      <div className="flex flex-wrap gap-2">
        {coins.map((coin) => (
          <div key={coin.id} className="min-w-[160px] rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {coin.symbol}
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: coin.priceChangePct24h >= 0 ? 'var(--status-good)' : 'var(--status-critical)' }}
              >
                {formatPercent(coin.priceChangePct24h)}
              </span>
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {coin.name} · {coin.marketCapRank !== null ? <Tooltip termKey="marketCapRank">rank #{coin.marketCapRank}</Tooltip> : 'unranked'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Restyle ScreenerPage chrome**

Read the current file first (`frontend/src/pages/ScreenerPage.tsx`), then replace its entire contents with:

```tsx
import { useEffect, useState } from 'react';
import { PositioningTable } from '../components/PositioningTable';
import { TrendingWatch } from '../components/TrendingWatch';
import { fetchMajors, fetchTrending } from '../lib/api/screener';
import type { MajorsResponse, TrendingCoin } from '../types/screener';

export function ScreenerPage() {
  const [majorsStatus, setMajorsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [majors, setMajors] = useState<MajorsResponse | null>(null);
  const [majorsError, setMajorsError] = useState<string | undefined>(undefined);
  const [majorsRequestId, setMajorsRequestId] = useState(0);

  const [trendingStatus, setTrendingStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [trendingError, setTrendingError] = useState<string | undefined>(undefined);
  const [trendingRequestId, setTrendingRequestId] = useState(0);

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Screener
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Two independent signals: current futures market positioning on major pairs, and coins
        seeing a spike in search interest. Neither panel is investment advice — see the FAQ for
        how to read each term.
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Market Positioning
        </h2>
        {majorsStatus === 'loading' ? (
          <div className="h-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ) : majorsStatus === 'error' ? (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <p style={{ color: 'var(--status-critical)' }}>{majorsError}</p>
            <button
              type="button"
              onClick={() => setMajorsRequestId((n) => n + 1)}
              className="mt-2 rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <PositioningTable pairs={majors!.pairs} topLongSymbols={majors!.topLongSymbols} topShortSymbols={majors!.topShortSymbols} />
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Trending / Narrative Watch
        </h2>
        <TrendingWatch
          status={trendingStatus}
          coins={trending}
          errorMessage={trendingError}
          onRetry={() => setTrendingRequestId((n) => n + 1)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PositioningTable.tsx frontend/src/components/TrendingWatch.tsx frontend/src/pages/ScreenerPage.tsx
git commit -m "style(frontend): row-card Screener table, badges, pill-card trending watch"
```

---

### Task 6: Pool Detail page

**Files:**
- Modify: `frontend/src/components/HistoryChart.tsx`
- Modify: `frontend/src/components/IlCalculator.tsx`
- Modify: `frontend/src/pages/PoolDetailPage.tsx`
- Modify: `frontend/src/components/AddLiquidityForm.tsx`

**Interfaces:**
- Consumes: `StatTile` (Task 2).

- [ ] **Step 1: Restyle HistoryChart's card**

Read the current file first (`frontend/src/components/HistoryChart.tsx`). Two changes only:

In `CustomTooltip`, change:
```tsx
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
```
to:
```tsx
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
```

In the outer card `<div>`, change:
```tsx
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
```
to:
```tsx
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
```

Every other line (all the `recharts` internals, colors, formatters) stays exactly as it is today — chart line colors are unaffected by this redesign.

- [ ] **Step 2: Restyle IlCalculator**

Read the current file first (`frontend/src/components/IlCalculator.tsx`), then replace its entire contents with:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import type { PoolSnapshot, Strategy } from '../types/pool';
import { calculateNetYield } from '../lib/yield';
import { formatPercent, formatPrice, formatUsd } from '../lib/format';
import { Tooltip } from './Tooltip';

const STRATEGY_DEFAULT_WIDTH_PCT: Record<Strategy, number> = {
  Spot: 10,
  Curve: 25,
  BidAsk: 40,
};

const ENTRY_OPTIONS = [7, 14, 30, 60, 90];

export function IlCalculator({ series }: { series: PoolSnapshot[] }) {
  const [depositUsd, setDepositUsd] = useState(10_000);
  const [strategy, setStrategy] = useState<Strategy>('Spot');
  const [widthPct, setWidthPct] = useState(STRATEGY_DEFAULT_WIDTH_PCT.Spot);
  const [daysAgo, setDaysAgo] = useState(30);

  const entryDate = useMemo(() => {
    const idx = Math.max(0, series.length - 1 - daysAgo);
    return series[idx]?.snapshotAt ?? series[0].snapshotAt;
  }, [series, daysAgo]);

  const entrySnapshot = series.find((s) => s.snapshotAt === entryDate) ?? series[0];
  const lowerPrice = entrySnapshot.currentPrice * (1 - widthPct / 100);
  const upperPrice = entrySnapshot.currentPrice * (1 + widthPct / 100);

  const result = useMemo(
    () => calculateNetYield({ depositUsd, entryDate, lowerPrice, upperPrice, series }),
    [depositUsd, entryDate, lowerPrice, upperPrice, series],
  );

  function handleStrategyChange(next: Strategy) {
    setStrategy(next);
    setWidthPct(STRATEGY_DEFAULT_WIDTH_PCT[next]);
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
        Impermanent loss & net yield calculator (hypothetical)
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Deposit amount
          <input
            type="number"
            min={0}
            value={depositUsd}
            onChange={(e) => setDepositUsd(Number(e.target.value) || 0)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          />
        </label>

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

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Range width (± %)
          <input
            type="number"
            min={1}
            max={200}
            value={widthPct}
            onChange={(e) => setWidthPct(Number(e.target.value) || 1)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Entered
          <select
            value={daysAgo}
            onChange={(e) => setDaysAgo(Number(e.target.value))}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          >
            {ENTRY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days ago
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Entry price {formatPrice(entrySnapshot.currentPrice)} · range [{formatPrice(lowerPrice)}, {formatPrice(upperPrice)}]. Strategy
        only sets the default range width here — it does not yet change how liquidity is weighted inside the range.
      </p>

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
    </div>
  );
}

function Result({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Restyle PoolDetailPage chrome**

Read the current file first (`frontend/src/pages/PoolDetailPage.tsx`), then replace its entire contents with:

```tsx
import { Link, useParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { HistoryChart } from '../components/HistoryChart';
import { IlCalculator } from '../components/IlCalculator';
import { StatTile } from '../components/StatTile';
import { Tooltip } from '../components/Tooltip';
import { AddLiquidityForm } from '../components/AddLiquidityForm';
import { pools } from '../mock/pools';
import { getLatestStats, getSnapshots } from '../mock/snapshots';
import { formatPercent, formatPrice, formatUsd, formatUsdCompact } from '../lib/format';

export function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const { connected } = useWallet();
  const pool = pools.find((p) => p.id === poolId);

  if (!pool) {
    return (
      <div>
        <p style={{ color: 'var(--text-primary)' }}>Pool not found.</p>
        <Link to="/" style={{ color: 'var(--accent)' }}>
          Back to pool list
        </Link>
      </div>
    );
  }

  const series = getSnapshots(pool.id);
  const stats = getLatestStats(pool.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-xs" style={{ color: 'var(--accent)' }}>
          ← Back to pool list
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {pool.name}
        </h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <Tooltip termKey="binStep">bin step</Tooltip> {pool.binStep} · base fee {(pool.baseFeeBps / 100).toFixed(2)}% · current
          price {formatPrice(stats.currentPrice)}
        </p>
      </div>

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HistoryChart data={series} dataKey="tvlUsd" label="TVL" color="var(--series-blue)" />
        <HistoryChart data={series} dataKey="volume24hUsd" label="Volume (24h)" color="var(--series-violet)" />
        <HistoryChart
          data={series}
          dataKey="feeApr24h"
          label="Fee APR (est.)"
          color="var(--series-green)"
          valueFormatter={(v) => formatPercent(v)}
        />
      </div>

      <IlCalculator series={series} />

      {connected ? (
        <AddLiquidityForm poolAddress={pool.poolAddress} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Connect a wallet to add liquidity to this pool.
        </p>
      )}
    </div>
  );
}
```

`HistoryChart`'s `color="var(--series-blue)"` prop for the TVL chart is unchanged — that's the chart-line usage of `--series-blue` the Global Constraints call out as staying as-is.

- [ ] **Step 4: Restyle AddLiquidityForm**

Read the current file first (`frontend/src/components/AddLiquidityForm.tsx`), then replace its entire contents with:

```tsx
import { useState, type FormEvent } from 'react';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { buildAddLiquidityTx } from '../lib/api/liquidity';
import { usePositionsRefresh } from '../lib/positionsRefresh';

type FlowState = 'idle' | 'building' | 'awaiting-signature' | 'submitting' | 'confirming' | 'success' | 'error';

// `Buffer` is a Node.js global, not available in the browser without a
// polyfill. Transaction.from() accepts a Uint8Array just as well, so decode
// the base64 payload without depending on Buffer at all.
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function AddLiquidityForm({ poolAddress }: { poolAddress: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { bump } = usePositionsRefresh();

  // This dashboard's Pools page uses sample data (see PoolListPage) — its
  // poolAddress values aren't real on-chain addresses, so the field is
  // editable here rather than a fixed prop, to let a real devnet DLMM pool
  // address be tested against without needing a live Meteora-backed Pools
  // list (out of scope for this feature).
  const [poolAddressInput, setPoolAddressInput] = useState(poolAddress);
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [minBinId, setMinBinId] = useState('');
  const [maxBinId, setMaxBinId] = useState('');
  const [state, setState] = useState<FlowState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  async function runFlow() {
    if (!publicKey || !signTransaction) {
      setErrorMessage('Connect a wallet first.');
      setState('error');
      return;
    }

    setErrorMessage(null);
    setSignature(null);

    try {
      setState('building');
      const built = await buildAddLiquidityTx({
        poolAddress: poolAddressInput,
        amountX,
        amountY,
        minBinId: Number(minBinId),
        maxBinId: Number(maxBinId),
        userPublicKey: publicKey.toBase58(),
      });

      const tx = Transaction.from(base64ToUint8Array(built.transaction));

      setState('awaiting-signature');
      const signedTx = await signTransaction(tx);

      setState('submitting');
      const rawTx = signedTx.serialize();
      const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false, maxRetries: 3 });
      setSignature(sig);

      setState('confirming');
      const confirmation = await connection.confirmTransaction(
        { signature: sig, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) {
        throw new Error('Transaction failed on-chain.');
      }

      // No backend call needed to record this — the new position now exists
      // on-chain and MyPositionsPage reads directly from the DLMM program via
      // getAllLbPairPositionsByUser. bump() just triggers its refetch.
      setState('success');
      bump();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Add liquidity failed.');
      setState('error');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await runFlow();
  }

  const busy = state === 'building' || state === 'awaiting-signature' || state === 'submitting' || state === 'confirming';

  return (
    <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        Add Liquidity (devnet)
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <input
          type="text"
          required
          placeholder="Pool address (devnet)"
          value={poolAddressInput}
          onChange={(e) => setPoolAddressInput(e.target.value)}
          className="col-span-2 rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          min="0"
          step="1"
          required
          placeholder="Amount X (base units)"
          value={amountX}
          onChange={(e) => setAmountX(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          min="0"
          step="1"
          required
          placeholder="Amount Y (base units)"
          value={amountY}
          onChange={(e) => setAmountY(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          required
          placeholder="Min Bin ID"
          value={minBinId}
          onChange={(e) => setMinBinId(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          required
          placeholder="Max Bin ID"
          value={maxBinId}
          onChange={(e) => setMaxBinId(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={busy}
          className="col-span-2 rounded-full px-3 py-1.5 text-sm font-bold"
          style={{ background: 'var(--accent)', color: '#052e1f' }}
        >
          {busy ? `${state}...` : 'Add Liquidity'}
        </button>
      </form>

      {state === 'error' ? (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--status-critical)' }}>
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={runFlow}
            disabled={busy}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            {busy ? `${state}...` : 'Retry'}
          </button>
        </div>
      ) : null}

      {state === 'success' && signature ? (
        <p className="text-xs" style={{ color: 'var(--status-good)' }}>
          Confirmed —{' '}
          <a href={`https://solscan.io/tx/${signature}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            view on Solscan
          </a>
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HistoryChart.tsx frontend/src/components/IlCalculator.tsx frontend/src/pages/PoolDetailPage.tsx frontend/src/components/AddLiquidityForm.tsx
git commit -m "style(frontend): restyle Pool Detail page and Add Liquidity form"
```

---

### Task 7: News page

**Files:**
- Modify: `frontend/src/components/NewsFilters.tsx`
- Modify: `frontend/src/components/NewsList.tsx`
- Modify: `frontend/src/pages/NewsPage.tsx`

- [ ] **Step 1: Restyle NewsFilters' active pill**

Read the current file first (`frontend/src/components/NewsFilters.tsx`), then replace its entire contents with:

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
        className="rounded border px-3 py-1.5 text-sm sm:w-64"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
      />
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => {
          const active = s.value === source;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onSourceChange(s.value)}
              className="rounded-full border px-3 py-1 text-xs font-bold"
              style={{
                borderColor: active ? 'transparent' : 'var(--border)',
                background: active ? 'var(--accent)' : 'var(--surface-1)',
                color: active ? '#052e1f' : 'var(--text-secondary)',
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

- [ ] **Step 2: Convert NewsList to row-cards**

Read the current file first (`frontend/src/components/NewsList.tsx`), then replace its entire contents with:

```tsx
import type { NewsPost } from '../types/news';

interface NewsListProps {
  status: 'loading' | 'error' | 'ready';
  posts: NewsPost[];
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

export function NewsList({ status, posts, errorMessage, onRetry }: NewsListProps) {
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
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load news.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        No news matches the current filter.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {posts.map((post) => (
        <li key={post.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <a href={post.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
            {post.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{post.sourceTitle}</span>
            <span>&middot;</span>
            <span>{timeAgo(post.publishedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Restyle NewsPage chrome**

Read the current file first (`frontend/src/pages/NewsPage.tsx`), then replace its entire contents with:

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
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Crypto News
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Live headlines aggregated from CoinDesk, Cointelegraph, The Block, and Decrypt. New to
        reading crypto news? See "How to read crypto news" below.
      </p>
      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text-primary)' }}>
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
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NewsFilters.tsx frontend/src/components/NewsList.tsx frontend/src/pages/NewsPage.tsx
git commit -m "style(frontend): row-card News list and accent filter pills"
```

---

### Task 8: FAQ page

**Files:**
- Modify: `frontend/src/pages/FaqPage.tsx`

- [ ] **Step 1: Convert the accordion into gapped row-cards**

Read the current file first (`frontend/src/pages/FaqPage.tsx`), then replace its entire contents with:

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
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        FAQ
      </h1>

      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <h2 className="mb-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
          About this dashboard
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          This is a portfolio project analyzing Meteora DLMM pools on Solana, crypto news, and
          futures market positioning. Nothing on this dashboard — including the trending watchlist
          and long/short positioning tables — is financial advice or a recommendation to buy or
          sell anything. The News and Screener pages use live public APIs and may be delayed,
          incomplete, or wrong; the Pools page uses generated sample data for this demo, not live
          Meteora data. Always verify independently before making decisions.
        </p>
      </div>

      {CATEGORY_ORDER.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {cat.label}
          </h2>
          <div className="space-y-1.5">
            {glossary
              .filter((entry) => entry.category === cat.key)
              .map((entry) => (
                <details key={entry.key} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
                  <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
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

Each glossary entry is now its own bordered/rounded `<details>` card (was one shared `divide-y` container) — this is the same row-card pattern as News, just applied to accordion items instead of links.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/FaqPage.tsx
git commit -m "style(frontend): row-card FAQ accordion"
```

---

### Task 9: Auth pages

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/SignupPage.tsx`
- Modify: `frontend/src/pages/AccountPage.tsx`

- [ ] **Step 1: Restyle LoginPage**

Read the current file first (`frontend/src/pages/LoginPage.tsx`), then replace its entire contents with:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/account');
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Log in
      </h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        {error ? (
          <p className="text-xs" style={{ color: 'var(--status-critical)' }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full px-3 py-1.5 text-sm font-bold"
          style={{ background: 'var(--accent)', color: '#052e1f' }}
        >
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Don't have an account?{' '}
        <Link to="/signup" style={{ color: 'var(--accent)' }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Restyle SignupPage**

Read the current file first (`frontend/src/pages/SignupPage.tsx`), then replace its entire contents with:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error, needsConfirmation } = await signUp(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    if (needsConfirmation) {
      setConfirmationSent(true);
      return;
    }
    navigate('/account');
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Sign up
      </h1>
      {confirmationSent ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Check your email to confirm your account, then{' '}
          <Link to="/login" style={{ color: 'var(--accent)' }}>
            log in
          </Link>
          .
        </p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
            />
            {error ? (
              <p className="text-xs" style={{ color: 'var(--status-critical)' }}>
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full px-3 py-1.5 text-sm font-bold"
              style={{ background: 'var(--accent)', color: '#052e1f' }}
            >
              {submitting ? 'Signing up...' : 'Sign up'}
            </button>
          </form>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)' }}>
              Log in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Restyle AccountPage**

Read the current file first (`frontend/src/pages/AccountPage.tsx`), then replace its entire contents with:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export function AccountPage() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    fetch(new URL('/api/account/me', API_BASE_URL).toString(), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        if (response.status === 401) {
          await signOut();
          if (!cancelled) navigate('/login');
          return;
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new Error('Failed to load account.');
        }

        if (!response.ok) {
          const message = typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : 'Failed to load account.';
          throw new Error(message);
        }

        if (cancelled) return;
        setEmail((body as { email: string }).email);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load account.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [session, loading, navigate, signOut]);

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  if (loading || status === 'loading') {
    return <div className="h-24 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />;
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        My Account
      </h1>
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Signed in as</p>
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {email}
        </p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-full px-3 py-1.5 text-sm font-bold"
        style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
      >
        Log out
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/SignupPage.tsx frontend/src/pages/AccountPage.tsx
git commit -m "style(frontend): accent buttons and bold headings on auth pages"
```

---

### Task 10: My Positions page

**Files:**
- Modify: `frontend/src/pages/MyPositionsPage.tsx`

- [ ] **Step 1: Convert the positions list to row-cards**

Read the current file first (`frontend/src/pages/MyPositionsPage.tsx`), then replace its entire contents with:

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
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Connect a wallet to see your positions.
      </p>
    );
  }

  if (status === 'loading') {
    return <div className="h-24 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />;
  }

  if (status === 'error') {
    return (
      <p className="text-sm" style={{ color: 'var(--status-critical)' }}>
        {errorMessage}
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No positions yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        My Positions
      </h1>
      <ul className="space-y-1.5">
        {positions.map((position) => (
          <li key={position.positionAddress} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <p style={{ color: 'var(--text-primary)' }}>Pool: {position.poolAddress}</p>
            <p style={{ color: 'var(--text-muted)' }}>Position: {position.positionAddress}</p>
            <a href={`https://solscan.io/account/${position.positionAddress}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              View on Solscan
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MyPositionsPage.tsx
git commit -m "style(frontend): row-card My Positions list"
```

---

### Task 11: End-to-end verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the frontend dev server**

Run: `cd frontend && npm run dev -- --port 5180` (background). The backend isn't required for most of this check (News/Screener will show their existing loading/error states without it, which is fine — this task verifies the redesign, not those data flows); start it too (`cd backend && npm run dev`) if you want to see News/Screener in their `ready` state.

- [ ] **Step 2: Screenshot every page in light and dark mode, check for console errors**

```javascript
import { chromium } from 'playwright';

const ROUTES = [
  { path: '/', wait: 'text=Active DLMM Pools' },
  { path: '/pools/pool-sol-usdc', wait: 'text=SOL-USDC' },
  { path: '/screener', wait: 'text=Screener' },
  { path: '/news', wait: 'text=Crypto News' },
  { path: '/faq', wait: 'text=FAQ' },
  { path: '/login', wait: 'text=Log in' },
  { path: '/signup', wait: 'text=Sign up' },
  { path: '/positions', wait: 'text=Connect a wallet' },
];

const browser = await chromium.launch();

for (const colorScheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  for (const route of ROUTES) {
    await page.goto(`http://localhost:5180${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector(route.wait, { timeout: 10000 });
    await page.screenshot({ path: `redesign-${colorScheme}-${route.path.replace(/\//g, '_') || 'root'}.png`, fullPage: true });
  }

  if (errors.length) {
    console.error(`Console errors in ${colorScheme} mode:`, errors);
    process.exitCode = 1;
  } else {
    console.log(`${colorScheme} mode: no console errors across ${ROUTES.length} routes.`);
  }

  await page.close();
}

await browser.close();
```

Run with: `node --experimental-vm-modules -e "$(cat script.js)"` or save as `verify-redesign.mjs` and run `node verify-redesign.mjs` from a directory where `playwright` resolves (e.g. `frontend/`).

Expected: no thrown errors, one screenshot per route per color scheme (16 total), console logs confirm zero `pageerror` events in both modes.

- [ ] **Step 3: Manually verify existing interactions still work**

With the dev server still running, in a browser (or via a short follow-up Playwright script):
- Pools page: click the "TVL" and "Fee APR (est.)" column headers — sort order and the ▲/▼ indicator should still toggle exactly as before.
- Screener page: click a positioning-table column header to sort; confirm "Long-leaning"/"Short-leaning" badges still appear on the correct rows.
- News page: click a source filter pill (e.g. "CoinDesk") — the active pill should switch to the filled-accent style and the list should still filter (or show its existing loading/error state if the backend isn't running).
- FAQ page: click a glossary term — the `<details>` row-card should still expand/collapse and show its long definition.
- Confirm every page picked up the new emerald accent and rounded-xl card style in both the light and dark screenshots from Step 2.

- [ ] **Step 4: Clean up screenshots**

These screenshots are for manual review only, not committed to the repo:

```bash
rm -f frontend/redesign-*.png
```

(No commit for this task — it's verification-only. If any of the checks above fail, go back to the relevant task, fix, and re-verify before considering the branch done.)

---

## After this plan

Once all 11 tasks pass, this closes out the "gasss lanjutkan" priority list's third item (idempotency and rate limiting were completed earlier on this branch). The next piece of work is the queued Anchor/Rust program audit + spec + plan (see the `queued_anchor_program.md` memory) — not started by this plan.
