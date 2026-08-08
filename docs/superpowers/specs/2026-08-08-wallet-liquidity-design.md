# Wallet Connect + On-Chain Add Liquidity — Design

## Context

Every module so far in this project is either mock data (`frontend/src/mock/pools.ts`,
`snapshots.ts`) or a stateless read-only proxy to a third-party API (news, screener) or
Supabase Auth (auth foundation). Nothing in the codebase has ever talked to Solana or
Meteora's DLMM program — no `@solana/web3.js`, no wallet adapter, no on-chain call exists
anywhere in either package. This spec adds the project's first genuinely on-chain feature:
connecting a Solana wallet and submitting a real "add liquidity" transaction to a DLMM
pool, on **devnet only**.

This is deliberately scoped as one feature, not split further, because the pieces are only
useful together: a wallet connection with nothing to sign is inert, and a transaction-builder
endpoint with no wallet to sign it is unreachable. Persisting the resulting position
(`positions` table) is included in the same spec because "my positions" is the only way to
verify the on-chain write actually happened, from inside this dashboard.

## Goal

A user can connect Phantom or Solflare (devnet), pick a pool, enter an amount of token X/Y
and a bin range, sign and submit an add-liquidity transaction built server-side, see it
confirm on devnet with a Solscan link, and see it appear under "My Positions" — all without
the backend ever touching a private key.

## Non-negotiable constraints (binding for the implementation plan)

- **Devnet only.** `SOLANA_RPC_URL` / `VITE_SOLANA_RPC_URL` point at devnet
  (`https://api.devnet.solana.com` by default). Nothing in this spec enables mainnet; that is
  an explicit, separate decision the user makes later — not a config flag flipped casually.
- **The backend never signs and never holds a private key.** It only builds an unsigned
  transaction and returns it serialized. Signing happens exclusively in the wallet
  (`wallet.signTransaction`), client-side.
- **The backend does not trust the frontend's claim that a transaction succeeded.**
  `POST /api/positions` independently verifies the signature on-chain (see Data flow) before
  writing a row — a client could otherwise fabricate arbitrary position records.

## Data source / infrastructure

- **Solana RPC**: a plain public devnet endpoint (`https://api.devnet.solana.com`) is enough
  for a portfolio-scale project; both frontend and backend read the URL from an env var
  (`SOLANA_RPC_URL` backend, `VITE_SOLANA_RPC_URL` frontend) rather than hardcoding it, so
  swapping in a dedicated provider (Helius, QuickNode) later is a config change, not a code
  change. This project's existing "config missing → error at request time, not startup
  crash" convention (`requireAuth.ts`/`account.ts`) is followed here too.
- **Meteora DLMM SDK** (`@meteora-ag/dlmm`) is the only thing that knows how to construct a
  correctly-shaped add-liquidity instruction (bin arrays, position PDA derivation, strategy
  encoding) — this project does not hand-roll Solana program instructions.
- **Wallet adapters**: `@solana/wallet-adapter-react` + `@solana/wallet-adapter-wallets`
  (Phantom, Solflare only, per scope). Deliberately **not** using
  `@solana/wallet-adapter-react-ui`'s prebuilt modal/button — this project's strict
  `style={{ color: 'var(--...)' }}` token convention (see `frontend/src/index.css`) has no
  equivalent in the SDK's stock CSS, so a custom `WalletConnectButton` built on the adapter's
  hooks (`useWallet`) is more consistent with the rest of the UI than importing a
  differently-themed component.
- **Supabase**: reuses the existing project/client from the auth module. New table
  `positions`, written only by the backend using the service-role client
  (`lib/supabaseAdmin.ts`) — the frontend never queries `positions` directly via
  `supabase-js`, it goes through `GET /api/positions`. This matters for the RLS question
  below.

## Architecture

- **Frontend**: a `WalletContextProvider` (Solana `ConnectionProvider` + `WalletProvider`,
  Phantom + Solflare adapters, `autoConnect`) wraps the app inside the existing
  `AuthProvider`/`Layout` nesting in `App.tsx`. A `WalletConnectButton` in `Layout.tsx`'s nav
  (next to the existing session-aware Login/email link) exposes connect/disconnect and shows
  a shortened address (`Ab3d…f9Qk`) when connected — this is unrelated to Supabase Auth
  (`session`); a user can be logged in without a wallet connected and vice versa.
- **Backend**: one new route file, `routes/liquidity.ts`, registering
  `POST /api/liquidity/build-tx`. It validates the request body (see Validation), calls the
  Meteora DLMM SDK against devnet to build an unsigned add-liquidity transaction for the
  given pool/amounts/bin range, and returns `{ transaction: <base64>, blockhash, lastValidBlockHeight }`
  — the last two so the frontend can use Solana's current (non-deprecated)
  `confirmTransaction` strategy instead of the old signature-only polling API.
- **Frontend sign & submit**: on receiving the unsigned tx, deserialize it, call
  `wallet.signTransaction`, then `connection.sendRawTransaction`, then
  `connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight })`. A small
  state machine (`idle → building → awaiting-signature → submitting → confirming → success |
  error`) drives the UI; `error` (including timeout) offers a "Retry" button that restarts
  from `building` (a fresh unsigned tx must be built — the original blockhash may have
  expired).
- **Persisting the position**: once `confirmTransaction` reports success, the frontend calls
  `POST /api/positions` with `{ walletAddress, poolAddress, txSignature }`. The backend
  independently confirms the signature via `connection.getSignatureStatuses` before inserting
  — it does not take the frontend's word for it (see Non-negotiable constraints).
- **My Positions**: a new route/page (`/positions`) fetches `GET /api/positions?wallet=<pubkey>`
  when a wallet is connected, listing pool address, tx signature (linked to Solscan), and
  timestamp. The add-liquidity success state also triggers a refetch if the user is on that
  page (see Components — `PositionsRefreshContext`).

## Components

**Backend** (`backend/src/`)
- `lib/solanaConnection.ts` — `createConnection(rpcUrl: string): Connection` factory,
  mirroring the existing `createSupabaseAdmin(url, key)` shape; reads `SOLANA_RPC_URL` at
  the route-registration call site (not at module load), matching the existing "missing
  config → 500 at request time" convention.
- `lib/dlmmError.ts` — `SolanaUnavailableError extends Error` (RPC unreachable / SDK threw
  for infra reasons) and `PoolNotFoundError extends Error` (bad `poolAddress`), following the
  exact pattern of `BybitUnavailableError`/`CoinGeckoUnavailableError`: a route catches the
  specific class and replies with the right status code, anything else rethrows to Fastify's
  default 500 handler.
- `routes/liquidity.ts` — `registerLiquidityRoutes(app, deps?)`, registers
  `POST /api/liquidity/build-tx`. `deps` allows injecting a fake DLMM-pool-like object in
  tests, matching the DI pattern from `routes/screener.ts`.
- `routes/positions.ts` — `registerPositionsRoutes(app, deps?)`, registers
  `POST /api/positions` and `GET /api/positions`. `deps` allows injecting a fake Supabase
  client and a fake `verifySignature` function in tests.
- `lib/liquidityValidation.ts` — the zod schema(s) for `build-tx`'s request body (see
  Validation). **This introduces `zod` as a new backend dependency** — flagged explicitly
  because no validation library exists in this codebase today (routes currently use `as`
  type assertions on `request.query`). Justification: hand-writing bounds/shape checks for
  five numeric/pubkey fields whose failure mode is "server tries to spend real (devnet) SOL
  building a bogus instruction" is exactly the kind of boundary zod exists for, and the
  alternative (a pile of manual `if` checks) is more error-prone here, not less.

**Frontend** (`frontend/src/`)
- `lib/wallet/WalletContextProvider.tsx` — `ConnectionProvider` (URL from
  `VITE_SOLANA_RPC_URL`) + `WalletProvider` (`PhantomWalletAdapter`, `SolflareWalletAdapter`,
  `autoConnect`).
- `components/WalletConnectButton.tsx` — reads `useWallet()` (`publicKey`, `connected`,
  `connect`/`disconnect`, `select`, `wallets`); shows "Connect Wallet" (opens a minimal
  inline wallet-choice list — just the two configured wallets, not the adapter's stock modal)
  when disconnected, shortened address + disconnect when connected.
- `lib/api/liquidity.ts` — `buildAddLiquidityTx(params): Promise<{ transaction: string;
  blockhash: string; lastValidBlockHeight: number }>`, same shape as existing
  `lib/api/news.ts`/`screener.ts` (local `API_BASE_URL`, throws `Error(body.error ?? ...)`
  on non-2xx).
- `lib/api/positions.ts` — `createPosition(params)`, `fetchPositions(wallet: string):
  Promise<Position[]>`.
- `lib/positionsRefresh.ts` — a tiny context (`PositionsRefreshContext`) exposing a counter
  and a `bump()` function. This is the smallest mechanism that fits the project's existing
  "Context for shared state, no external state library" convention
  (`AuthContext` is the precedent) to let a successful add-liquidity on `PoolDetailPage`
  cause `MyPositionsPage` to refetch next time it's viewed, without introducing React Query.
- `components/AddLiquidityForm.tsx` — amount X/Y and min/max bin ID inputs, drives the
  build → sign → submit → confirm state machine, renders the three required states
  (pending/success/error-with-retry) plus a Solscan devnet link
  (`https://solscan.io/tx/<sig>?cluster=devnet`) on success.
- `pages/PoolDetailPage.tsx` (modified) — renders `<AddLiquidityForm poolAddress={...}
  binStep={...} activeBinId={...} />` only when `connected` is true; otherwise a prompt to
  connect a wallet first.
- `pages/MyPositionsPage.tsx` — new page/route `/positions`; empty-state prompting wallet
  connection when `!connected` (same shape as `AccountPage`'s `/login` redirect logic, but a
  wallet is not a login session so this is an inline message, not a route redirect); fetches
  and lists positions otherwise.
- `components/Layout.tsx` (modified) — add `WalletConnectButton` and a `/positions` nav link
  to the existing `<nav>`.

## Data flow

1. User connects Phantom/Solflare via `WalletConnectButton` → `useWallet()`'s `publicKey`/
   `connected` become available app-wide.
2. On `PoolDetailPage`, user fills the add-liquidity form and submits →
   `buildAddLiquidityTx({ poolAddress, amountX, amountY, minBinId, maxBinId, userPublicKey })`
   calls `POST /api/liquidity/build-tx`.
3. Backend validates the body (zod), loads the DLMM pool via the SDK against
   `SOLANA_RPC_URL`, builds an unsigned add-liquidity transaction, and returns
   `{ transaction, blockhash, lastValidBlockHeight }`.
4. Frontend deserializes the transaction, calls `wallet.signTransaction(tx)` (wallet UI
   prompts the user), then `connection.sendRawTransaction(signedTx.serialize())`, then
   `connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')`.
5. On confirmation, frontend calls `POST /api/positions` with
   `{ walletAddress, poolAddress, txSignature }`.
6. Backend calls `connection.getSignatureStatuses([txSignature])`; only if the status shows
   `confirmationStatus` of `confirmed`/`finalized` and `err === null` does it insert a row
   into `positions` via the service-role Supabase client. Otherwise it replies 422 without
   writing anything.
7. Frontend shows the success state (Solscan link) and bumps `PositionsRefreshContext`.
8. `MyPositionsPage` (if mounted, or on next visit) calls
   `GET /api/positions?wallet=<publicKey>`, which reads the `positions` table filtered by
   `wallet_address` and returns rows ordered by `created_at DESC`.

## Validation (server-side, `POST /api/liquidity/build-tx`)

- `poolAddress`, `userPublicKey`: must parse as a valid base58 `PublicKey` (`new
  PublicKey(x)` in a try/catch, not just a regex) — reject with 400 otherwise.
- `amountX`, `amountY`: numeric strings (avoids float precision loss over the wire for
  token amounts), must parse to a positive value (`> 0`); at least one of the two must be
  greater than zero (DLMM allows single-sided liquidity, but both being zero is meaningless).
- `minBinId`, `maxBinId`: integers, `minBinId <= maxBinId`, and the range width
  (`maxBinId - minBinId`) bounded to a sane maximum (exact bound confirmed against the
  installed `@meteora-ag/dlmm` SDK's own strategy-builder limits during implementation,
  since Meteora enforces its own per-transaction bin-array limit — the server should reject
  clearly before the SDK does, not rely on the SDK's own error).
- `slippageBps` (optional, default `100` = 1%): integer, bounded `1–2000` (0.01%–20%) —
  added because the prompt's scope explicitly calls for "slippage wajar" validation even
  though it wasn't listed among the endpoint's named fields; used as the active-bin-id
  slippage tolerance the SDK accepts when building the strategy.
- Any validation failure → `400` with a body shaped like every other error response in this
  project, `{ error: '<specific message>' }` (zod's `.flatten()` message mapped to the first
  relevant field, not zod's raw error object — keeps the response shape consistent with the
  rest of the API instead of leaking library-specific structure).

## Data model — `positions` table (`db/schema.sql`)

```sql
CREATE TABLE positions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  pool_address   TEXT NOT NULL,
  tx_signature   TEXT NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_positions_wallet ON positions (wallet_address, created_at DESC);
```

- `tx_signature UNIQUE` makes `POST /api/positions` naturally idempotent — a retried/duplicate
  call for the same signature fails the insert rather than creating a duplicate row; the
  route treats a unique-violation as "already recorded" (200, not 500).
- **RLS**: not enabled, for the same reason `tokens`/`pools`/`pool_snapshots`/
  `pool_latest_stats` don't have it today — per this project's own stated policy
  (`db/schema.sql`'s header comment), RLS is only required for tables queried *directly from
  the frontend* via `supabase-js`. `positions` is written and read exclusively through the
  backend's service-role client (`POST /api/positions`, `GET /api/positions`); the frontend
  never imports `supabase` to touch this table. If a future change ever has the frontend
  query `positions` directly, RLS must be added first — noted here so it isn't missed later.

## Error handling

- Backend, `build-tx`: invalid input → 400 (zod). RPC/SDK failure reaching devnet →
  `SolanaUnavailableError` → 503. Pool address not found on-chain → `PoolNotFoundError` → 404.
  Anything else unexpected → rethrown, Fastify's default 500.
- Backend, `POST /positions`: invalid body → 400. Signature not found / not confirmed / has
  an on-chain error → 422 (`{ error: 'Transaction is not confirmed on-chain.' }`) — this is
  the case a malicious or buggy client hits, not a 5xx. Supabase unreachable → 503. Duplicate
  `tx_signature` → 200 with the existing row (idempotent), not an error.
- Backend, `GET /positions`: missing/invalid `wallet` query param → 400. Supabase unreachable
  → 503.
- Frontend: every RPC/wallet call (`connect`, `signTransaction`, `sendRawTransaction`,
  `confirmTransaction`) is wrapped so a rejection (user closes the wallet popup, RPC times
  out, tx fails simulation) lands in the `error` state with a human-readable message and a
  Retry button — never a silent failure or an uncaught promise rejection.

## Testing

- Backend: `routes/liquidity.test.ts` and `routes/positions.test.ts` use `app.inject()` with
  injected fake `deps` (fake DLMM pool object, fake Supabase client, fake `verifySignature`),
  exactly like `routes/screener.test.ts`/`routes/account.test.ts` — no real devnet calls in
  the test suite. `lib/liquidityValidation.test.ts` unit-tests the zod schema's edge cases
  directly.
- Frontend: `lib/api/liquidity.ts`/`positions.ts` are thin enough that manual verification
  (Task 10, real devnet wallet) is the primary check, consistent with this project's existing
  "no formal component tests, Playwright screenshot walkthrough" pattern from the auth
  module. `AddLiquidityForm`'s state machine, if it grows non-trivial branching, gets a plain
  Vitest unit test for the reducer/state-transition function in isolation (not a rendered
  component test), matching `lib/il.test.ts`'s pure-logic-only testing style.

## Security notes

- Backend never receives, stores, or logs a private key or a signed-but-unsubmitted
  transaction — only ever an *unsigned* transaction it built itself, and later a public
  signature string.
- `POST /api/positions` independently verifies on-chain confirmation before trusting a
  client-submitted `txSignature` (see Data flow step 6) — without this, any caller could
  `POST` arbitrary fake positions for any wallet/pool.
- `walletAddress` in `POST /api/positions` is **not** cryptographically proven to belong to
  the caller (no signed message / SIWS challenge in this scope) — the on-chain check proves
  the *transaction* happened and *which* wallet's signature appears on it is visible on-chain,
  but the endpoint itself trusts the client-supplied `walletAddress` string rather than
  re-deriving it from the transaction's signers. Documented here as an accepted gap for this
  devnet-only, no-real-value MVP scope, not silently glossed over — a hardening pass (deriving
  `walletAddress` server-side from the confirmed transaction's fee payer / signer list
  instead of trusting the request body) is natural follow-up work before any mainnet
  consideration.
- CORS stays `origin: true` (unchanged, same rationale as the auth module — no cookie-based
  session here either).
- `SOLANA_RPC_URL` has no secret material in it for the default public devnet endpoint; if
  the user later switches to a provider requiring an API key in the URL, that value becomes
  backend-only exactly like `SUPABASE_SECRET_KEY` (never exposed via `VITE_`-prefixed vars
  unless the provider's key is explicitly meant to be public).

## Out of scope (this spec)

- **Mainnet** — everything here targets devnet; switching clusters is an explicit later
  decision, not a side effect of this work.
- **Remove liquidity / claim fees / close position** — this spec only covers *adding*
  liquidity; managing an existing position is separate follow-up work.
- **Proving wallet ownership server-side** (Sign-In-With-Solana / signed-message challenge)
  — see Security notes; accepted gap for this MVP.
- **Priority fees / Jito bundles / compute budget tuning** — the simplest correct
  transaction is built; fee/landing-rate optimization is a later concern once this works at
  all on devnet.
- **Multi-wallet support beyond Phantom + Solflare** — per the prompt's explicit scope.
- **Historical position P&L / IL tracking for real positions** — `positions` only stores
  enough to prove "this wallet added liquidity to this pool at this tx"; joining that against
  `pool_snapshots` for real P&L is a distinct, later feature.
