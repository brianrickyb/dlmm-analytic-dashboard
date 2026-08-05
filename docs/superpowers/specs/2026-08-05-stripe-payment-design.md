# Stripe Payment Gateway (Premium Screener Signal) — Design

## Context

This dashboard added user accounts (Supabase Auth) in the auth-foundation module
specifically so a payment feature could eventually gate content by "who is paying."
Separately, the educational-content module deferred a Screener idea — a "2:1
long/short ratio" premium metric — explicitly until this payment module existed, so
the gating UI would be designed once rather than retrofitted. This spec is that
payment module: a Stripe (test-mode) recurring subscription that unlocks the
deferred Screener feature.

Auth-foundation is merged into `master` as of this spec (previously sat unmerged on
its own branch); this module is the first to actually read/write a custom table in
the Supabase Postgres database — every prior module used either mock data, a
stateless third-party API proxy, or (for auth) Supabase's own built-in `auth.users`
table with no custom tables of ours.

## Goal

A logged-in user can subscribe to a $5/month test-mode plan via Stripe Checkout,
see an automatic "⚡ 2:1 signal" badge appear on the Screener's positioning table
for any pair where one side of long/short positioning is ≥66.7%, and manage
(view/cancel) their subscription via Stripe's hosted Billing Portal. Free users see
the same underlying data as always, without the badge.

## What "2:1 signal" means

The Screener's positioning table already shows a raw long/short split per pair
(e.g. `78.4% / 21.6%`) for every user, free or not. The premium feature is not new
data — it's a computed signal on top of data that's already free: a badge appears
on any row where `max(longPct, shortPct) >= 66.67` (i.e. one side is at least
double the other — a "2:1" skew), visible only to premium subscribers. Free users
still see the exact same percentages; they just don't get the badge highlighting
which rows crossed that threshold.

## Payment model

Stripe Checkout in **subscription mode**, one plan, $5/month, test mode only (no
live Stripe keys are ever used in this project). Chosen over a one-time
"lifetime unlock" because the recurring-subscription lifecycle (renewal, webhook
handling, cancellation) is the more representative skill to demonstrate and is
consistent with how the premium feature was originally framed ("payment gateway
... buat tambah experience").

## Data source / infrastructure

**Stripe** (test mode), plus a new table in the same Supabase Postgres database
auth-foundation already provisioned.

The user must have (or create) a Stripe account and obtain, in test mode:
- `STRIPE_SECRET_KEY` — backend-only, in `backend/.env`, never sent to the
  frontend, never committed (same handling as `SUPABASE_SECRET_KEY`).
- `STRIPE_PRICE_ID` — the test-mode Price object for the $5/month plan, created
  once in the Stripe Dashboard (or via the Stripe CLI) before implementation.
- `STRIPE_WEBHOOK_SECRET` — used to verify webhook signatures; obtained either
  from the Stripe Dashboard (deployed webhook endpoint) or from `stripe listen`
  (local development, via the Stripe CLI).
- Frontend needs no Stripe key at all — Checkout and the Billing Portal are both
  server-initiated redirects to Stripe-hosted pages; there is no client-side
  Stripe.js/Elements integration in this design.

These values are confirmed with the user (Stripe account readiness, whether a
walkthrough of creating the account/product/price is needed) when the
implementation plan is executed, the same way Supabase credentials were handled in
the auth-foundation module.

## Architecture

- **New DB table** `subscriptions` in Supabase Postgres (`db/schema.sql`, appended):
  `user_id` (references `auth.users.id`), `stripe_customer_id`,
  `stripe_subscription_id`, `status` (`active` / `past_due` / `canceled`),
  `current_period_end`, `created_at`, `updated_at`. Row Level Security is enabled
  with no policies for the `anon`/`authenticated` roles — this table is only ever
  read or written by the backend via the Supabase admin (service-role) client,
  which bypasses RLS by design; the default-deny posture is defense-in-depth, not
  the actual access path, consistent with the RLS note already in `db/schema.sql`
  from the auth-foundation module.
- **Backend** adds three routes, all in `backend/src/routes/`:
  - `POST /api/premium/checkout` (behind `requireAuth`) — creates a Stripe
    Checkout session (`mode: 'subscription'`, the configured price, the
    authenticated user's email prefilled), returns `{ url }` for the frontend to
    redirect to.
  - `POST /api/premium/portal` (behind `requireAuth`) — creates a Stripe Billing
    Portal session for the user's `stripe_customer_id`, returns `{ url }`.
  - `POST /api/stripe/webhook` (**not** behind `requireAuth` — Stripe calls this
    directly, authenticated by signature, not a user session) — verifies the
    `Stripe-Signature` header against the raw request body using
    `STRIPE_WEBHOOK_SECRET`, then upserts the `subscriptions` row for the
    relevant events (`checkout.session.completed`, `invoice.paid`,
    `customer.subscription.updated`, `customer.subscription.deleted`). Any other
    event type is acknowledged with 200 and ignored, so Stripe doesn't retry
    events this app doesn't act on.
  - `GET /api/account/me` (existing, extended) — now also queries `subscriptions`
    and returns `{ email, isPremium }` instead of just `{ email }`.
- **Frontend** adds:
  - `pages/UpgradePage.tsx` at route `/upgrade` — the Stripe-Checkout entry point.
    Visual style is a deliberate departure from the rest of the dashboard's
    muted, data-table aesthetic: white background, a single indigo accent color
    (`#4f46e5`), generous whitespace, a centered pricing card with a soft shadow
    — a "Stripe/Linear-style" marketing/pricing page, confirmed via mockup
    review. Two states: not-subscribed (headline, two feature bullets, pricing
    card, "Subscribe with Stripe" button) and subscribed (a "Premium active"
    badge, plan/next-billing-date summary, "Manage subscription" button to the
    Billing Portal). The rest of the app (nav bar, all other pages) is
    unchanged — this styling is scoped to `UpgradePage` only, not a redesign of
    the dashboard.
  - `lib/auth/AuthContext.tsx` (extended) — `isPremium` added alongside the
    existing `session`, fetched from `GET /api/account/me`.
  - `components/PositioningTable.tsx` (modified) — a small indigo "⚡ 2:1 LONG" /
    "⚡ 2:1 SHORT" badge renders next to the Long/Short Ratio cell when
    `isPremium` is true and that row's ratio crosses the threshold; when
    `isPremium` is false, qualifying rows instead show a small muted "Upgrade to
    see signal" text linking to `/upgrade`. Non-qualifying rows are unaffected
    either way.
  - `components/Layout.tsx` (modified) — nav gains an "Upgrade" link (shown as
    "⭐ Upgrade" once the user is already premium, otherwise plain "Upgrade").

## Data flow

1. User on `/upgrade` (not yet premium) clicks "Subscribe with Stripe" → frontend
   calls `POST /api/premium/checkout` → backend creates a Checkout session →
   frontend redirects the browser to the returned Stripe-hosted URL.
2. User completes payment with a Stripe test card (`4242 4242 4242 4242`) →
   Stripe redirects back to `/upgrade?success=true`.
3. Separately and asynchronously, Stripe sends a `checkout.session.completed`
   webhook to `POST /api/stripe/webhook` → backend verifies the signature →
   upserts the `subscriptions` row (`status: 'active'`, storing
   `stripe_customer_id`/`stripe_subscription_id`).
4. Because steps 2 and 3 race, `UpgradePage` on the `?success=true` return shows
   a brief "Processing..." state and polls `GET /api/account/me` every couple of
   seconds until `isPremium` flips to `true`, rather than trusting the query
   param alone.
5. From then on, any page load that calls `GET /api/account/me` (on app start, via
   `AuthContext`) picks up `isPremium: true`, and `PositioningTable` starts
   rendering signal badges.
6. User clicks "Manage subscription" on `/upgrade` or `AccountPage` → backend's
   `/api/premium/portal` creates a Billing Portal session → user is redirected to
   Stripe's hosted billing UI (view invoices, update card, or cancel).
7. If canceled, Stripe sends `customer.subscription.deleted` → backend sets
   `status: 'canceled'` → next `GET /api/account/me` call returns
   `isPremium: false` → badges disappear.

## Error handling

- Stripe API unreachable/erroring when creating a Checkout or Billing Portal
  session → 503, following the existing `BybitUnavailableError` /
  `CoinGeckoUnavailableError` pattern already used for third-party API failures.
- Invalid/missing webhook signature → 400, logged as a warning (not an error) —
  expected background noise from scanners hitting the endpoint, not a bug.
- Unhandled (but validly-signed) webhook event types → 200, no action taken.
- User without a `subscriptions` row at all (never subscribed) → `isPremium:
  false`, same as an explicitly canceled subscription; no error state needed for
  "never subscribed."

## Testing

- Backend: `services/subscriptions.ts` (upsert/read logic) unit-tested with a
  fake Supabase client, following the same dependency-injection pattern as
  `bybit.ts` / `coingecko.ts` / `supabaseAdmin.ts` — no real network or database
  calls in tests. The webhook route is tested by constructing fake Stripe event
  payloads and injecting a fake signature-verification function, asserting the
  `subscriptions` table is updated correctly for each handled event type
  (`checkout.session.completed`, `invoice.paid`,
  `customer.subscription.updated`, `customer.subscription.deleted`) and that
  unhandled event types are acknowledged without side effects.
- Frontend: manual verification via a Playwright screenshot pass, consistent
  with every prior module in this project (no component tests) — signup → visit
  `/upgrade` → subscribe with the Stripe test card → confirm the badge appears
  on the Screener → open the Billing Portal → cancel → confirm the badge
  disappears again.

## Out of scope (this spec)

- Multiple pricing tiers — one premium plan only.
- Proration or upgrade/downgrade flows between plans — not applicable with a
  single plan.
- Custom email receipts/notifications — Stripe's built-in test-mode receipt
  emails are sufficient for this demo.
- Refund handling.
- Client-side Stripe.js/Elements (embedded card form) — Checkout is fully
  Stripe-hosted, so no card data or Stripe.js touches this app's frontend code.
- Redesigning the rest of the dashboard's visual style — the "Clean Modern SaaS"
  treatment is scoped to `UpgradePage` only.
