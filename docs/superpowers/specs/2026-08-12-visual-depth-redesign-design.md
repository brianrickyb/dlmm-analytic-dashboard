# Visual Depth Redesign — Design

## Context

A read-only Hallmark audit of the frontend found the app functionally sound but visually flat
("polos"): pure/near-pure white surfaces (`--surface-1: #ffffff`, `index.css:5`), zero
typographic identity (the entire app runs on the bare `system-ui` stack, `index.css:86`), and
every single container — `StatTile`, `PoolTable`'s wrapper, `NewsList` rows, `RelatedNews`,
`PumpWatch`, `IlCalculator` — using the identical `rounded-xl border p-4` recipe with no
hierarchy between a headline TVL number and an incidental empty-state box. The nav
(`Layout.tsx`) is also a generic wordmark-left/links-right shape with no distinguishing mark.

This is a visual-depth pass on an existing, working dashboard — not a rebuild. The existing
"Clean DeFi Modern" emerald identity (`--accent` light `#047857` / dark `#34d399`, plus the
already-established `--accent-bg`/`--accent-fg` tokens from the original redesign and the
Badge-contrast fix) stays exactly as-is. This spec only touches: type, surface warmth, card
hierarchy, and the nav shell.

Three visual directions were compared and picked interactively (mockups in
`.superpowers/brainstorm/687-1786462857/content/`, not part of the shipped code):
- **Type/surface direction:** "Confident Sans" — a single Geist Sans family (display + body,
  differentiated by weight, not by pairing two typefaces), warm-tinted surfaces, pill-shaped
  hero elements.
- **Card hierarchy:** "Layered cards" — hero stat tiles get a filled-pill treatment; every
  other container (tables, lists) keeps a bordered card shape, visibly secondary to the hero
  tiles.
- **Nav:** a side rail (Notion/Linear-app vertical nav), replacing the current top header.
  This is explicitly the largest-footprint pick of the three — the user was told so before
  choosing it and chose it anyway. It is still scoped to one shared component
  (`Layout.tsx`) plus new responsive behavior, not a per-page rework.

## Goal

The app reads as visually considered — warm surfaces instead of flat white, one deliberate
typeface instead of the OS default, and a real distinction between "this is the headline
number" and "this is a supporting list" — without changing the emerald brand identity, the
routes, or any page's data/logic.

## Approach

### Typography

Add `@fontsource/geist-sans` (frontend dependency) — self-hosted static font files via CSS
imports, the standard approach for non-Next.js bundlers (Vite here), avoiding a runtime Google
Fonts request. Import weights 400, 500, 600, 700 once in `frontend/src/main.tsx`:

```ts
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
```

Add a `--font-sans` token in `frontend/src/index.css`'s `:root` block:

```css
--font-sans: 'Geist Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
```

Update `body`'s `font-family` to `var(--font-sans)` (currently a hardcoded stack at
`index.css:86`). This is the only typeface change — no second display face, no per-component
font overrides. Every heading, nav label, and body paragraph in the app already inherits
`body`'s font via the cascade, so this one change propagates everywhere.

**Numbers get `font-variant-numeric: tabular-nums`** wherever a component renders a price,
TVL, volume, or percentage — this is a CSS property, not a typeface change, and it's what
makes columns of numbers (the pool table, stat tiles) align instead of jittering with
proportional figures. Apply it via a small reusable class rather than repeating the property
inline: add `.tabular-nums { font-variant-numeric: tabular-nums; }` to `index.css` (Tailwind v4
already ships a `tabular-nums` utility class that does exactly this — use Tailwind's built-in
class directly in JSX rather than adding a custom one, since it's already available and this
project already uses Tailwind utility classes throughout).

### Surface tone

Retune the light-mode surface tokens in `index.css`'s `:root` block from flat white/near-white
to a warm off-white pairing, keeping card and page visually distinct from each other (card
lighter than page, same relationship as today):

```css
--surface-1: #fdfbf8;      /* was #ffffff */
--surface-page: #f7f5f1;   /* was #fafaf9 */
```

Dark mode is **not changed** — `--surface-1: #111612` / `--surface-page: #0a0d0b` already carry
a slight warm/green cast rather than pure black, which is what the audit's "pure black, pure
white" finding was actually flagging in light mode; dark mode already avoids the tell.

No other token in the file changes. `--border`, `--text-*`, `--accent*`, and every `--series-*`/
`--status-*` token stay exactly as they are today.

### Card hierarchy — reusing existing tokens, touching two files

The hierarchy fix does **not** require touching `PoolTable.tsx`, `NewsList.tsx`,
`RelatedNews.tsx`, `PumpWatch.tsx`, or `IlCalculator.tsx` — all of them already read
`var(--surface-1)`/`var(--border)` for their card treatment, so retuning those tokens above
already gives every one of them the warmer surface for free. The hierarchy distinction comes
from changing **only** `StatTile.tsx`, the component used for every headline number
(`PoolListPage`'s 3 overview tiles, `PoolDetailPage`'s 4 stat tiles):

```tsx
export function StatTile({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div className="rounded-full px-4 py-3" style={{ background: 'var(--accent-bg)', color: accent ?? 'var(--accent)' }}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
```

This reuses `--accent-bg`/`--accent` — the exact tokens `Badge.tsx`'s `accent` variant already
uses — rather than inventing new colors. The `accent` prop (already supported, used today by
`PoolDetailPage`'s Fee APR tile with `var(--series-green)`) keeps working: it overrides the text
color while the pill background stays `--accent-bg`.

### Nav — side rail

`Layout.tsx` changes from a top header to a fixed-width side rail on screens ≥768px:

- **Sidebar:** `width: 14rem` (224px), `background: var(--surface-1)`,
  `border-right: 1px solid var(--border)`, full viewport height, `position: fixed`.
- **Lettermark:** a 28px rounded-md square, `background: var(--accent)`,
  `color: var(--accent-fg)`, containing "D" — reuses the existing `--accent-fg` token (added
  during the original redesign's WCAG follow-up) rather than a new color.
- **Nav links:** stacked vertically, default `color: var(--text-secondary)`; active/hover state
  becomes `background: var(--accent-bg)`, `color: var(--accent)`, `border-radius: 999px` — the
  same pill language as the hero stat tiles, so the two visual systems read as one design.
- **Account/wallet area:** the existing `session ? <HeaderLink to="/account" .../> : <HeaderLink to="/login" ... />`
  plus `<WalletConnectButton />` move to the bottom of the sidebar (`margin-top: auto` inside a
  flex column), separated from the nav links by a `border-top: 1px solid var(--border)`.
- **Main content:** `margin-left: 14rem` on ≥768px so it sits beside the fixed sidebar; full
  width below that breakpoint.

**Mobile (<768px):** the sidebar is off-canvas by default (`transform: translateX(-100%)`,
`transition: transform`), toggled by a hamburger button in a new slim top bar (~56px,
`background: var(--surface-1)`, `border-bottom: 1px solid var(--border)`, wordmark +
lettermark + hamburger) that only renders below the breakpoint. Opening the drawer slides the
sidebar to `translateX(0)` and shows a semi-transparent backdrop (`background: rgba(0,0,0,0.4)`)
behind it; clicking the backdrop, clicking a nav link, or navigating closes the drawer. This is
genuinely new behavior — the current top bar has no mobile-specific handling at all — but it is
scoped entirely inside `Layout.tsx`; no other component needs to know about it.

## Out of scope

- Any change to the emerald accent hue, or to `--border`/`--text-*`/`--series-*`/`--status-*`
  tokens.
- Any change to `PoolTable.tsx`, `NewsList.tsx`, `RelatedNews.tsx`, `PumpWatch.tsx`,
  `IlCalculator.tsx`, or any page's data/logic — they inherit the retuned tokens automatically.
- A second display typeface — this is a single-family (Geist Sans) pick, not a pairing.
- Any illustration, hero imagery, or marketing-page treatment — this is a functional app shell,
  not a landing page.
- Collapsible/resizable sidebar, or a user preference to switch back to a top nav — the side
  rail is the only nav shell going forward.

## Testing

This is primarily a visual/CSS change with one behavioral addition (the mobile drawer). Matches
this project's established zero-frontend-component-test convention — no new test files.
Verification is:

- `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — the `StatTile` and `Layout` prop
  contracts don't change, so this should stay clean throughout.
- Manual verification in both light and dark mode, and at both the sidebar (≥768px) and
  mobile-drawer (<768px) breakpoints: every page still renders (nav links, active-state
  highlighting, wallet connect button, account/login link), the drawer opens/closes correctly
  on mobile, and no page's content is visually cut off or overlapped by the fixed sidebar.
- Since `Layout.tsx` wraps every route, this is the one change in the whole plan with real
  blast radius — the manual pass must include at least one page from each route (Pools, Pool
  Detail, News, Screener, FAQ, My Positions, Login/Signup, Account) to confirm nothing broke
  under the new `margin-left` on desktop or the new mobile top bar.
