# Dark Terminal Redesign — Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's light/dark token system with the mockup's fixed dark palette and
typography, and restyle every shared component (`Layout`/`Sidebar`, `WalletConnectButton`,
`StatTile`, `Badge`, `PillButton`, `HistoryChart`, `NewsList`) to match — the foundation every
later per-page plan builds on.

**Architecture:** One token rewrite in `index.css` (new names, no light/dark branching), then a
restyle pass per shared component — same props, same call sites, only `className`/`style` values
change. No page-level files change in this plan; pages inherit the new look automatically through
these shared components, and any page-specific new panels are out of scope here.

**Tech Stack:** React 19, TypeScript, Tailwind v4, no new dependencies except two Google Fonts.

**Spec:** `docs/superpowers/specs/2026-08-13-dark-terminal-redesign-design.md`

## Global Constraints

- One fixed dark palette. No `prefers-color-scheme` branching, no `[data-theme]` overrides —
  `index.css`'s `@media (prefers-color-scheme: dark)` block and `:root[data-theme="dark"]` block
  are deleted, not adapted.
- Every themed color is a CSS variable referenced via `var(--token)` in a `style` prop — never a
  hardcoded hex in a `.tsx` file. Layout/spacing stays Tailwind utility classes.
- Numeric values (prices, percentages, wallet addresses, dates in data displays) use
  `font-family: 'JetBrains Mono', monospace`; everything else uses the default Instrument Sans
  body font.
- No component's props or exported function signatures change — only internal `style`/`className`
  values. Every existing call site across the app keeps compiling unmodified.
- No behavioral change to `Layout.tsx`'s mobile-drawer focus-trap/scroll-lock/resize logic — only
  its visual output.

---

### Task 1: Rewrite `index.css` — tokens and fonts

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the full new token set every later task/component references:
  `--bg`, `--surface`, `--card`, `--card2`, `--border`, `--border2`, `--green`, `--green-dim`,
  `--green-glow`, `--green-subtle`, `--text`, `--muted`, `--dim`, `--red`, `--red-muted`,
  `--amber`, `--amber-muted`, plus `--series-blue`, `--series-violet` (both re-colored for the
  dark palette; `--series-green`/`--series-red` are dropped as separate tokens since they'd be
  identical to `--green`/`--red` — callers switch to those instead, see Task 4).

This is a CSS-only change with no test file — verify by building and visually inspecting (Step 3).

- [ ] **Step 1: Replace the token block**

In `frontend/src/index.css`, replace the entire file with:

```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
@import "tailwindcss";

:root {
  color-scheme: dark;
  --font-sans: 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

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

  --series-blue: #3b9eff;
  --series-violet: #9085e9;
}

::selection { background: rgba(0, 212, 126, 0.2); }

::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--border2); }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0, 212, 126, 0.4); }
  50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(0, 212, 126, 0); }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.page-enter { animation: fade-in 0.2s ease forwards; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

(`pulse-dot` and `fade-in` keyframes and the `.page-enter` class are new additions ported from
the mockup — Task 2 uses `pulse-dot` for the sidebar's "LIVE" indicator, and later per-page plans
use `.page-enter` on each page's root element, matching the mockup's convention.)

- [ ] **Step 2: Grep for every old token name to confirm nothing is missed by later tasks**

Run: `cd frontend && grep -rn "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\|var(--status-\|var(--gridline\|var(--axis\|var(--font-sans" src --include="*.tsx"`

Expected: a list of every file still using an old token name. This is the authoritative worklist
for this task and every later per-page task — do not treat this plan as done while any of these
old names remain in a file this plan's tasks touch (Tasks 2-4's file lists below already account
for every hit in `Layout.tsx`, `WalletConnectButton.tsx`, `StatTile.tsx`, `Badge.tsx`,
`PillButton.tsx`, `HistoryChart.tsx`, `NewsList.tsx`; hits in other files belong to later,
per-page plans and are expected to remain for now).

- [ ] **Step 3: Build and visually confirm the token change**

Run: `cd frontend && npx tsc -b && npm run build`
Expected: build succeeds (no `.tsx` files reference the new tokens yet, so nothing renders
differently until Tasks 2-4 — this step only confirms the CSS itself is syntactically valid and
the build pipeline still works).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(frontend): replace light/dark theme tokens with the dark terminal palette"
```

---

### Task 2: Restyle `Layout.tsx`, `Sidebar` content, and `WalletConnectButton.tsx`

**Files:**
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/components/WalletConnectButton.tsx`

**Interfaces:**
- Consumes: tokens from Task 1 (`--surface`, `--card`, `--border`, `--green`, `--green-subtle`,
  `--text`, `--muted`, `--font-mono`).
- Produces: no prop/export changes — `Layout({ children })` and `WalletConnectButton()` keep
  their existing signatures; every page that renders inside `<Layout>` picks up the new look
  automatically.

Reference: `C:\Users\Brian\Downloads\Website Improvement Suggestions\src\components\Sidebar.tsx`
for the exact nav icon set, "LIVE · mainnet-beta" indicator, and connected-wallet pill layout —
this task ports that visual design into `Layout.tsx`'s existing `SidebarContent`/`Wordmark`
functions and `WalletConnectButton.tsx`'s connected-state branch, WITHOUT touching
`Layout.tsx`'s drawer-open/focus-trap/resize `useEffect` hooks or `WalletConnectButton.tsx`'s
`useWallet`/picker-open state logic — those are unchanged.

No test file — this is a visual-only change to existing, already-tested-by-usage components (this
frontend has no component tests by established convention). Verify via Step 4's build and visual
check.

- [ ] **Step 1: Add per-nav-item icons and restyle `SidebarLink`/`Wordmark`/`SidebarContent` in `Layout.tsx`**

Replace the top of `frontend/src/components/Layout.tsx` (imports through `NAV_LINKS`) with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { WalletConnectButton } from './WalletConnectButton';

const NAV_LINKS: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Pools',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/news',
    label: 'News',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2M18 14h-8M15 18h-5M10 6h8v4h-8V6z" />
      </svg>
    ),
  },
  {
    to: '/screener',
    label: 'Screener',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
  },
  {
    to: '/markets/xau',
    label: 'Gold Signal',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    to: '/faq',
    label: 'FAQ',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
      </svg>
    ),
  },
  {
    to: '/positions',
    label: 'My Positions',
    icon: (
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
      </svg>
    ),
  },
];
```

Replace `SidebarLink` with an icon-aware version:

```tsx
function SidebarLink({
  to,
  label,
  icon,
  onNavigate,
  truncate = false,
}: {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  onNavigate: () => void;
  truncate?: boolean;
}) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={truncate && typeof label === 'string' ? label : undefined}
      className={`relative flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? 'font-semibold' : 'font-normal'} ${truncate ? 'truncate' : ''}`}
      style={{
        background: active ? 'var(--green-subtle)' : 'transparent',
        color: active ? 'var(--green)' : 'var(--muted)',
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-sm"
          style={{ background: 'var(--green)' }}
        />
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="flex-1">{label}</span>
    </Link>
  );
}
```

Replace `Wordmark`:

```tsx
function Wordmark() {
  return (
    <>
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sm font-extrabold"
        style={{ background: 'linear-gradient(135deg, #00d47e 0%, #00845c 100%)', color: '#000', fontFamily: 'var(--font-mono)' }}
      >
        D
      </span>
      <div>
        <div className="text-xs font-bold leading-tight" style={{ color: 'var(--text)' }}>
          DLMM Pool Analytics
        </div>
        <div className="text-[10px] leading-tight" style={{ color: 'var(--muted)' }}>
          Meteora &middot; Solana
        </div>
      </div>
    </>
  );
}
```

Replace `SidebarContent`, adding the "LIVE" indicator row above the nav:

```tsx
function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { session } = useAuth();

  return (
    <div className="flex h-full flex-col p-4">
      <Link to="/" onClick={onNavigate} className="mb-4 flex items-center gap-2.5">
        <Wordmark />
      </Link>
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: 'var(--green)', animation: 'pulse-dot 2s infinite' }}
        />
        <span className="text-[10px] tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          LIVE &middot; mainnet-beta
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_LINKS.map((link) => (
          <SidebarLink key={link.to} to={link.to} label={link.label} icon={link.icon} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        {session ? (
          <SidebarLink to="/account" label={session.user.email} onNavigate={onNavigate} truncate />
        ) : (
          <SidebarLink to="/login" label="Login" onNavigate={onNavigate} />
        )}
        <WalletConnectButton />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Restyle the sidebar/header/drawer surface colors in `Layout`**

In `frontend/src/components/Layout.tsx`'s `Layout` function, replace every
`style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}` (there are three: the
desktop `<aside>`, the mobile `<header>`, and the mobile drawer `<aside>`) with
`style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}` — same shape, new token
name. Replace the two `style={{ background: 'var(--text-primary)' }}` hamburger-bar spans with
`style={{ background: 'var(--text)' }}`.

Leave every `className`, every `useEffect`, every `useState`, and every ARIA attribute in
`Layout` completely unchanged — only the four `style` object values above change.

- [ ] **Step 3: Restyle `WalletConnectButton.tsx`'s connected-state pill**

In `frontend/src/components/WalletConnectButton.tsx`, replace the connected-state return block:

```tsx
  if (connected && publicKey) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{ background: 'var(--green-subtle)', border: '1px solid var(--border)' }}
      >
        <div
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
          style={{ background: 'rgba(0,212,126,0.13)', border: '1px solid rgba(0,212,126,0.2)' }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth={2}>
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-[9px]" style={{ color: 'var(--muted)' }}>CONNECTED</div>
          <button
            type="button"
            onClick={() => disconnect()}
            className="truncate text-[11px]"
            style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}
          >
            {shortenAddress(publicKey.toBase58())}
          </button>
        </div>
      </div>
    );
  }
```

This replaces the disconnected-state `<PillButton>` used for "Connect Wallet" only in its
connected-state sibling branch — leave the rest of the component (the `error`/`pickerOpen`
disconnected-state JSX, `handleConnectClick`, `handleSelect`, the wallet picker dropdown) exactly
as-is for this task; `PillButton`'s own restyle (Task 3) already updates the "Connect Wallet"
button's look without any change needed here.

- [ ] **Step 4: Build and visually confirm**

Run: `cd frontend && npx tsc -b && npm run build`. Then start the real dev server
(`npm run dev`), open the app, and confirm: the sidebar renders on the new dark background with
green nav icons/active-state, the "LIVE · mainnet-beta" pulsing dot appears above the nav links,
and (if a wallet extension is available to test with) the connected-wallet pill matches the
mockup's `CONNECTED` / monospace-address treatment. Screenshot both the desktop sidebar and the
mobile drawer (resize below 768px, open the hamburger menu) and compare against
`C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\image.png` (any screenshot
showing the sidebar works as the comparison — all six show the same sidebar).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout.tsx frontend/src/components/WalletConnectButton.tsx
git commit -m "feat(frontend): restyle sidebar nav, wordmark, and wallet-connect pill for the dark terminal look"
```

---

### Task 3: Restyle `StatTile.tsx`, `Badge.tsx`, `PillButton.tsx`

**Files:**
- Modify: `frontend/src/components/StatTile.tsx`
- Modify: `frontend/src/components/Badge.tsx`
- Modify: `frontend/src/components/PillButton.tsx`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: no prop/export changes to any of the three components — every existing call site
  across the app (Pools, Pool Detail, Screener, News, the Gold Signal page, etc.) keeps working
  unmodified and picks up the new look.

No test file — visual-only change. Verify via Step 4.

- [ ] **Step 1: Restyle `StatTile.tsx`**

Replace the file:

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
      <div className="rounded-xl px-4 py-3" style={{ background: 'var(--green-subtle)', color: accent ?? 'var(--green)' }}>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{label}</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{value}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums"
        style={{ color: accent ?? 'var(--text)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </div>
    </div>
  );
}
```

(The mockup's stat cards show numeric values in monospace — `StatTile` didn't set a font-family
before; this is a deliberate, spec-mandated addition, not scope creep, since "every numeric value
uses JetBrains Mono" is one of this plan's Global Constraints.)

- [ ] **Step 2: Restyle `Badge.tsx`**

Replace the file:

```tsx
import type { ReactNode } from 'react';

type BadgeVariant = 'accent' | 'good' | 'critical' | 'warning' | 'neutral';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: 'var(--green-subtle)', color: 'var(--green)' },
  good: { bg: 'rgba(0, 212, 126, 0.12)', color: 'var(--green)' },
  critical: { bg: 'var(--red-muted)', color: 'var(--red)' },
  warning: { bg: 'var(--amber-muted)', color: 'var(--amber)' },
  neutral: { bg: 'var(--card2)', color: 'var(--muted)' },
};

export function Badge({ variant = 'accent', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const { bg, color } = VARIANT_STYLES[variant];
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
      style={{ background: bg, color, fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </span>
  );
}
```

(Badges in the mockup — `NEGATIVE`/`POSITIVE`/`NEUTRAL`/`LONG-LEANING`/`SHORT-LEANING` — are
always shown in monospace uppercase; adding `font-mono` here matches every badge screenshot.)

- [ ] **Step 3: Restyle `PillButton.tsx`**

Replace the file:

```tsx
import type { ButtonHTMLAttributes } from 'react';

type PillVariant = 'solid' | 'tinted';

const VARIANT_STYLE: Record<PillVariant, { background: string; color: string }> = {
  solid: { background: 'var(--green)', color: '#000' },
  tinted: { background: 'var(--green-subtle)', color: 'var(--green)' },
};

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
}

// Shared accent pill button — `solid` for primary actions (Connect Wallet,
// form submits), `tinted` for secondary actions (Retry, disconnect,
// log out). Callers set text size (text-sm for primary, text-xs for
// secondary) and any layout classes (w-full, col-span-2) via className;
// only the shape/color pairing is fixed here, since that's what drifted
// across pages before this component existed.
export function PillButton({ variant = 'tinted', type = 'button', className = '', style, ...props }: PillButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-full px-3 py-1.5 font-bold ${className}`}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      {...props}
    />
  );
}
```

(`solid` used `--accent-fg` — white text on a dark-green background under the old palette; the
mockup's brand mark and primary buttons use **black** text on the bright `--green`, matching
`Wordmark`'s `color: '#000'` from Task 2 — `#000` is used directly here rather than a new token,
matching how `Wordmark` already does the same thing.)

- [ ] **Step 4: Build and visually confirm**

Run: `cd frontend && npx tsc -b && npm run build`. Start the dev server and visit any page using
`StatTile`/`Badge`/`PillButton` (e.g. the News page for badges, the Screener page for pills) —
confirm cards/badges/buttons render in the new dark palette with monospace numbers/labels where
expected. Full per-page visual comparison against the mockup screenshots happens in later,
per-page plans — this step is a smoke check that the components render correctly in isolation.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StatTile.tsx frontend/src/components/Badge.tsx frontend/src/components/PillButton.tsx
git commit -m "feat(frontend): restyle StatTile, Badge, and PillButton for the dark terminal look"
```

---

### Task 4: Restyle `HistoryChart.tsx` and `NewsList.tsx`

**Files:**
- Modify: `frontend/src/components/HistoryChart.tsx`
- Modify: `frontend/src/components/NewsList.tsx`
- Modify: `frontend/src/components/IlCalculator.tsx:110,114`
- Modify: `frontend/src/pages/PoolDetailPage.tsx:127,142,143,148`
- Modify: `frontend/src/components/PoolTable.tsx:99`

**Interfaces:**
- Consumes: tokens from Task 1 (`--card`, `--border`, `--gridline`→`--border`/`--dim` per Task 1's
  removal of `--gridline`/`--axis`, `--green`, `--red`, `--series-blue`, `--series-violet`).
- Produces: no prop/export changes to `HistoryChart`/`NewsList` — same call sites in
  `PoolDetailPage.tsx` keep working. `NewsList`'s `SENTIMENT_BADGE` map already delegates color to
  `Badge`'s variants (Task 3), so no local color values live here beyond what's noted below.

Task 1 removed `--gridline` and `--axis` (mockup has no separate grid/axis tokens — its charts
use `var(--border)` for the grid and `var(--dim)`/`var(--muted)` for axis tick text) and removed
`--series-green`/`--series-red` as distinct tokens (mockup doesn't distinguish them from
`--green`/`--red`) — this task's file list is exactly the Task-1 grep's remaining hits for
`--gridline`, `--axis`, `--series-green`, `--series-red`.

No test file — visual-only. Verify via Step 4.

- [ ] **Step 1: Restyle `HistoryChart.tsx`**

In `frontend/src/components/HistoryChart.tsx`, replace:
```tsx
      className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
```
with:
```tsx
      className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
```

Replace `<CartesianGrid stroke="var(--gridline)" ...>` with `<CartesianGrid stroke="var(--border)" ...>`.

Replace both `tick={{ fill: 'var(--text-muted)', fontSize: 11 }}` occurrences (XAxis and YAxis)
with `tick={{ fill: 'var(--dim)', fontSize: 11, fontFamily: 'var(--font-mono)' }}` (axis tick
labels are numeric/dates — monospace per the Global Constraint).

Replace `axisLine={{ stroke: 'var(--axis)' }}` with `axisLine={{ stroke: 'var(--border2)' }}`.

Replace the `CustomTooltip` function's
`style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}`
with
`style={{ background: 'var(--card2)', borderColor: 'var(--border2)', color: 'var(--text)' }}`,
and its `style={{ color: 'var(--text-muted)' }}` date line with `style={{ color: 'var(--muted)' }}`.

- [ ] **Step 2: Restyle `NewsList.tsx`**

In `frontend/src/components/NewsList.tsx`, replace every `style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}` (the loading skeleton, error card, empty-state card, and each list-item card) with `style={{ borderColor: 'var(--border)', background: 'var(--card)' }}`.

Replace `style={{ color: 'var(--status-critical)' }}` (error message) with `style={{ color: 'var(--red)' }}`.

Replace `style={{ color: 'var(--text-primary)' }}` (headline link) with `style={{ color: 'var(--text)' }}`.

Replace `style={{ color: 'var(--text-muted)' }}` (source/time-ago row, empty-state text) with `style={{ color: 'var(--muted)' }}`.

- [ ] **Step 3: Update the four `--series-green`/`--series-red` call sites and two `--series-blue`/`--series-violet` call sites**

In `frontend/src/components/IlCalculator.tsx:110`, change `accent="var(--series-green)"` to
`accent="var(--green)"`. At line 114, change `accent="var(--series-red)"` to `accent="var(--red)"`.

In `frontend/src/pages/PoolDetailPage.tsx:127`, change `accent="var(--series-green)"` to
`accent="var(--green)"`. At line 148, change `color="var(--series-green)"` to `color="var(--green)"`.
Lines 142-143 (`color="var(--series-blue)"` and `color="var(--series-violet)"`) are unchanged —
Task 1 already re-colored those two tokens for the dark palette, so no call-site edit is needed
there, only confirm (by reading the file) that they still say `var(--series-blue)` /
`var(--series-violet)` and were not accidentally touched by Step 1/2's find-and-replace.

In `frontend/src/components/PoolTable.tsx:99`, change `style={{ color: 'var(--series-green)' }}`
to `style={{ color: 'var(--green)' }}`.

- [ ] **Step 4: Build and confirm no old token names remain**

Run: `cd frontend && npx tsc -b && npm run build`, then re-run Task 1 Step 2's grep plus
`grep -rn "var(--series-green\|var(--series-red" src --include="*.tsx"`.
Expected: build succeeds; the combined grep returns **zero** matches (every old token name this
plan's tasks were responsible for has been fully migrated — `--series-green`/`--series-red` no
longer exist as tokens after Task 1, and no `.tsx` file references them anymore after this step).
Start the dev server and visually confirm the Pool Detail page's three line charts and the News
page's headline cards render correctly on the new dark background.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HistoryChart.tsx frontend/src/components/NewsList.tsx frontend/src/components/IlCalculator.tsx frontend/src/pages/PoolDetailPage.tsx frontend/src/components/PoolTable.tsx
git commit -m "feat(frontend): restyle HistoryChart and NewsList, migrate remaining series/gridline tokens"
```

## Verification

1. `cd frontend && npx tsc -b && npm run build` — clean, both succeed.
2. `grep -rn "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\|var(--status-\|var(--gridline\|var(--axis\|var(--series-green\|var(--series-red\|var(--font-sans" frontend/src --include="*.tsx"` returns zero matches in any file this plan's four tasks touched (`Layout.tsx`, `WalletConnectButton.tsx`, `StatTile.tsx`, `Badge.tsx`, `PillButton.tsx`, `HistoryChart.tsx`, `NewsList.tsx`, `IlCalculator.tsx`, `PoolDetailPage.tsx`, `PoolTable.tsx`) — remaining matches in other files are expected and belong to later per-page plans.
3. Manual verification: real dev server, screenshot the sidebar (desktop + mobile drawer), a page using `StatTile`/`Badge` (News), and Pool Detail's charts — compare against the mockup screenshots in `C:\Users\Brian\Downloads\Website Improvement Suggestions\src\imports\`.
