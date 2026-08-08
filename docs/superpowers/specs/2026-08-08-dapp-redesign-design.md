# dApp Visual Redesign ("Clean DeFi Modern") — Design

## Context

Every page in this dashboard so far shares one visual language: a muted, off-white/beige,
low-contrast "analytics spreadsheet" aesthetic (see `frontend/src/index.css`'s `--surface-*`/
`--text-*` tokens) — deliberately plain, since earlier modules were about data correctness,
not visual identity. Now that the project has a genuinely on-chain feature
(wallet-connect + add-liquidity, `feat/wallet-liquidity`) and a payment module
(`feat/stripe-payment`, paused), the user wants the dashboard's *look* to catch up: feel like
a real, current dApp rather than an internal reporting tool. Direction and palette were
validated interactively via mockups (visual companion) against real page content, not
chosen from description alone.

## Goal

Every existing page and shared component adopts one consistent "Clean DeFi Modern" visual
language (Uniswap/Jupiter-inspired: card-based, generous whitespace, bold confident
typography, one accent color used consistently) in both light and dark mode, with zero
functional/data changes — this is a pure visual/CSS + component-structure pass, not a
feature change. No page's information architecture changes; tables, forms, and their data
stay exactly where they are.

## Visual language (validated via mockup)

**Accent color — emerald**, chosen for its "yield/growth" association in a DeFi context:
- Dark mode fills/text: `#34d399`
- Light mode text/accent: `#059669` (darker, for AA contrast on white — the same raw
  `#34d399` fails contrast as text-on-white, confirmed visually in the light-mode mockup)
- Tinted backgrounds (highlighted rows/cards): `rgba(52, 211, 153, 0.08–0.14)` dark,
  `#ecfdf5`→`#ffffff` gradient light

**Surface & text tokens** — replacing the existing muted/beige values in
`frontend/src/index.css` (same token *names*, new values, so every component that already
reads `var(--surface-1)` etc. picks up the new palette with no per-component code change):

| Token | Light (new) | Dark (new) |
|---|---|---|
| `--surface-page` | `#fafaf9` | `#0a0d0b` |
| `--surface-1` (cards) | `#ffffff` | `#111612` |
| `--text-primary` | `#18181b` | `#ffffff` |
| `--text-secondary` | `#3f3f46` | `#dfe3e1` |
| `--text-muted` | `#a1a1aa` | `#8b9490` |
| `--border` / `--gridline` | `#e7e5e4` | `#1e2622` |
| `--accent` (new token) | `#059669` | `#34d399` |
| `--accent-bg` (new token) | `#ecfdf5` | `rgba(52,211,153,.12)` |

(Mockups used a slightly darker `#6b7570` in a few dark-mode labels — collapsed to the
single `--text-muted` value above for a consistent 3-tier scale; the difference is minor
enough not to warrant a 4th text token.)

The existing `--series-*` (chart line colors) and `--status-*` (good/warning/critical)
tokens are **unchanged** — they're semantic (green=good, red=critical) and orthogonal to
the accent color; recharts lines, price-change coloring, and status badges keep working
exactly as-is.

**Shape & spacing:**
- Card/row radius: **12–16px** (`rounded-xl`/`rounded-2xl`), a deliberate step up from the
  current `rounded-lg` (8px) — this is one of the most visible "modern vs. spreadsheet"
  signals in the mockups.
- Table rows become individually-rounded, gapped "row-cards" (`display:grid` row + `gap-1.5`
  between rows, each row its own bordered/radius'd box) instead of a single bordered
  `<table>` with internal row dividers — validated in both the Pools mockup (4-column) and
  the denser Screener mockup (4-column + inline badges), so this pattern holds at both
  densities.
- Highlighted/notable rows (e.g. Screener's "Long-leaning" pairs, a pool with the 2:1 signal)
  get a subtle accent-tinted gradient background + accent-colored border, instead of the
  current plain-text colored label as the only differentiator.

**Typography:** unchanged font stack (`system-ui, -apple-system, "Segoe UI", sans-serif` —
no new font loading), but headings/emphasis move to bolder weights (700–800, `font-weight`
via Tailwind `font-bold`/`font-extrabold`) and tighter letter-spacing on large headings
(`tracking-tight`-equivalent, `-0.4px` to `-0.6px`) — this is most of what makes the mockups
read as "bold/confident" rather than just "recolored."

**Badges** (new shared pattern): small pill-shaped labels — `rounded-md`, `px-2 py-0.5`,
`text-[10.5px] font-bold uppercase`, tinted background (`var(--accent-bg)` or the relevant
`--status-*` tint) + matching text color. Replaces today's plain colored inline text for
things like "Long-leaning"/"Short-leaning" and the Screener's "⚡ 2:1" signal.

## Scope: light + dark, whole dashboard, in one pass

Both modes ship together (the existing `prefers-color-scheme` + `data-theme` toggle
mechanism in `index.css` is kept as-is, only the token *values* change) — confirmed via a
dedicated light-mode mockup alongside the dark one, so this isn't "dark now, light later."
Every page adopts the new tokens/component patterns in one implementation pass rather than
phased by page, since the goal is that the whole app reads as one consistent product
immediately, not a mix of old and new styles.

## Page-by-page notes

**Pools (`PoolListPage.tsx`, `PoolTable.tsx`):** gains a new 3-tile stats strip above the
table (Total TVL, 24h Volume, Active Pools — computed client-side from the existing mock
pool list, no new backend/data needed) — validated in the full-page mockup as a common
"at a glance" pattern in this genre of app that the current page lacks entirely. Table
becomes row-cards per the pattern above; the highest-APR/first row shown with the tinted
highlight in the mockup is illustrative, not a functional requirement — no new "top pool"
logic is being added, this is purely about confirming the row-card pattern reads correctly.

**Screener (`ScreenerPage.tsx`, `PositioningTable.tsx`, `TrendingWatch.tsx`):** row-card
pattern for the positioning table; the existing "Long-leaning"/"Short-leaning" plain-text
labels become badges per the shared pattern. (The premium "⚡ 2:1" signal shown in the
Screener mockup only exists in code on the separate, unmerged `feat/stripe-payment`
branch — this branch's `PositioningTable.tsx` has no `isPremium`/signal logic to restyle.
The mockup's badge visual is still the reference for whenever that branch is revived; see
Out of scope.) Trending/Narrative Watch becomes a wrapped row of small pill cards (symbol,
rank, 24h change) instead of the current plain list.

**Pool Detail (`PoolDetailPage.tsx`, `StatTile.tsx`, `IlCalculator.tsx`,
`AddLiquidityForm.tsx`):** stat tiles and the IL calculator's result cells adopt the new
card radius/tokens; no layout restructuring. `AddLiquidityForm` (from
`feat/wallet-liquidity`) keeps its current field layout, restyled to match.

**Upgrade — not part of this implementation, mockup kept as future reference.**
`UpgradePage.tsx` doesn't exist on this branch at all — it was built on the separate,
unmerged `feat/stripe-payment` branch (currently paused; the payment provider is being
switched away from Stripe entirely, see project memory) and was never merged to master or
any ancestor of this branch. The dedicated Upgrade-page mockup validated during
brainstorming (dark/emerald, replacing that branch's original white/indigo "Clean Modern
SaaS" one-off style) is real and should be the reference whenever the payment module is
rebuilt — but there is no file for this spec's plan to touch today. Treat it the same as
the Screener's 2:1 signal below: direction validated, implementation deferred.

**News, FAQ, Auth (Login/Signup/Account), My Positions (`MyPositionsPage.tsx`):** no
dedicated mockups were made for these — they're simpler list/form pages that reuse the same
primitives already validated elsewhere (row-cards for News headlines and FAQ accordion
items, the same form-input styling for Login/Signup, stat-card styling for AccountPage) and
don't introduce new layout questions. Apply the shared tokens/components; if something about
a specific page's content doesn't fit the established patterns during implementation, that's
a signal to revisit, not to invent a new pattern silently.

**Nav (`Layout.tsx`):** active-page indicator changes from plain text to an
accent-color-underlined tab (`border-bottom: 2px solid var(--accent)` on the current
route's link) — validated in every full-page mockup. `WalletConnectButton`'s connected
state (shortened address) becomes a filled pill badge instead of a bordered button, matching
the mockups' nav treatment.

## Out of scope (this spec)

- Any new feature, data, or backend change — this is CSS/JSX restructuring of existing
  pages only. The Pools stats strip is the one new *visual element*, but it's derived from
  data the page already has in memory, not a new data source.
- Custom font loading — stays on the system font stack.
- Animation/motion design (hover transitions, page transitions) — not covered by the
  mockups reviewed, not part of this pass; a natural follow-up, not blocking.
- Mobile-specific responsive redesign — the existing `max-w-6xl` centered-container
  responsive behavior is kept; this pass targets desktop-width layouts matching the
  mockups, consistent with how every prior module in this project has been built and
  verified (Playwright screenshots at a fixed desktop viewport).
- Reconciling this with the paused `feat/stripe-payment` branch, or touching anything that
  only exists there — `UpgradePage.tsx` (doesn't exist on this branch) and the Screener's
  premium "⚡ 2:1" signal markup (`PositioningTable.tsx`'s `isPremium` prop/badge, also not
  present here). Both were validated visually via mockup and that direction is the
  reference for whenever the payment module is rebuilt (with a different provider — see
  project memory), but neither is implemented by this spec's plan.

## Testing

Consistent with this project's established convention: no new automated component tests
(this project has never had them; only pure-logic files like `il.ts`/`yield.ts` do).
Verified manually via Playwright screenshots, covering **both light and dark mode**, for
every page that actually exists on this branch: Pools (list + detail), Screener, News, FAQ,
Login/Signup/Account, and My Positions — checking each renders with the new tokens, zero
console errors, and that sorting/filtering/expand-collapse interactions (already-existing
functionality) still work after the markup restructuring. (Upgrade is excluded — see Out
of scope.)
