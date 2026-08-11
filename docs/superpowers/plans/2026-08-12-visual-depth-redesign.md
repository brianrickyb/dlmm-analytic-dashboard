# Visual Depth Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboard visual depth — warm surfaces, a real typeface, a hero/secondary
stat-tile hierarchy, and a side-rail nav — without touching the emerald brand identity, any
page's data/logic, or any of the five card-using components that already inherit their
treatment from CSS tokens.

**Architecture:** Three independent, small-footprint changes: (1) design tokens — one new font
+ two retuned surface colors, both in `index.css`/`main.tsx`; (2) a `variant` prop on
`StatTile.tsx` so exactly one stat per page renders as a filled hero pill; (3) `Layout.tsx`
rewritten from a top header to a fixed side rail on desktop with an off-canvas drawer on mobile.

**Tech Stack:** React 19 + TypeScript + Vite, Tailwind v4, `@fontsource/geist-sans`.

## Global Constraints

- No change to `--accent`, `--accent-bg`, `--accent-fg`, `--border`, any `--text-*`,
  `--series-*`, or `--status-*` token — only `--surface-1`/`--surface-page` (light mode only)
  and a new `--font-sans` token are added/changed.
- No change to `PoolTable.tsx`, `NewsList.tsx`, `RelatedNews.tsx`, `PumpWatch.tsx`, or
  `IlCalculator.tsx` — they inherit the retuned surface tokens automatically.
- `StatTile`'s existing `accent` prop behavior for `variant="default"` (the default) must be
  byte-identical to today — only `variant="hero"` introduces new visual behavior. Existing call
  sites that don't pass `variant` must render exactly as they do today, aside from the token
  retuning and the added `tabular-nums` class.
- Sidebar breakpoint is 768px (Tailwind's `md:`), matching the rest of this codebase's
  Tailwind-utility-first convention — no custom media queries.
- No new frontend component tests — matches this project's established zero-frontend-
  component-test convention. Verification is `tsc --noEmit` plus manual visual passes.

---

### Task 1: Design tokens — typography + surface warmth

**Files:**
- Modify: `frontend/package.json` (via `npm install`, not hand-edited)
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `var(--font-sans)` (new CSS custom property) and retuned
  `var(--surface-1)`/`var(--surface-page)` light-mode values. Tasks 2 and 3 use these tokens by
  name (they don't need to know the underlying values).

- [ ] **Step 1: Install the font package**

Run: `cd frontend && npm install @fontsource/geist-sans`
Expected: `@fontsource/geist-sans` appears in `frontend/package.json`'s `dependencies`.

- [ ] **Step 2: Import the font weights in `main.tsx`**

In `frontend/src/main.tsx`, change:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'
```

to:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Buffer } from 'buffer'
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-sans/700.css'
import './index.css'
import App from './App.tsx'
```

- [ ] **Step 3: Add the `--font-sans` token**

In `frontend/src/index.css`, in the `:root { ... }` block at the top of the file, change:

```css
:root {
  color-scheme: light;
  --surface-1: #ffffff;
  --surface-page: #fafaf9;
```

to:

```css
:root {
  color-scheme: light;
  --font-sans: 'Geist Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --surface-1: #fdfbf8;
  --surface-page: #f7f5f1;
```

This both adds the new font token and retunes the two light-mode surface colors in the same
edit (they're adjacent lines in the file). Do **not** touch the two dark-mode blocks
(`@media (prefers-color-scheme: dark) { :root:where(...) { ... } }` and
`:root[data-theme="dark"] { ... }`) — dark mode's `--surface-1`/`--surface-page` stay exactly as
they are today.

- [ ] **Step 4: Point `body` at the new font token**

In `frontend/src/index.css`, change:

```css
body {
  margin: 0;
  background: var(--surface-page);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

to:

```css
body {
  margin: 0;
  background: var(--surface-page);
  color: var(--text-primary);
  font-family: var(--font-sans);
}
```

- [ ] **Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (this task has no TypeScript logic changes, only CSS/imports — this
confirms nothing was accidentally broken).

Run: `cd frontend && npm run dev`, open the app in a browser, open devtools, select any heading
or body text, and check the computed `font-family` includes "Geist Sans" as the first resolved
font (not falling back to `system-ui`). Confirm the page background and card backgrounds read as
a warm off-white rather than stark white, in light mode. Confirm dark mode is visually
unchanged from before this task.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/index.css
git commit -m "feat(frontend): add Geist Sans typeface and warm surface tokens"
```

---

### Task 2: `StatTile` hero variant

**Files:**
- Modify: `frontend/src/components/StatTile.tsx`
- Modify: `frontend/src/pages/PoolListPage.tsx`
- Modify: `frontend/src/pages/PoolDetailPage.tsx`

**Interfaces:**
- Consumes: `var(--accent-bg)`, `var(--accent)` (existing tokens, unchanged by this task).
- Produces: `StatTile`'s new `variant?: 'default' | 'hero'` prop (default `'default'`). No other
  task depends on this — it's the final visual piece for the stat-tile hierarchy.

- [ ] **Step 1: Add the `variant` prop to `StatTile`**

Replace the full contents of `frontend/src/components/StatTile.tsx`:

```tsx
import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  accent,
  variant = 'default',
}: {
  label: ReactNode;
  value: string;
  accent?: string;
  variant?: 'default' | 'hero';
}) {
  if (variant === 'hero') {
    return (
      <div className="rounded-full px-4 py-3" style={{ background: 'var(--accent-bg)', color: accent ?? 'var(--accent)' }}>
        <div className="text-xs opacity-80">{label}</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mark the primary metric as hero on `PoolListPage`**

In `frontend/src/pages/PoolListPage.tsx`, change:

```tsx
            <StatTile label="Total TVL" value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0))} />
```

to:

```tsx
            <StatTile
              label="Total TVL"
              value={formatUsdCompact(pools.reduce((sum, p) => sum + p.stats.tvlUsd, 0))}
              variant="hero"
            />
```

The other two tiles (`24h Volume`, `Active Pools`) are unchanged — they keep `variant`
unspecified, which defaults to `'default'`.

- [ ] **Step 3: Mark the primary metric as hero on `PoolDetailPage`**

In `frontend/src/pages/PoolDetailPage.tsx`, change:

```tsx
        <StatTile label={<Tooltip termKey="tvl">TVL</Tooltip>} value={formatUsdCompact(stats.tvlUsd)} />
```

to:

```tsx
        <StatTile label={<Tooltip termKey="tvl">TVL</Tooltip>} value={formatUsdCompact(stats.tvlUsd)} variant="hero" />
```

The other three tiles (`Volume (24h)`, `Fees (24h)`, `Fee APR (est.)`) are unchanged — the Fee
APR tile keeps its existing `accent="var(--series-green)"` prop with the default variant, so it
keeps its current look exactly.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

Run: `cd frontend && npm run dev`, open the Pools list page and a Pool Detail page. Confirm
exactly one tile per page (Total TVL / TVL) renders as a filled pill in the emerald accent
color, and the remaining tiles render as bordered cards on the warm surface from Task 1. Check
both light and dark mode.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StatTile.tsx frontend/src/pages/PoolListPage.tsx frontend/src/pages/PoolDetailPage.tsx
git commit -m "feat(frontend): add hero variant to StatTile for the primary metric per page"
```

---

### Task 3: Side-rail navigation with mobile drawer

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `useAuth()` (existing, from `frontend/src/lib/auth/AuthContext`), `WalletConnectButton`
  (existing, from `./WalletConnectButton`), `var(--accent)`, `var(--accent-bg)`, `var(--accent-fg)`,
  `var(--surface-1)`, `var(--border)`, `var(--text-primary)`, `var(--text-secondary)` (all
  existing tokens; `--surface-1` is the retuned value from Task 1).
- Produces: nothing further downstream — `Layout` is the outermost wrapper (see
  `frontend/src/App.tsx`), so this is the final task.

- [ ] **Step 1: Replace `Layout.tsx`**

Replace the full contents of `frontend/src/components/Layout.tsx`:

```tsx
import { useEffect, useState } from 'react';
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

function SidebarLink({ to, label, onNavigate }: { to: string; label: ReactNode; onNavigate: () => void }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="rounded-full px-3 py-2 text-sm font-medium"
      style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Link>
  );
}

function Wordmark() {
  return (
    <>
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        D
      </span>
      <span className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        DLMM Pool Analytics
      </span>
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { session } = useAuth();

  return (
    <div className="flex h-full flex-col p-4">
      <Link to="/" onClick={onNavigate} className="mb-6 flex items-center gap-2">
        <Wordmark />
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_LINKS.map((link) => (
          <SidebarLink key={link.to} to={link.to} label={link.label} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        {session ? (
          <SidebarLink to="/account" label={session.user.email} onNavigate={onNavigate} />
        ) : (
          <SidebarLink to="/login" label="Login" onNavigate={onNavigate} />
        )}
        <WalletConnectButton />
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen md:pl-56">
      <aside
        className="fixed inset-y-0 left-0 z-20 hidden w-56 border-r md:block"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
      >
        <SidebarContent onNavigate={() => {}} />
      </aside>

      <header
        className="flex items-center justify-between border-b px-4 py-3 md:hidden"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
      >
        <Link to="/" className="flex items-center gap-2">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 flex-col items-center justify-center gap-1"
        >
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
          <span className="h-0.5 w-5" style={{ background: 'var(--text-primary)' }} />
        </button>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setDrawerOpen(false)} />
          <aside
            className="absolute inset-y-0 left-0 w-64 border-r"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

Run: `cd frontend && npm run dev` and manually check, in both light and dark mode:

- **Desktop (≥768px):** the sidebar is fixed on the left, shows the lettermark + wordmark, all
  five nav links, and the account/login + wallet-connect area pinned to the bottom. The active
  route's link shows the emerald pill highlight. Page content sits to the right of the sidebar
  with no overlap.
- **Mobile (<768px):** the sidebar is hidden; a slim top bar shows the wordmark and a hamburger
  button. Clicking the hamburger opens a drawer sliding in from the left with a dimmed backdrop
  behind it. Clicking a nav link, clicking the backdrop, or pressing Escape closes the drawer.
- **Every route renders correctly** under the new layout: `/` (Pools), `/pools/:poolId` (open
  any pool from the list), `/news`, `/screener`, `/faq`, `/positions`, `/login`, `/signup`,
  and — once logged in — `/account`. Confirm wallet connect still works from the sidebar.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat(frontend): replace top header with a side-rail nav and mobile drawer"
```

## Verification

1. `cd backend && npm test` — unaffected by this plan (no backend files touched), should still
   be fully green as a regression check.
2. `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — no type errors after all three
   tasks.
3. Manual pass across every route in both light and dark mode, and at both the sidebar
   (≥768px) and mobile-drawer (<768px) breakpoints, per Task 3 Step 2's checklist.
