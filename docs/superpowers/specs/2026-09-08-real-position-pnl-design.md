# Real Position P&L — Design

## Context

`backend/src/routes/positions.ts` already calls `DLMM.getAllLbPairPositionsByUser(connection,
userPubkey)` but discards everything except `poolAddress`/`positionAddress`.
`frontend/src/pages/MyPositionsPage.tsx` renders that bare list with a Solscan link — no value,
no fees, no P&L. Meanwhile `components/IlCalculator.tsx` + `lib/yield.ts` + `lib/il.ts` already
implement fee-earned / impermanent-loss / net-yield math, but only in "hypothetical" mode against
historical pool-level snapshots (`pool_snapshots`/Meteora OHLCV via `services/meteora.ts`) — never
against a real wallet position.

This spec wires real position data through: showing live bin range/value/fees for free, and real
IL/net-yield by deriving each position's entry price from its own on-chain transaction history.

Per `docs/superpowers/specs/2026-08-08-wallet-liquidity-design.md`'s post-implementation note, the
`positions` Supabase table was already tried and removed — on-chain state via
`getAllLbPairPositionsByUser` is the source of truth for "what positions exist," and that spec
explicitly called out "historical position P&L / IL tracking for real positions" as later work.
This is that later work.

## Investigation findings (binding on the design below)

Traced `@meteora-ag/dlmm@1.9.14`'s CJS build (`node_modules/@meteora-ag/dlmm/dist/index.js`) —
its `.d.ts` is broken (per the existing comment in `backend/src/lib/dlmmSdk.ts`), so the hand-
written types there currently expose far less than the SDK actually returns.

- `DLMM.getAllLbPairPositionsByUser` returns `Map<poolAddress, PositionInfo>` where `PositionInfo`
  includes `lbPair` (full pool state: `activeId`, `binStep`, ...), `tokenX`/`tokenY` (each with
  `mint.decimals`), and `lbPairPositionsData: [{ publicKey, version, positionData }]`.
- `positionData` (built by the SDK's internal `DLMM.processPosition`, the same function backing
  both the bulk call and the per-pool `getPositionsByUserAndLbPair`) contains: `lowerBinId`,
  `upperBinId` (bin range), `totalXAmount`/`totalYAmount` (current liquidity, decimal-string raw
  units), `feeX`/`feeY` (unclaimed accrued fees, BN), `totalClaimedFeeXAmount`/
  `totalClaimedFeeYAmount` (lifetime claimed), `positionBinData` (per-bin breakdown), `owner`,
  `lastUpdatedAt`.
- **The bulk call is therefore sufficient for bin range / active bin / current value / fees
  earned — no need for the separate per-pool `getPositionsByUserAndLbPair` call, and no extra RPC
  cost beyond what the route already pays.**
- **Gap: no cost basis anywhere on-chain.** DLMM position accounts store current liquidity shares
  and unclaimed fees, not "deposited $X at price $Y." `calculateRangeIL` (il.ts) needs `entryPrice`
  and `calculateNetYield` (yield.ts) needs `entryDate`/`depositUsd` — neither exists for a real
  position without separately deriving it from the position's own transaction history.
- The package exports its Anchor `IDL` and `LBCLMM_PROGRAM_IDS` (`exports.IDL = idl_default`,
  `exports.LBCLMM_PROGRAM_IDS = ...`, both reachable through the existing `loadDlmmSdk()`
  `require()`), and pure price helpers including `getPriceOfBinByBinId(binId, binStep)` — usable
  directly instead of reimplementing bin→price math.

## Goal

`GET /api/positions` shows real bin range, active bin, current value, and fees earned for every
position a connected wallet holds, with zero extra RPC cost over today. A second, on-demand
endpoint derives real entry price/IL/net-yield per position by reading that position's own
deposit transaction, reusing (not duplicating) the math already in `il.ts`/`yield.ts`.

## Non-negotiable constraints

- **Devnet only**, matching `SOLANA_RPC_URL` scope from the wallet-liquidity feature — no new
  cluster decision made here.
- **No positions cache table.** On-chain state (`getAllLbPairPositionsByUser`) stays the only
  source of truth for "what positions exist and what are they worth right now." The new
  `position_cost_basis` table (below) is a different kind of data — an immutable historical fact
  once derived, not a mirror of live state — and does not reopen that decision.
- **No new USD price oracle.** This codebase has no general "USD price for an arbitrary SPL mint"
  capability (CoinGecko here only covers a handful of named assets for the gold/crypto signal
  page). Building one is separate, larger scope. All new values are expressed either as raw
  decimals-adjusted token amounts, or in quote-token-equivalent terms using the pool's own price —
  never USD.

## Data source / infrastructure

- **Solana RPC** (existing `SOLANA_RPC_URL` / `createConnection`) — one additional read path:
  `connection.getSignaturesForAddress(positionPubkey, { limit: 1000 })` and
  `connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 })`, used only by the
  new on-demand cost-basis endpoint, never by the list endpoint.
- **`@meteora-ag/dlmm`** — `getPriceOfBinByBinId` for bin→price conversion; the bundled `IDL` +
  Anchor's `BorshInstructionCoder` for decoding the position's deposit instruction; `LBCLMM_PROGRAM_IDS`
  to identify DLMM-program instructions inside an arbitrary transaction.
- **`services/meteora.ts`** — `getPoolHistory(address, days)` already returns daily OHLCV `close`
  price in exactly the units `il.ts` expects (not USD); reused as the entry-price source instead of
  inventing a new historical-price mechanism.
- **Supabase** — one new table, `position_cost_basis`, written only by the backend service-role
  client, following the same access pattern as `pool_tvl_daily`.

## Architecture

Two endpoints, split by cost:

1. **`GET /api/positions` (extended, same route)** — per position, adds: `lowerBinId`,
   `upperBinId`, `activeBinId`, `currentPrice` (quote-per-base, from `getPriceOfBinByBinId(activeId,
   binStep)` — free), `liquidity: { xAmount, yAmount, valueInQuote }`, `fees: { xAmount, yAmount,
   valueInQuote }` (`valueInQuote = xAmount * currentPrice + yAmount`, decimals-adjusted using
   `tokenX.mint.decimals`/`tokenY.mint.decimals` — all free from the existing bulk call, zero extra
   RPC).
2. **`GET /api/positions/:positionAddress/cost-basis?pool=<poolAddress>`  (new)** — derives and
   returns `{ entryDate, entryPrice, depositXAmount, depositYAmount }`, or `{ available: false }`
   if it can't be resolved (see Error handling). Called lazily per position from the frontend, not
   as part of the list.

## Deriving entry price (new subsystem)

For a given position address:

1. `getSignaturesForAddress(positionPubkey, { limit: 1000 })`, take the **oldest** signature in
   that page (last element — results come back newest-first). If the page is exactly 1000 (i.e.
   possibly more history beyond it), treat cost-basis as unresolvable rather than paginating
   further back — real positions have very few transactions, so this bound is generous, not a
   real limitation in practice, and an unbounded backward walk is exactly the kind of cost this
   route's existing rate limit exists to prevent.
2. Fetch that transaction (`getTransaction`, parsed, `maxSupportedTransactionVersion: 0`).
3. Decode every instruction in it that targets the DLMM program ID (`LBCLMM_PROGRAM_IDS.devnet`)
   using `new BorshInstructionCoder(IDL).decode(data)`. Find the one whose decoded name is a
   deposit-type instruction (`AddLiquidity*` / `InitializePositionAndAddLiquidity*` family —
   exact name(s) confirmed empirically against a real devnet tx during implementation) and read
   `totalXAmount`/`totalYAmount` straight from its decoded args.
   - **Why decode instruction args instead of diffing token balances**: a native-SOL-side deposit
     often uses a temporary wrapped-SOL account created and closed within the same transaction,
     which can be invisible to a `preTokenBalances`/`postTokenBalances` diff. Reading the
     instruction's own encoded amounts sidesteps that edge case entirely and is exact, not
     inferred.
4. `entryDate` = that transaction's `blockTime`, floored to its UTC day.
5. `entryPrice` = `services/meteora.ts`'s `getPoolHistory(poolAddress, daysSinceEntry)`, matched to
   `entryDate`'s day, using its `currentPrice`. If the OHLCV window doesn't reach back that far,
   cost-basis is unresolvable (see Error handling).
6. Persist `{ positionAddress, poolAddress, entryDate, entryPrice, depositXAmount, depositYAmount,
   txSignature }` to `position_cost_basis` before returning it.

**v1 scope note**: uses only the position's first/creation deposit. If liquidity was added again
later, cost basis reflects only the initial deposit — the response is still returned (not
withheld), but the frontend labels it "based on initial deposit" rather than presenting it as
exact. Weighted-average cost basis across multiple deposits is explicitly out of scope for this
pass.

## Data model — `position_cost_basis` (`db/schema.sql`)

```sql
CREATE TABLE position_cost_basis (
  position_address  TEXT PRIMARY KEY,
  pool_address       TEXT NOT NULL,
  entry_date         DATE NOT NULL,
  entry_price        NUMERIC NOT NULL,
  deposit_x_amount   NUMERIC NOT NULL,
  deposit_y_amount   NUMERIC NOT NULL,
  tx_signature       TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE position_cost_basis ENABLE ROW LEVEL SECURITY;
```

RLS enabled with no policies — same defensive pattern as `pool_tvl_daily`: deny-all for
`anon`/`authenticated`, service-role bypasses. Written/read exclusively through the backend.

## Math reuse

- **`calculateRangeIL` (il.ts) — reused unchanged.** `entryPrice`, `currentPrice`, `lowerPrice`,
  `upperPrice` all come from the SDK's own `getPriceOfBinByBinId`, so units already match what
  `il.ts` expects; no adapter needed beyond computing those four numbers.
- **`calculateNetYield` (yield.ts) — not reused as-is.** It simulates day-by-day fee accrual from
  pool-level snapshots (`depositUsd / day.tvlUsd * day.fees24hUsd`), which is the wrong model once
  real, exact `feeX`/`feeY` are available. Extract the small shared tail of that function into a
  new pure helper:

  ```ts
  // yield.ts
  export function netYieldFromFees({ feesEarned, depositValue, impermanentLossPct }: {
    feesEarned: number;
    depositValue: number;
    impermanentLossPct: number;
  }): { netYield: number; netYieldPct: number }
  ```

  Unit-agnostic by design: the hypothetical calculator keeps calling it with USD figures
  (`feesEarnedUsd`, `depositUsd`) exactly as `calculateNetYield` does today internally; the real-
  position path calls it with quote-token-equivalent figures (`feesEarnedQuote = feeXAmount *
  currentPrice + feeYAmount`, `depositValueQuote = depositXAmount * entryPrice + depositYAmount`).
  `calculateNetYield` is refactored to call this helper internally rather than duplicating the
  `feesEarnedUsd - impermanentLossUsd` line; its existing public signature/behavior is unchanged.

## Components

**Backend**
- `lib/dlmmSdk.ts` — extend `OnChainPositionInfo`/add types for `lbPair.activeId`, `lbPair.binStep`,
  `tokenX.mint.decimals`, `tokenY.mint.decimals`, and the `positionData` fields listed under
  Investigation findings. Still hand-written/asserted types, per this file's existing documented
  reasoning (the package's own `.d.ts` is broken).
- `routes/positions.ts` — `OnChainPosition` gains `lowerBinId`, `upperBinId`, `activeBinId`,
  `currentPrice`, `liquidity`, `fees` as described in Architecture. `defaultFetchPositions` reads
  them off the already-fetched `positionsByPool` map; no new RPC calls.
- `lib/costBasis.ts` (new) — `deriveCostBasis(connection, DLMM, { positionAddress, poolAddress })`
  implementing the steps above; pure function over injected `connection`/SDK, matching this
  project's existing DI-for-testing convention.
- `routes/positions.ts` (same file, new route) — `GET
  /api/positions/:positionAddress/cost-basis`, checks `position_cost_basis` first, calls
  `deriveCostBasis` + persists on a cache miss, `deps`-injectable exactly like `fetchPositions`.
- `db/schema.sql` — add `position_cost_basis` table per Data model above.

**Frontend**
- `lib/api/positions.ts` — extend `fetchPositions`'s return type; add
  `fetchPositionCostBasis(positionAddress, poolAddress)`.
- `types/liquidity.ts` — extend `Position` with the new list fields; add a `PositionCostBasis`
  type.
- `pages/MyPositionsPage.tsx` — render bin range/active bin/value/fees for every row immediately
  (from the extended list call, no extra request); a "Show P&L" action per row lazily fetches
  cost-basis and renders IL/net-yield using the existing `IlCalculator` result-display pieces
  (extracted/reused, not rebuilt) rather than a new component.

## Error handling

- `GET /api/positions`: unchanged (503 on RPC failure, as today).
- `GET /api/positions/:id/cost-basis`: cost-basis genuinely unresolvable (signature page maxed
  out, no deposit instruction found, or OHLCV doesn't reach back far enough) → `200 { available:
  false }`, not an error — this is an expected outcome for old/unusual positions, not a failure.
  RPC/SDK failure → 503 (`SolanaUnavailableError`, consistent with the rest of this route file).
  Invalid/missing `pool` query param or bad `positionAddress` → 400.
- Frontend: cost-basis `available: false` renders "P&L unavailable for this position" instead of
  IL/net-yield numbers; current value/fees (from the list call) always render regardless.

## Testing

- `routes/positions.test.ts` — extend existing cases for the new list fields; add cases for the
  new cost-basis route using injected `deps` (fake `deriveCostBasis`, fake Supabase client) —
  no real devnet calls, matching this file's existing pattern.
- `lib/costBasis.test.ts` (new) — unit-tests instruction decoding + entry-price derivation against
  a fixture transaction (recorded devnet tx from the existing wallet-liquidity feature's own test
  fixtures if available, otherwise a hand-built fixture matching the IDL's encoding).
- `lib/il.test.ts` — unchanged (no behavior change to `calculateRangeIL`).
- `lib/yield.test.ts` — add cases for the new `netYieldFromFees` helper; existing
  `calculateNetYield` cases must still pass unchanged after the internal refactor.

## Out of scope (this spec)

- **USD conversion** for any of these values — no price oracle for arbitrary SPL mints exists;
  follow-up work if wanted later.
- **Weighted-average cost basis** across multiple deposits into the same position — v1 uses the
  first deposit only, labeled as approximate when later deposits exist.
- **Rebalance alerts (Task 3)** and **Whop billing gating (Task 4)** — separate, later specs per
  the original task breakdown; this spec only covers real position P&L.
