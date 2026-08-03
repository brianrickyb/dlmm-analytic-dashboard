# Auth + Database Foundation — Design

## Context

The user wants to add a payment gateway (Stripe, test-mode demo) to the dashboard as a
portfolio talking point. Payment requires knowing *who* is paying, which requires user
accounts, which requires a real database — none of which exist in this project yet
(the DB schema designed in stage 2 for DLMM pool snapshots was never connected; every
other module so far is either mock data or a stateless proxy to a third-party API).
This is flagged as three separable subsystems — auth, database, payment — and this spec
covers the first two together (auth needs a database to exist; splitting them further
would leave a spec with nothing to build). Payment (Stripe) is a separate, later spec
that builds on top of this one.

## Goal

Give the dashboard real user accounts (signup/login/logout) backed by a real database,
proven by one genuinely protected piece of functionality (`/account`, showing the
logged-in user's email, fetched from a backend endpoint that verifies the session
server-side) — without yet building anything payment/subscription-related.

## Data source / infrastructure

**Supabase** (Postgres + Supabase Auth), chosen because:
- It's the database this project already planned to use (stage 2's `db/schema.sql` for
  DLMM pool snapshots) — using it now finally connects that plan instead of running a
  second, unrelated DB just for auth.
- Supabase Auth is bundled and free-tier-generous: email/password signup, session
  management, JWT issuance, and token refresh are handled by Supabase and its client
  SDK, not hand-rolled. No password hashing or session-token logic is written in this
  project's own code.
- Supabase Auth automatically maintains its own `auth.users` table. **No custom
  `profiles` table is created in this module** — proving "the user is logged in and
  the backend can verify it" needs nothing beyond the email Supabase already stores.
  A `profiles` table (or a `customers`/`subscriptions` table) is a payment-module
  concern, added when that spec actually needs it.

The user must create a Supabase project themselves (this cannot be provisioned by an
agent) and obtain three values:
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (Supabase's current naming for what
  used to be called the `anon` key) — safe to expose in frontend code, designed
  to be public, meaningless without Row Level Security policies on top of them (moot
  here since no custom tables exist yet).
- `SUPABASE_SECRET_KEY` (Supabase's current naming for what used to be called the
  `service_role` key) — a high-privilege key that bypasses all data protection.
  **Backend-only, in `backend/.env`, never sent to the frontend, never committed.**

## Architecture

- **Frontend** uses `@supabase/supabase-js` directly for signup, login, logout, and
  session state (`onAuthStateChange`). The frontend never talks to our own backend for
  authentication itself — only for the one protected data endpoint below. This is the
  standard "Supabase Auth + custom API" integration pattern, and it avoids
  reimplementing anything the SDK already does correctly (token storage, refresh).
- **Backend** adds one verification step, not a login endpoint: a Fastify hook reads
  `Authorization: Bearer <token>`, calls the Supabase admin client's
  `auth.getUser(token)` (using the service-role key), and either attaches the resulting
  user to the request or rejects with 401. This calls out to Supabase's Auth API per
  request (not local JWT verification) — simpler to implement correctly and consistent
  with this project's existing pattern of trusting a well-documented upstream call
  over rolling custom crypto verification.
- **One protected endpoint**: `GET /api/account/me`, returning `{ email }` after the
  hook succeeds. This is the entire proof-of-concept — deliberately not more.
- **Frontend route** `/account`: redirects to `/login` client-side if there's no local
  Supabase session (a UX convenience, not a security boundary — trivially bypassable),
  and displays the email returned by `GET /api/account/me` (the actual security
  boundary, enforced server-side regardless of what the client does).

## Components

**Frontend** (`frontend/src/`)
- `lib/supabase.ts` — the Supabase client singleton, built from
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.
- `lib/auth/AuthContext.tsx` — a React context/provider wrapping the app, exposing the
  current session/user and `signUp`/`signIn`/`signOut`, backed by
  `supabase.auth.onAuthStateChange`.
- `pages/SignupPage.tsx`, `pages/LoginPage.tsx` — forms calling
  `supabase.auth.signUp` / `signInWithPassword`, with inline error display.
- `pages/AccountPage.tsx` — redirects to `/login` if no session; otherwise calls the
  backend's `/api/account/me` (attaching the session's access token as a Bearer
  header) and renders the returned email, plus a logout button.
- `components/Layout.tsx` (modified) — nav shows "Login" when signed out, or the
  user's email + "My Account" link when signed in.

**Backend** (`backend/src/`)
- `lib/supabaseAdmin.ts` — the Supabase admin client, built from `SUPABASE_URL` /
  `SUPABASE_SECRET_KEY`.
- `middleware/requireAuth.ts` — the Fastify hook: extracts the Bearer token, calls
  `supabaseAdmin.auth.getUser(token)`, attaches `request.user` or replies 401.
  Dependency-injectable (accepts a `getUser`-like function) so tests never call the
  real Supabase API, matching the DI pattern already established in
  `services/bybit.ts`/`services/coingecko.ts`.
- `routes/account.ts` — registers `GET /api/account/me`, using the hook above.

## Data flow

1. User submits the signup or login form → frontend calls `supabase.auth.signUp` /
   `signInWithPassword` directly against Supabase — our backend is not involved.
2. Supabase's SDK stores the resulting session (access token + refresh token) and
   keeps it fresh automatically.
3. User navigates to `/account` → frontend redirects to `/login` if there's no local
   session (UX only), otherwise calls `GET /api/account/me` with
   `Authorization: Bearer <access_token>`.
4. Backend's `requireAuth` hook calls `supabaseAdmin.auth.getUser(token)`. Valid → the
   route handler returns `{ email: request.user.email }`. Invalid/expired → 401.
5. Frontend renders the email, or redirects to `/login` if the backend call itself
   returned 401 (covers the case where the local session looks valid but the token
   already expired or was revoked server-side).

## Error handling

- Frontend: Supabase signup/login errors (wrong password, duplicate email, weak
  password, etc.) are shown inline on the form, not as a generic alert.
- Backend: missing/invalid/expired token → 401 with a clear message. Supabase's Auth
  API being unreachable → 503, following the same "upstream down ≠ crash" pattern
  established by `BybitUnavailableError`/`CoinGeckoUnavailableError`.

## Testing

- Backend: `requireAuth`'s hook is unit-tested with an injected fake `getUser`
  function (mirroring the `fetchImpl` DI pattern from `bybit.ts`/`coingecko.ts`) —
  valid token → request proceeds with `request.user` set; invalid token → 401;
  upstream failure (thrown error from the fake) → 503. `routes/account.ts` is tested
  the same way `routes/screener.ts` was — inject a fake auth dependency, assert the
  200 and 401 paths.
- Frontend: verified manually in the browser (signup → login → view `/account` →
  logout) via a Playwright screenshot check, consistent with every prior module in
  this project — no formal component tests for this MVP.

## Security notes (binding constraints for the implementation plan)

- `SUPABASE_SECRET_KEY` must never reach frontend code or version control —
  backend-only, `.env`-only, exactly like every other secret in this project so far.
- `SUPABASE_PUBLISHABLE_KEY` is safe client-side by design; its safety currently depends
  on no custom tables existing yet (true for this module) — any future table needs Row
  Level Security policies before the publishable key can be trusted against it.
- CORS remains `origin: true` (unchanged) — deliberate, not an oversight. This project
  uses a Bearer token, not a cookie, for authenticated requests, so the classic
  cookie-based CSRF risk that open CORS would otherwise create doesn't apply here
  (a token isn't automatically attached by the browser the way a cookie is). Noted as
  a follow-up to tighten to the deployed frontend's real origin once this project is
  actually deployed publicly — not a blocker for this module.

## Out of scope (this spec)

- Stripe/payment integration — separate, later spec that builds on this one (will need
  its own `customers`/`subscriptions` tables referencing `auth.users.id`).
- Any `profiles` table or user-editable profile fields (display name, avatar, etc.) —
  add only when a concrete feature (payment or otherwise) actually needs one.
- Password reset / email verification flows — Supabase Auth supports both, but neither
  is required to prove the core signup → login → protected-endpoint loop works; can be
  added later without changing this design.
- Social/OAuth login providers — email/password only for this module.
- Rate limiting on signup/login — Supabase Auth has its own abuse protection on these
  endpoints; not something this project's backend needs to duplicate.
