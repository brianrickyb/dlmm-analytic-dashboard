# Real Position P&L Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real bin range / active bin / current value / fees earned for every wallet position (free, no extra RPC), plus real entry-price-derived IL and net yield on demand, without a USD price oracle and without reintroducing a positions cache table.

**Architecture:** `GET /api/positions` is extended to compute free position stats (bin range, value, fees, all decimals-adjusted token amounts) directly from the SDK's existing bulk call. A new `GET /api/positions/:positionAddress/cost-basis` endpoint derives entry price by decoding the position's own on-chain deposit instruction (via Anchor's `BorshInstructionCoder` and the SDK's bundled IDL) and caches the immutable result in a new `position_cost_basis` table. The frontend reuses `il.ts`'s `calculateRangeIL` unchanged and a new `netYieldFromFees` helper extracted from `yield.ts`.

**Tech Stack:** Fastify + TypeScript (backend), React + Vite + TypeScript (frontend), `@meteora-ag/dlmm`, `@coral-xyz/anchor` (new), `@solana/web3.js`, Supabase (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-real-position-pnl-design.md`

## Global Constraints

- Devnet only — no cluster-selection logic is added; `SOLANA_RPC_URL` stays the only config knob, per the wallet-liquidity spec's existing constraint.
- No new USD price oracle. All values are raw decimals-adjusted token amounts or quote-token-equivalent (`valueInQuote`), never USD.
- No positions cache table for "what positions exist" — on-chain (`getAllLbPairPositionsByUser`) stays the source of truth. `position_cost_basis` is allowed as an exception because it stores an immutable derived historical fact, not live position state.
- Cost basis uses only the position's first/creation deposit (no weighted-average across multiple deposits).
- `position_cost_basis` gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with no policies, matching `pool_tvl_daily`'s deny-all-by-default pattern — table is written/read only via the backend's service-role client.

---

### Task 1: Free position stats — `positionMath.ts` + extended `GET /api/positions`

**Files:**
- Create: `backend/src/lib/positionMath.ts`
- Test: `backend/src/lib/positionMath.test.ts`
- Modify: `backend/src/lib/dlmmSdk.ts` (widen `OnChainPositionInfo`/`OnChainLbPosition`, add `OnChainPositionData`/`OnChainTokenInfo`/`OnChainLbPair`)
- Modify: `backend/src/routes/positions.ts` (extend `OnChainPosition`, wire `computePositionSummary` into `defaultFetchPositions`)
- Modify: `backend/src/routes/positions.test.ts` (extend fixtures with new fields)

**Interfaces:**
- Produces (used by Task 5, and by frontend Task 6 as the shape of `Position`):
  ```ts
  export function getPricePerToken(binId: number, binStep: number, decimalsX: number, decimalsY: number): number;

  export interface PositionAmounts {
    xAmount: number;
    yAmount: number;
    valueInQuote: number;
  }

  export interface PositionSummary {
    lowerBinId: number;
    upperBinId: number;
    activeBinId: number;
    currentPrice: number;
    lowerPrice: number;
    upperPrice: number;
    liquidity: PositionAmounts;
    fees: PositionAmounts;
  }

  export function computePositionSummary(input: {
    lowerBinId: number;
    upperBinId: number;
    activeId: number;
    binStep: number;
    decimalsX: number;
    decimalsY: number;
    totalXAmount: string;
    totalYAmount: string;
    feeX: string;
    feeY: string;
  }): PositionSummary;
  ```

- [ ] **Step 1: Write the failing test for `getPricePerToken` and `computePositionSummary`**

```ts
// backend/src/lib/positionMath.test.ts
import { describe, expect, it } from 'vitest';
import { computePositionSummary, getPricePerToken } from './positionMath.js';

describe('getPricePerToken', () => {
  it('is 1 at bin 0 when both tokens have equal decimals', () => {
    expect(getPricePerToken(0, 10, 6, 6)).toBeCloseTo(1, 10);
  });

  it('adjusts for a decimals difference between token X and token Y', () => {
    // binStep 10 (0.10%), binId 0 -> raw price 1; decimalsX=9 (SOL), decimalsY=6 (USDC)
    // -> pricePerToken = 1 * 10^(9-6) = 1000
    expect(getPricePerToken(0, 10, 9, 6)).toBeCloseTo(1000, 6);
  });

  it('compounds binStep by binId, matching (1 + binStep/10000)^binId', () => {
    const price = getPricePerToken(100, 10, 6, 6);
    expect(price).toBeCloseTo(Math.pow(1.001, 100), 10);
  });
});

describe('computePositionSummary', () => {
  it('computes decimals-adjusted liquidity, fees, and prices for an in-range position', () => {
    const summary = computePositionSummary({
      lowerBinId: -100,
      upperBinId: 100,
      activeId: 0,
      binStep: 10,
      decimalsX: 9,
      decimalsY: 6,
      totalXAmount: String(5 * 10 ** 9), // 5 tokens of X
      totalYAmount: String(500 * 10 ** 6), // 500 tokens of Y
      feeX: String(0.01 * 10 ** 9),
      feeY: String(1 * 10 ** 6),
    });

    expect(summary.lowerBinId).toBe(-100);
    expect(summary.upperBinId).toBe(100);
    expect(summary.activeBinId).toBe(0);
    expect(summary.currentPrice).toBeCloseTo(1000, 6); // bin 0, decimals 9 vs 6
    expect(summary.liquidity.xAmount).toBeCloseTo(5, 10);
    expect(summary.liquidity.yAmount).toBeCloseTo(500, 10);
    // valueInQuote = xAmount * currentPrice + yAmount = 5*1000 + 500 = 5500
    expect(summary.liquidity.valueInQuote).toBeCloseTo(5500, 6);
    expect(summary.fees.xAmount).toBeCloseTo(0.01, 10);
    expect(summary.fees.yAmount).toBeCloseTo(1, 10);
    // feesValueInQuote = 0.01*1000 + 1 = 11
    expect(summary.fees.valueInQuote).toBeCloseTo(11, 6);
  });

  it('computes lowerPrice/upperPrice from the bin range, independent of the active bin', () => {
    const summary = computePositionSummary({
      lowerBinId: 50,
      upperBinId: 150,
      activeId: 100,
      binStep: 10,
      decimalsX: 6,
      decimalsY: 6,
      totalXAmount: '0',
      totalYAmount: '0',
      feeX: '0',
      feeY: '0',
    });

    expect(summary.lowerPrice).toBeCloseTo(Math.pow(1.001, 50), 10);
    expect(summary.upperPrice).toBeCloseTo(Math.pow(1.001, 150), 10);
    expect(summary.currentPrice).toBeCloseTo(Math.pow(1.001, 100), 10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/lib/positionMath.test.ts`
Expected: FAIL — `Cannot find module './positionMath.js'`

- [ ] **Step 3: Implement `positionMath.ts`**

```ts
// backend/src/lib/positionMath.ts
export function getPricePerToken(binId: number, binStep: number, decimalsX: number, decimalsY: number): number {
  const rawPrice = Math.pow(1 + binStep / 10_000, binId);
  return rawPrice * Math.pow(10, decimalsX - decimalsY);
}

export interface PositionAmounts {
  xAmount: number;
  yAmount: number;
  valueInQuote: number;
}

export interface PositionSummary {
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: PositionAmounts;
  fees: PositionAmounts;
}

export interface ComputePositionSummaryInput {
  lowerBinId: number;
  upperBinId: number;
  activeId: number;
  binStep: number;
  decimalsX: number;
  decimalsY: number;
  totalXAmount: string;
  totalYAmount: string;
  feeX: string;
  feeY: string;
}

function toAmounts(rawX: string, rawY: string, decimalsX: number, decimalsY: number, currentPrice: number): PositionAmounts {
  const xAmount = Number(rawX) / 10 ** decimalsX;
  const yAmount = Number(rawY) / 10 ** decimalsY;
  return { xAmount, yAmount, valueInQuote: xAmount * currentPrice + yAmount };
}

export function computePositionSummary(input: ComputePositionSummaryInput): PositionSummary {
  const currentPrice = getPricePerToken(input.activeId, input.binStep, input.decimalsX, input.decimalsY);
  const lowerPrice = getPricePerToken(input.lowerBinId, input.binStep, input.decimalsX, input.decimalsY);
  const upperPrice = getPricePerToken(input.upperBinId, input.binStep, input.decimalsX, input.decimalsY);

  return {
    lowerBinId: input.lowerBinId,
    upperBinId: input.upperBinId,
    activeBinId: input.activeId,
    currentPrice,
    lowerPrice,
    upperPrice,
    liquidity: toAmounts(input.totalXAmount, input.totalYAmount, input.decimalsX, input.decimalsY, currentPrice),
    fees: toAmounts(input.feeX, input.feeY, input.decimalsX, input.decimalsY, currentPrice),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/lib/positionMath.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Widen `dlmmSdk.ts` types to expose the full position shape**

Read `backend/src/lib/dlmmSdk.ts` first (current `OnChainLbPosition`/`OnChainPositionInfo` at lines 40-51 only expose `publicKey`). Replace:

```ts
export interface OnChainLbPosition {
  publicKey: PublicKey;
}

export interface OnChainPositionInfo {
  lbPairPositionsData: OnChainLbPosition[];
}
```

with:

```ts
export interface OnChainPositionData {
  lowerBinId: number;
  upperBinId: number;
  totalXAmount: string;
  totalYAmount: string;
  feeX: BN;
  feeY: BN;
}

export interface OnChainLbPosition {
  publicKey: PublicKey;
  positionData: OnChainPositionData;
}

export interface OnChainTokenInfo {
  mint: { decimals: number };
}

export interface OnChainLbPair {
  activeId: number;
  binStep: number;
}

export interface OnChainPositionInfo {
  lbPair: OnChainLbPair;
  tokenX: OnChainTokenInfo;
  tokenY: OnChainTokenInfo;
  lbPairPositionsData: OnChainLbPosition[];
}
```

This only widens hand-written types asserted against the SDK (per this file's existing documented reasoning) — no behavior change yet.

- [ ] **Step 6: Wire `computePositionSummary` into `positions.ts`**

Read `backend/src/routes/positions.ts` first. Replace the `OnChainPosition` interface and the position-mapping loop:

```ts
export interface OnChainPosition {
  poolAddress: string;
  positionAddress: string;
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: { xAmount: number; yAmount: number; valueInQuote: number };
  fees: { xAmount: number; yAmount: number; valueInQuote: number };
}
```

and in `defaultFetchPositions`, replace:

```ts
  const result: OnChainPosition[] = [];
  for (const [poolAddress, info] of positionsByPool) {
    for (const position of info.lbPairPositionsData) {
      result.push({ poolAddress, positionAddress: position.publicKey.toBase58() });
    }
  }
  return result;
```

with:

```ts
  const result: OnChainPosition[] = [];
  for (const [poolAddress, info] of positionsByPool) {
    const decimalsX = info.tokenX.mint.decimals;
    const decimalsY = info.tokenY.mint.decimals;
    for (const position of info.lbPairPositionsData) {
      const summary = computePositionSummary({
        lowerBinId: position.positionData.lowerBinId,
        upperBinId: position.positionData.upperBinId,
        activeId: info.lbPair.activeId,
        binStep: info.lbPair.binStep,
        decimalsX,
        decimalsY,
        totalXAmount: position.positionData.totalXAmount,
        totalYAmount: position.positionData.totalYAmount,
        feeX: position.positionData.feeX.toString(),
        feeY: position.positionData.feeY.toString(),
      });
      result.push({ poolAddress, positionAddress: position.publicKey.toBase58(), ...summary });
    }
  }
  return result;
```

Add the import at the top: `import { computePositionSummary } from '../lib/positionMath.js';`

- [ ] **Step 7: Update `positions.test.ts` fixtures with the new fields**

Read `backend/src/routes/positions.test.ts` first. Replace the `positions` fixture array in the first test:

```ts
    const positions: OnChainPosition[] = [
      {
        poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
        positionAddress: '95Er1xjjbQkYwgtqAe5s3kYaH4WooferaWVXkd3Apnbz',
        lowerBinId: -100,
        upperBinId: 100,
        activeBinId: 0,
        currentPrice: 1000,
        lowerPrice: 900,
        upperPrice: 1100,
        liquidity: { xAmount: 5, yAmount: 500, valueInQuote: 5500 },
        fees: { xAmount: 0.01, yAmount: 1, valueInQuote: 11 },
      },
    ];
```

(the `expect(response.json()).toEqual({ positions })` assertion already round-trips whatever shape `positions` has, so no other test code changes).

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS, no regressions

- [ ] **Step 9: Commit**

```bash
git add backend/src/lib/positionMath.ts backend/src/lib/positionMath.test.ts backend/src/lib/dlmmSdk.ts backend/src/routes/positions.ts backend/src/routes/positions.test.ts
git commit -m "feat(backend): compute free position stats (bin range, value, fees) in GET /api/positions"
```

---

### Task 2: Extract `netYieldFromFees` in `yield.ts`

**Files:**
- Modify: `frontend/src/lib/yield.ts`
- Modify: `frontend/src/lib/yield.test.ts`

**Interfaces:**
- Produces (used by frontend Task 6):
  ```ts
  export function netYieldFromFees(input: {
    feesEarned: number;
    depositValue: number;
    impermanentLossPct: number;
  }): { impermanentLossValue: number; netYield: number; netYieldPct: number };
  ```

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/lib/yield.test.ts`:

```ts
import { calculateNetYield, netYieldFromFees } from './yield';

describe('netYieldFromFees — unit-agnostic fee/IL combination', () => {
  it('matches the hand-derived example from calculateNetYield (fees=45, deposit=10000, IL=-1.819%)', () => {
    const result = netYieldFromFees({ feesEarned: 45, depositValue: 10_000, impermanentLossPct: -1.819 });

    expect(result.impermanentLossValue).toBeCloseTo(181.9, 1);
    expect(result.netYield).toBeCloseTo(45 - 181.9, 1);
    expect(result.netYieldPct).toBeCloseTo(((45 - 181.9) / 10_000) * 100, 3);
  });

  it('returns zero impermanent loss and netYield === feesEarned when impermanentLossPct is 0', () => {
    const result = netYieldFromFees({ feesEarned: 100, depositValue: 1_000, impermanentLossPct: 0 });

    expect(result.impermanentLossValue).toBe(0);
    expect(result.netYield).toBe(100);
    expect(result.netYieldPct).toBeCloseTo(10, 10);
  });

  it('is unit-agnostic: works identically for quote-token amounts as for USD amounts', () => {
    const usd = netYieldFromFees({ feesEarned: 20, depositValue: 500, impermanentLossPct: -4 });
    const quoteToken = netYieldFromFees({ feesEarned: 20, depositValue: 500, impermanentLossPct: -4 });
    expect(quoteToken).toEqual(usd);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/yield.test.ts`
Expected: FAIL — `netYieldFromFees is not exported`

- [ ] **Step 3: Implement `netYieldFromFees` and refactor `calculateNetYield` to use it**

Read `frontend/src/lib/yield.ts` first. Add the new export, and replace the tail of `calculateNetYield`:

```ts
export interface NetYieldFromFeesInput {
  feesEarned: number;
  depositValue: number;
  impermanentLossPct: number;
}

export interface NetYieldFromFeesResult {
  impermanentLossValue: number;
  netYield: number;
  netYieldPct: number;
}

export function netYieldFromFees({ feesEarned, depositValue, impermanentLossPct }: NetYieldFromFeesInput): NetYieldFromFeesResult {
  const impermanentLossValue = (depositValue * -impermanentLossPct) / 100;
  const netYield = feesEarned - impermanentLossValue;
  return { impermanentLossValue, netYield, netYieldPct: (netYield / depositValue) * 100 };
}
```

Replace, inside `calculateNetYield`:

```ts
  const impermanentLossUsd = (depositUsd * -il.impermanentLossPct) / 100;
  const netYieldUsd = feesEarnedUsd - impermanentLossUsd;

  return {
    daysHeld: heldSnapshots.length,
    daysInRange,
    feesEarnedUsd,
    impermanentLossPct: il.impermanentLossPct,
    impermanentLossUsd,
    netYieldUsd,
    netYieldPct: (netYieldUsd / depositUsd) * 100,
  };
```

with:

```ts
  const { impermanentLossValue: impermanentLossUsd, netYield: netYieldUsd, netYieldPct } = netYieldFromFees({
    feesEarned: feesEarnedUsd,
    depositValue: depositUsd,
    impermanentLossPct: il.impermanentLossPct,
  });

  return {
    daysHeld: heldSnapshots.length,
    daysInRange,
    feesEarnedUsd,
    impermanentLossPct: il.impermanentLossPct,
    impermanentLossUsd,
    netYieldUsd,
    netYieldPct,
  };
```

- [ ] **Step 4: Run the full yield test file to verify everything passes, including pre-existing tests**

Run: `cd frontend && npx vitest run src/lib/yield.test.ts`
Expected: PASS — all pre-existing `calculateNetYield` tests still pass unchanged (this is a pure refactor), plus the 3 new `netYieldFromFees` tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/yield.ts frontend/src/lib/yield.test.ts
git commit -m "refactor(frontend): extract unit-agnostic netYieldFromFees helper from calculateNetYield"
```

---

### Task 3: Decode a position's deposit instruction — `depositInstruction.ts`

**Files:**
- Modify: `backend/package.json` (add `@coral-xyz/anchor` dependency, `bs58` devDependency)
- Modify: `backend/src/lib/dlmmSdk.ts` (expose `IDL` and `LBCLMM_PROGRAM_IDS` on `DlmmStatic`)
- Create: `backend/src/lib/depositInstruction.ts`
- Test: `backend/src/lib/depositInstruction.test.ts`

**Interfaces:**
- Produces (used by Task 4):
  ```ts
  export interface DepositInstructionAmounts {
    amountX: string;   // raw base-unit integer string
    amountY: string;   // raw base-unit integer string
    activeId: number | null; // null for the legacy add_liquidity/add_liquidity2 variant, which doesn't carry it
  }

  export interface DepositMessage {
    instructions: { programIdIndex: number; accounts: number[]; data: string }[];
    accountKeys: PublicKey[];
  }

  export function parseDepositFromMessage(
    message: DepositMessage,
    options: { idl: unknown; programId: string; positionAddress: string },
  ): DepositInstructionAmounts | null;
  ```

Empirically confirmed against the installed `@meteora-ag/dlmm@1.9.14`'s bundled IDL (`node -e` probe, not guessed): `BorshInstructionCoder.decode()` returns field names in exact snake_case matching the IDL (`liquidity_parameter`, `amount_x`, `amount_y`, `active_id`), `amount_x`/`amount_y` decode as real `BN` instances, `active_id` decodes as a plain number (or is simply absent — `undefined` — on variants that don't have it, e.g. the plain `add_liquidity`/`add_liquidity2`), and `decoded.name` is the exact snake_case instruction name (e.g. `'add_liquidity_by_strategy2'`).

- [ ] **Step 1: Add dependencies**

Edit `backend/package.json`: add to `"dependencies"`: `"@coral-xyz/anchor": "^0.31.0",` (already present transitively via `@meteora-ag/dlmm`, pinned here because this file now imports it directly). Add to `"devDependencies"`: `"bs58": "^4.0.1",` (test-only, to build a base58-encoded fixture instruction — production code only ever passes through base58 strings it already received from the RPC, never encodes them).

Run: `cd backend && npm install`
Expected: lockfile updates, no new packages actually downloaded (both already present transitively).

- [ ] **Step 2: Expose `IDL` and `LBCLMM_PROGRAM_IDS` on `DlmmStatic`**

Read `backend/src/lib/dlmmSdk.ts` first. The same `require('@meteora-ag/dlmm')` object already carries these as named exports (verified: `exports.IDL = idl_default` and `exports.LBCLMM_PROGRAM_IDS = ...` are merged onto the same object `loadDlmmSdk()` returns) — this step only widens the type, no new require call. Add to the `DlmmStatic` interface:

```ts
interface DlmmStatic {
  create(connection: Connection, poolAddress: PublicKey): Promise<DlmmPool>;
  getAllLbPairPositionsByUser(connection: Connection, userPubKey: PublicKey): Promise<Map<string, OnChainPositionInfo>>;
  IDL: unknown;
  LBCLMM_PROGRAM_IDS: Record<string, string>;
}
```

- [ ] **Step 3: Write the failing test**

```ts
// backend/src/lib/depositInstruction.test.ts
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';
import { loadDlmmSdk } from './dlmmSdk.js';
import { parseDepositFromMessage } from './depositInstruction.js';

const DLMM = loadDlmmSdk();
const coder = new BorshInstructionCoder(DLMM.IDL as never);
const PROGRAM_ID = PublicKey.unique();
const POSITION = PublicKey.unique();

// add_liquidity_by_strategy2's IDL account order: position, lb_pair,
// bin_array_bitmap_extension, user_token_x, user_token_y, reserve_x, reserve_y,
// token_x_mint, token_y_mint, sender, token_x_program, token_y_program,
// event_authority, program (14 accounts, position first).
function buildMessage(ixName: string, ixData: Buffer, positionAtIndex1: boolean) {
  const filler = Array.from({ length: 13 }, () => PublicKey.unique());
  const accountKeys = [PROGRAM_ID, positionAtIndex1 ? POSITION : PublicKey.unique(), ...filler];
  return {
    instructions: [
      {
        programIdIndex: 0,
        accounts: Array.from({ length: 14 }, (_, i) => i + 1),
        data: bs58.encode(ixData),
      },
    ],
    accountKeys,
  };
}

describe('parseDepositFromMessage', () => {
  it('extracts amountX/amountY/activeId from an add_liquidity_by_strategy2 instruction targeting this position', () => {
    const data = coder.encode('add_liquidity_by_strategy2', {
      liquidity_parameter: {
        amount_x: new BN(123_456_789),
        amount_y: new BN(987_654_321),
        active_id: -55,
        max_active_bin_slippage: 5,
        strategy_parameters: {
          min_bin_id: -100,
          max_bin_id: 100,
          strategy_type: { SpotBalanced: {} },
          parameteres: new Array(64).fill(0),
        },
      },
      remaining_accounts_info: { slices: [] },
    });
    const message = buildMessage('add_liquidity_by_strategy2', data, true);

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toEqual({ amountX: '123456789', amountY: '987654321', activeId: -55 });
  });

  it('returns null when the instruction targets a different position', () => {
    const data = coder.encode('add_liquidity_by_strategy2', {
      liquidity_parameter: {
        amount_x: new BN(1),
        amount_y: new BN(1),
        active_id: 0,
        max_active_bin_slippage: 5,
        strategy_parameters: { min_bin_id: -1, max_bin_id: 1, strategy_type: { SpotBalanced: {} }, parameteres: new Array(64).fill(0) },
      },
      remaining_accounts_info: { slices: [] },
    });
    const message = buildMessage('add_liquidity_by_strategy2', data, false);

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });

  it('returns activeId: null for the legacy add_liquidity2 variant, which has no active_id field', () => {
    const data = coder.encode('add_liquidity2', {
      liquidity_parameter: { amount_x: new BN(10), amount_y: new BN(20), bin_liquidity_dist: [] },
      remaining_accounts_info: { slices: [] },
    });
    const message = buildMessage('add_liquidity2', data, true);

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toEqual({ amountX: '10', amountY: '20', activeId: null });
  });

  it('ignores instructions from a different program', () => {
    const message = {
      instructions: [{ programIdIndex: 0, accounts: [1], data: bs58.encode(Buffer.from([1, 2, 3])) }],
      accountKeys: [PublicKey.unique(), POSITION],
    };

    const result = parseDepositFromMessage(message, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(), // does not match accountKeys[0] above
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });

  it('returns null when no instruction in the message matches', () => {
    const result = parseDepositFromMessage({ instructions: [], accountKeys: [] }, {
      idl: DLMM.IDL,
      programId: PROGRAM_ID.toBase58(),
      positionAddress: POSITION.toBase58(),
    });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/lib/depositInstruction.test.ts`
Expected: FAIL — `Cannot find module './depositInstruction.js'`

- [ ] **Step 5: Implement `depositInstruction.ts`**

```ts
// backend/src/lib/depositInstruction.ts
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';

const DEPOSIT_INSTRUCTION_NAMES = new Set([
  'add_liquidity',
  'add_liquidity2',
  'add_liquidity_by_strategy',
  'add_liquidity_by_strategy2',
  'add_liquidity_by_strategy_one_side',
  'add_liquidity_by_weight',
  'add_liquidity_by_weight2',
  'add_liquidity_one_side',
  'add_liquidity_one_side_precise',
  'add_liquidity_one_side_precise2',
]);

export interface DepositInstructionAmounts {
  amountX: string;
  amountY: string;
  activeId: number | null;
}

export interface DepositMessage {
  instructions: { programIdIndex: number; accounts: number[]; data: string }[];
  accountKeys: PublicKey[];
}

interface IdlInstructionDef {
  name: string;
  accounts: { name: string }[];
}

interface DlmmIdl {
  instructions: IdlInstructionDef[];
}

interface LiquidityParameter {
  amount_x: { toString(): string };
  amount_y: { toString(): string };
  active_id?: number;
}

export function parseDepositFromMessage(
  message: DepositMessage,
  options: { idl: unknown; programId: string; positionAddress: string },
): DepositInstructionAmounts | null {
  const idl = options.idl as DlmmIdl;
  const coder = new BorshInstructionCoder(options.idl as never);

  for (const ix of message.instructions) {
    const programId = message.accountKeys[ix.programIdIndex];
    if (!programId || programId.toBase58() !== options.programId) continue;

    const decoded = coder.decode(ix.data, 'base58');
    if (!decoded || !DEPOSIT_INSTRUCTION_NAMES.has(decoded.name)) continue;

    const idlIx = idl.instructions.find((i) => i.name === decoded.name);
    if (!idlIx) continue;
    const positionIndex = idlIx.accounts.findIndex((a) => a.name === 'position');
    if (positionIndex === -1) continue;

    const positionAccountKey = message.accountKeys[ix.accounts[positionIndex]];
    if (!positionAccountKey || positionAccountKey.toBase58() !== options.positionAddress) continue;

    const data = decoded.data as Record<string, unknown>;
    const params = data.liquidity_parameter as LiquidityParameter | undefined;
    if (!params || params.amount_x === undefined || params.amount_y === undefined) continue;

    return {
      amountX: params.amount_x.toString(),
      amountY: params.amount_y.toString(),
      activeId: typeof params.active_id === 'number' ? params.active_id : null,
    };
  }

  return null;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/lib/depositInstruction.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/dlmmSdk.ts backend/src/lib/depositInstruction.ts backend/src/lib/depositInstruction.test.ts
git commit -m "feat(backend): decode a position's on-chain deposit instruction via Anchor's BorshInstructionCoder"
```

---

### Task 4: Derive entry price from transaction history — `costBasis.ts`

**Files:**
- Create: `backend/src/lib/costBasis.ts`
- Test: `backend/src/lib/costBasis.test.ts`

**Interfaces:**
- Consumes: `parseDepositFromMessage` (Task 3), `getPricePerToken` (Task 1, `positionMath.ts`)
- Produces (used by Task 5):
  ```ts
  export interface CostBasisResult {
    entryDate: string;       // YYYY-MM-DD
    entryPrice: number;      // quote-per-base, decimals-adjusted
    depositXAmount: number;  // human units
    depositYAmount: number;
    txSignature: string;
  }

  export interface CostBasisConnection {
    getSignaturesForAddress(address: PublicKey, options: { limit: number }): Promise<{ signature: string }[]>;
    getTransaction(signature: string, options: { maxSupportedTransactionVersion: number }): Promise<{
      blockTime: number | null;
      transaction: { message: DepositMessage };
    } | null>;
  }

  export interface DeriveCostBasisDeps {
    connection: CostBasisConnection;
    getPoolHistory: (poolAddress: string, days: number) => Promise<{ snapshotAt: string; currentPrice: number }[]>;
    now?: () => number;
  }

  export async function deriveCostBasis(
    deps: DeriveCostBasisDeps,
    input: {
      positionAddress: string;
      poolAddress: string;
      programId: string;
      idl: unknown;
      binStep: number;
      decimalsX: number;
      decimalsY: number;
    },
  ): Promise<CostBasisResult | null>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/lib/costBasis.test.ts
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { describe, expect, it, vi } from 'vitest';
import { loadDlmmSdk } from './dlmmSdk.js';
import { deriveCostBasis } from './costBasis.js';

const DLMM = loadDlmmSdk();
const coder = new BorshInstructionCoder(DLMM.IDL as never);
const PROGRAM_ID = PublicKey.unique();
const POSITION = PublicKey.unique();
const POOL = 'poolAddress111111111111111111111111111111';

function depositMessage(activeId: number | null) {
  const data = activeId === null
    ? coder.encode('add_liquidity2', {
        liquidity_parameter: { amount_x: new BN(5_000_000_000), amount_y: new BN(500_000_000), bin_liquidity_dist: [] },
        remaining_accounts_info: { slices: [] },
      })
    : coder.encode('add_liquidity_by_strategy2', {
        liquidity_parameter: {
          amount_x: new BN(5_000_000_000),
          amount_y: new BN(500_000_000),
          active_id: activeId,
          max_active_bin_slippage: 5,
          strategy_parameters: { min_bin_id: -100, max_bin_id: 100, strategy_type: { SpotBalanced: {} }, parameteres: new Array(64).fill(0) },
        },
        remaining_accounts_info: { slices: [] },
      });
  const filler = Array.from({ length: 13 }, () => PublicKey.unique());
  return {
    instructions: [{ programIdIndex: 0, accounts: Array.from({ length: 14 }, (_, i) => i + 1), data: bs58.encode(data) }],
    accountKeys: [PROGRAM_ID, POSITION, ...filler],
  };
}

const BASE_INPUT = {
  positionAddress: POSITION.toBase58(),
  poolAddress: POOL,
  programId: PROGRAM_ID.toBase58(),
  idl: DLMM.IDL,
  binStep: 10,
  decimalsX: 9,
  decimalsY: 6,
};

describe('deriveCostBasis', () => {
  it('derives entry price from the deposit instruction\'s own active_id, without calling getPoolHistory', async () => {
    const getPoolHistory = vi.fn();
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'newest' }, { signature: 'oldest' }]),
      getTransaction: vi.fn().mockImplementation(async (sig: string) => {
        if (sig !== 'oldest') return null;
        return { blockTime: Date.parse('2026-06-01T00:00:00Z') / 1000, transaction: { message: depositMessage(0) } };
      }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory }, BASE_INPUT);

    expect(result).not.toBeNull();
    expect(result!.entryDate).toBe('2026-06-01');
    expect(result!.entryPrice).toBeCloseTo(1000, 6); // bin 0, decimalsX=9, decimalsY=6
    expect(result!.depositXAmount).toBeCloseTo(5, 10); // 5_000_000_000 / 1e9
    expect(result!.depositYAmount).toBeCloseTo(500, 10); // 500_000_000 / 1e6
    expect(result!.txSignature).toBe('oldest');
    expect(getPoolHistory).not.toHaveBeenCalled();
  });

  it('falls back to getPoolHistory when the deposit instruction has no active_id (legacy variant)', async () => {
    const getPoolHistory = vi.fn().mockResolvedValue([
      { snapshotAt: '2026-05-31T00:00:00.000Z', currentPrice: 950 },
      { snapshotAt: '2026-06-01T00:00:00.000Z', currentPrice: 970 },
    ]);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'oldest' }]),
      getTransaction: vi.fn().mockResolvedValue({
        blockTime: Date.parse('2026-06-01T00:00:00Z') / 1000,
        transaction: { message: depositMessage(null) },
      }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory }, BASE_INPUT);

    expect(result).not.toBeNull();
    expect(result!.entryPrice).toBe(970);
    expect(getPoolHistory).toHaveBeenCalledWith(POOL, expect.any(Number));
  });

  it('returns null when getPoolHistory has no snapshot for the entry day', async () => {
    const getPoolHistory = vi.fn().mockResolvedValue([{ snapshotAt: '2026-01-01T00:00:00.000Z', currentPrice: 100 }]);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'oldest' }]),
      getTransaction: vi.fn().mockResolvedValue({
        blockTime: Date.parse('2026-06-01T00:00:00Z') / 1000,
        transaction: { message: depositMessage(null) },
      }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory }, BASE_INPUT);

    expect(result).toBeNull();
  });

  it('returns null when there are no signatures for the position', async () => {
    const connection = { getSignaturesForAddress: vi.fn().mockResolvedValue([]), getTransaction: vi.fn() };

    const result = await deriveCostBasis({ connection, getPoolHistory: vi.fn() }, BASE_INPUT);

    expect(result).toBeNull();
  });

  it('returns null when the signature page is maxed out (possibly more history beyond it)', async () => {
    const signatures = Array.from({ length: 1000 }, (_, i) => ({ signature: `sig${i}` }));
    const connection = { getSignaturesForAddress: vi.fn().mockResolvedValue(signatures), getTransaction: vi.fn() };

    const result = await deriveCostBasis({ connection, getPoolHistory: vi.fn() }, BASE_INPUT);

    expect(result).toBeNull();
    expect(connection.getTransaction).not.toHaveBeenCalled();
  });

  it('returns null when the oldest transaction has no deposit instruction for this position', async () => {
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: 'oldest' }]),
      getTransaction: vi.fn().mockResolvedValue({ blockTime: 1000, transaction: { message: { instructions: [], accountKeys: [] } } }),
    };

    const result = await deriveCostBasis({ connection, getPoolHistory: vi.fn() }, BASE_INPUT);

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/lib/costBasis.test.ts`
Expected: FAIL — `Cannot find module './costBasis.js'`

- [ ] **Step 3: Implement `costBasis.ts`**

```ts
// backend/src/lib/costBasis.ts
import type { PublicKey } from '@solana/web3.js';
import { getPricePerToken } from './positionMath.js';
import { parseDepositFromMessage, type DepositMessage } from './depositInstruction.js';

const SIGNATURE_PAGE_LIMIT = 1000;

export interface CostBasisResult {
  entryDate: string;
  entryPrice: number;
  depositXAmount: number;
  depositYAmount: number;
  txSignature: string;
}

export interface CostBasisConnection {
  getSignaturesForAddress(address: PublicKey, options: { limit: number }): Promise<{ signature: string }[]>;
  getTransaction(
    signature: string,
    options: { maxSupportedTransactionVersion: number },
  ): Promise<{ blockTime: number | null; transaction: { message: DepositMessage } } | null>;
}

export interface PoolHistoryPoint {
  snapshotAt: string;
  currentPrice: number;
}

export interface DeriveCostBasisDeps {
  connection: CostBasisConnection;
  getPoolHistory: (poolAddress: string, days: number) => Promise<PoolHistoryPoint[]>;
  now?: () => number;
}

export interface DeriveCostBasisInput {
  positionAddress: string;
  poolAddress: string;
  programId: string;
  idl: unknown;
  binStep: number;
  decimalsX: number;
  decimalsY: number;
}

function toUtcDay(blockTimeSeconds: number): string {
  return new Date(blockTimeSeconds * 1000).toISOString().slice(0, 10);
}

export async function deriveCostBasis(deps: DeriveCostBasisDeps, input: DeriveCostBasisInput): Promise<CostBasisResult | null> {
  const now = deps.now ?? Date.now;
  const { PublicKey } = await import('@solana/web3.js');

  const signatures = await deps.connection.getSignaturesForAddress(new PublicKey(input.positionAddress), {
    limit: SIGNATURE_PAGE_LIMIT,
  });
  if (signatures.length === 0 || signatures.length >= SIGNATURE_PAGE_LIMIT) return null;

  const oldest = signatures[signatures.length - 1];
  const tx = await deps.connection.getTransaction(oldest.signature, { maxSupportedTransactionVersion: 0 });
  if (!tx || tx.blockTime == null) return null;

  const deposit = parseDepositFromMessage(tx.transaction.message, {
    idl: input.idl,
    programId: input.programId,
    positionAddress: input.positionAddress,
  });
  if (!deposit) return null;

  const entryDate = toUtcDay(tx.blockTime);
  const depositXAmount = Number(deposit.amountX) / 10 ** input.decimalsX;
  const depositYAmount = Number(deposit.amountY) / 10 ** input.decimalsY;

  let entryPrice: number;
  if (deposit.activeId !== null) {
    entryPrice = getPricePerToken(deposit.activeId, input.binStep, input.decimalsX, input.decimalsY);
  } else {
    const daysSinceEntry = Math.ceil((now() - Date.parse(`${entryDate}T00:00:00Z`)) / (24 * 60 * 60 * 1000)) + 2;
    const history = await deps.getPoolHistory(input.poolAddress, Math.max(daysSinceEntry, 1));
    const snapshot = history.find((s) => s.snapshotAt.slice(0, 10) === entryDate);
    if (!snapshot) return null;
    entryPrice = snapshot.currentPrice;
  }

  return { entryDate, entryPrice, depositXAmount, depositYAmount, txSignature: oldest.signature };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/lib/costBasis.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/costBasis.ts backend/src/lib/costBasis.test.ts
git commit -m "feat(backend): derive real entry price from a position's own deposit transaction"
```

---

### Task 5: `position_cost_basis` table + `GET /api/positions/:positionAddress/cost-basis`

**Files:**
- Modify: `db/schema.sql`
- Modify: `backend/src/routes/positions.ts`
- Modify: `backend/src/routes/positions.test.ts`

**Interfaces:**
- Consumes: `deriveCostBasis` (Task 4), `computePositionSummary`/nothing new from Task 1
- Produces (used by frontend Task 6):
  ```ts
  export interface PositionCostBasis {
    entryDate: string;
    entryPrice: number;
    depositXAmount: number;
    depositYAmount: number;
    txSignature: string;
  }

  export type FetchCostBasisFn = (positionAddress: string, poolAddress: string) => Promise<PositionCostBasis | null>;
  ```
  Route response: `{ available: true, costBasis: PositionCostBasis }` or `{ available: false }`.

- [ ] **Step 1: Add the `position_cost_basis` table**

Append to `db/schema.sql`:

```sql
-- =========================================================
-- position_cost_basis: immutable, derived-once entry price/deposit for a
-- real wallet position, keyed by the position's own on-chain address. This
-- is NOT a cache of live position state (on-chain via
-- getAllLbPairPositionsByUser stays the source of truth for that) — it's an
-- expensive-to-derive historical fact (decoded from the position's own
-- deposit transaction) that cannot drift once written, so caching it does
-- not reopen the "no positions cache" decision documented above pool_tvl_daily.
-- =========================================================
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

- [ ] **Step 2: Write the failing test for the new route**

Add to `backend/src/routes/positions.test.ts`. This file already has `import { registerPositionsRoutes, type OnChainPosition } from './positions.js';` at the top (from Task 1) — extend that existing line to `import { registerPositionsRoutes, type OnChainPosition, type PositionCostBasis } from './positions.js';` rather than adding a second import statement for the same module (TypeScript rejects two import statements naming the same identifier from the same module as duplicate identifiers).

```ts
describe('GET /api/positions/:positionAddress/cost-basis', () => {
  const positionAddress = '95Er1xjjbQkYwgtqAe5s3kYaH4WooferaWVXkd3Apnbz';
  const poolAddress = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';

  it('returns the cost basis when one is resolvable', async () => {
    const costBasis: PositionCostBasis = {
      entryDate: '2026-06-01',
      entryPrice: 1000,
      depositXAmount: 5,
      depositYAmount: 500,
      txSignature: 'sig1',
    };
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => costBasis });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: true, costBasis });
  });

  it('returns available: false when cost basis cannot be resolved', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => null });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: false });
  });

  it('returns 400 when the pool query parameter is missing or invalid', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => null });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis` });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when positionAddress is not a valid public key', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { fetchPositions: async () => [], fetchCostBasis: async () => null });

    const response = await app.inject({ method: 'GET', url: `/api/positions/not-a-pubkey/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(400);
  });

  it('returns 503 when Solana RPC is unavailable', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, {
      fetchPositions: async () => [],
      fetchCostBasis: async () => {
        throw new (await import('../lib/dlmmError.js')).SolanaUnavailableError();
      },
    });

    const response = await app.inject({ method: 'GET', url: `/api/positions/${positionAddress}/cost-basis?pool=${poolAddress}` });

    expect(response.statusCode).toBe(503);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/routes/positions.test.ts`
Expected: FAIL — `fetchCostBasis` not accepted / route not found

- [ ] **Step 4: Implement the route, cache read/write, and default wiring**

Read `backend/src/routes/positions.ts` first (now as left by Task 1). Add imports:

```ts
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { createMeteoraService, MeteoraUnavailableError } from '../services/meteora.js';
import { deriveCostBasis } from '../lib/costBasis.js';
import type { SupabaseClient } from '@supabase/supabase-js';
```

Add types and functions (after `OnChainPosition`):

```ts
export interface PositionCostBasis {
  entryDate: string;
  entryPrice: number;
  depositXAmount: number;
  depositYAmount: number;
  txSignature: string;
}

export type FetchCostBasisFn = (positionAddress: string, poolAddress: string) => Promise<PositionCostBasis | null>;

async function getCachedCostBasis(supabaseAdmin: SupabaseClient, positionAddress: string): Promise<PositionCostBasis | null> {
  const { data } = await supabaseAdmin
    .from('position_cost_basis')
    .select('entry_date, entry_price, deposit_x_amount, deposit_y_amount, tx_signature')
    .eq('position_address', positionAddress)
    .maybeSingle();
  if (!data) return null;
  return {
    entryDate: data.entry_date,
    entryPrice: Number(data.entry_price),
    depositXAmount: Number(data.deposit_x_amount),
    depositYAmount: Number(data.deposit_y_amount),
    txSignature: data.tx_signature,
  };
}

async function saveCostBasis(
  supabaseAdmin: SupabaseClient,
  positionAddress: string,
  poolAddress: string,
  costBasis: PositionCostBasis,
): Promise<void> {
  await supabaseAdmin.from('position_cost_basis').insert({
    position_address: positionAddress,
    pool_address: poolAddress,
    entry_date: costBasis.entryDate,
    entry_price: costBasis.entryPrice,
    deposit_x_amount: costBasis.depositXAmount,
    deposit_y_amount: costBasis.depositYAmount,
    tx_signature: costBasis.txSignature,
  });
}

async function defaultFetchCostBasis(positionAddress: string, poolAddress: string): Promise<PositionCostBasis | null> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!rpcUrl || !supabaseUrl || !supabaseKey) {
    throw new SolanaUnavailableError('Server is missing Solana RPC or Supabase configuration.');
  }

  const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseKey);
  const cached = await getCachedCostBasis(supabaseAdmin, positionAddress);
  if (cached) return cached;

  const meteoraService = createMeteoraService({ supabaseAdmin });
  const pool = await meteoraService.getPoolByAddress(poolAddress);
  if (!pool) return null;

  const connection = createConnection(rpcUrl);
  const DLMM = loadDlmmSdk();

  let derived;
  try {
    derived = await deriveCostBasis(
      { connection, getPoolHistory: meteoraService.getPoolHistory },
      {
        positionAddress,
        poolAddress,
        programId: DLMM.LBCLMM_PROGRAM_IDS.devnet,
        idl: DLMM.IDL,
        binStep: pool.binStep,
        decimalsX: pool.tokenX.decimals,
        decimalsY: pool.tokenY.decimals,
      },
    );
  } catch (err) {
    throw new SolanaUnavailableError('Failed to derive cost basis from Solana.', { cause: err });
  }
  if (!derived) return null;

  await saveCostBasis(supabaseAdmin, positionAddress, poolAddress, derived);
  return derived;
}
```

Update the `registerPositionsRoutes` signature and add the route:

```ts
export function registerPositionsRoutes(
  app: FastifyInstance,
  deps: { fetchPositions?: FetchPositionsFn; fetchCostBasis?: FetchCostBasisFn } = {},
): void {
  const fetchPositions = deps.fetchPositions ?? defaultFetchPositions;
  const fetchCostBasis = deps.fetchCostBasis ?? defaultFetchCostBasis;

  // ... existing GET /api/positions unchanged ...

  app.get('/api/positions/:positionAddress/cost-basis', async (request, reply) => {
    const { positionAddress } = request.params as { positionAddress: string };
    const { pool } = request.query as { pool?: string };
    if (!isValidPubkey(positionAddress) || !isValidPubkey(pool)) {
      reply.code(400);
      return { error: 'A valid positionAddress path segment and pool query parameter are required.' };
    }

    try {
      const costBasis = await fetchCostBasis(positionAddress, pool);
      if (!costBasis) return { available: false };
      return { available: true, costBasis };
    } catch (err) {
      if (err instanceof SolanaUnavailableError || err instanceof MeteoraUnavailableError) {
        request.log.error({ err }, 'fetch cost basis failed');
        reply.code(503);
        return { error: err.message };
      }
      throw err;
    }
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/routes/positions.test.ts`
Expected: PASS (all cases, old and new)

- [ ] **Step 6: Run the full backend test suite and build**

Run: `cd backend && npm test && npm run build`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql backend/src/routes/positions.ts backend/src/routes/positions.test.ts
git commit -m "feat(backend): add GET /api/positions/:positionAddress/cost-basis with immutable Supabase cache"
```

---

### Task 6: Frontend types, API client, and `positionPnl.ts`

**Files:**
- Modify: `frontend/src/types/liquidity.ts`
- Modify: `frontend/src/lib/api/positions.ts`
- Create: `frontend/src/lib/positionPnl.ts`
- Test: `frontend/src/lib/positionPnl.test.ts`

**Interfaces:**
- Consumes: `calculateRangeIL` (`il.ts`, unchanged), `netYieldFromFees` (`yield.ts`, Task 2)
- Produces (used by Task 7):
  ```ts
  export interface PositionPnl {
    impermanentLossPct: number;
    depositValueQuote: number;
    netYieldQuote: number;
    netYieldPct: number;
  }

  export function computePositionPnl(position: Position, costBasis: PositionCostBasis): PositionPnl;
  ```

- [ ] **Step 1: Extend `types/liquidity.ts`**

Read `frontend/src/types/liquidity.ts` first. Replace the `Position` interface and add `PositionCostBasis`:

```ts
export interface PositionAmounts {
  xAmount: number;
  yAmount: number;
  valueInQuote: number;
}

export interface Position {
  poolAddress: string;
  positionAddress: string;
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: PositionAmounts;
  fees: PositionAmounts;
}

export interface PositionCostBasis {
  entryDate: string;
  entryPrice: number;
  depositXAmount: number;
  depositYAmount: number;
  txSignature: string;
}
```

- [ ] **Step 2: Add `fetchPositionCostBasis` to `lib/api/positions.ts`**

Read `frontend/src/lib/api/positions.ts` first. Add:

```ts
import type { Position, PositionCostBasis } from '../../types/liquidity';

export interface CostBasisResponse {
  available: boolean;
  costBasis?: PositionCostBasis;
}

export async function fetchPositionCostBasis(positionAddress: string, poolAddress: string): Promise<CostBasisResponse> {
  const url = new URL(`/api/positions/${positionAddress}/cost-basis`, API_BASE_URL);
  url.searchParams.set('pool', poolAddress);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load position P&L.');
  }
  return body as CostBasisResponse;
}
```

(Update the existing `import type { Position } from '../../types/liquidity';` line to the combined import above rather than duplicating it.)

- [ ] **Step 3: Write the failing test for `computePositionPnl`**

```ts
// frontend/src/lib/positionPnl.test.ts
import { describe, expect, it } from 'vitest';
import { computePositionPnl } from './positionPnl';
import type { Position, PositionCostBasis } from '../types/liquidity';

function position(overrides: Partial<Position> = {}): Position {
  return {
    poolAddress: 'pool1',
    positionAddress: 'pos1',
    lowerBinId: -100,
    upperBinId: 100,
    activeBinId: 0,
    currentPrice: 115,
    lowerPrice: 90,
    upperPrice: 120,
    liquidity: { xAmount: 50, yAmount: 5000, valueInQuote: 10750 },
    fees: { xAmount: 0, yAmount: 45, valueInQuote: 45 },
    ...overrides,
  };
}

function costBasis(overrides: Partial<PositionCostBasis> = {}): PositionCostBasis {
  return { entryDate: '2026-01-01', entryPrice: 100, depositXAmount: 50, depositYAmount: 5000, txSignature: 'sig', ...overrides };
}

describe('computePositionPnl', () => {
  it('matches the hand-derived il.ts/yield.ts reference numbers (entry 100 -> current 115, range [90,120], deposit $10,000-equivalent)', () => {
    const result = computePositionPnl(position(), costBasis());

    // Same inputs as il.test.ts/yield.test.ts's hand-verified example: IL ~ -1.819%.
    expect(result.impermanentLossPct).toBeCloseTo(-1.819, 2);
    // depositValueQuote = 50*100 + 5000 = 10000
    expect(result.depositValueQuote).toBeCloseTo(10_000, 6);
    // netYieldQuote = feesEarned(45) - impermanentLossValue(~181.9) ~ -136.9
    expect(result.netYieldQuote).toBeCloseTo(45 - 181.9, 0);
    expect(result.netYieldPct).toBeCloseTo(((45 - 181.9) / 10_000) * 100, 1);
  });

  it('produces zero IL and netYield === feesEarned when current price equals entry price', () => {
    const result = computePositionPnl(position({ currentPrice: 100, fees: { xAmount: 0, yAmount: 20, valueInQuote: 20 } }), costBasis());

    expect(result.impermanentLossPct).toBeCloseTo(0, 6);
    expect(result.netYieldQuote).toBeCloseTo(20, 6);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/positionPnl.test.ts`
Expected: FAIL — `Cannot find module './positionPnl'`

- [ ] **Step 5: Implement `positionPnl.ts`**

```ts
// frontend/src/lib/positionPnl.ts
import { calculateRangeIL } from './il';
import { netYieldFromFees } from './yield';
import type { Position, PositionCostBasis } from '../types/liquidity';

export interface PositionPnl {
  impermanentLossPct: number;
  depositValueQuote: number;
  netYieldQuote: number;
  netYieldPct: number;
}

export function computePositionPnl(position: Position, costBasis: PositionCostBasis): PositionPnl {
  const il = calculateRangeIL({
    entryPrice: costBasis.entryPrice,
    currentPrice: position.currentPrice,
    lowerPrice: position.lowerPrice,
    upperPrice: position.upperPrice,
  });

  const depositValueQuote = costBasis.depositXAmount * costBasis.entryPrice + costBasis.depositYAmount;
  const { netYield, netYieldPct } = netYieldFromFees({
    feesEarned: position.fees.valueInQuote,
    depositValue: depositValueQuote,
    impermanentLossPct: il.impermanentLossPct,
  });

  return { impermanentLossPct: il.impermanentLossPct, depositValueQuote, netYieldQuote: netYield, netYieldPct };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/positionPnl.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/liquidity.ts frontend/src/lib/api/positions.ts frontend/src/lib/positionPnl.ts frontend/src/lib/positionPnl.test.ts
git commit -m "feat(frontend): add position cost-basis types, API client, and pure P&L combiner"
```

---

### Task 7: Render real position data in `MyPositionsPage.tsx`

**Files:**
- Modify: `frontend/src/components/IlCalculator.tsx` (export the `Result` display component)
- Modify: `frontend/src/pages/MyPositionsPage.tsx`

**Interfaces:**
- Consumes: `Position`/`PositionCostBasis` (Task 6), `fetchPositionCostBasis` (Task 6), `computePositionPnl` (Task 6), `Result` (this task, exported from `IlCalculator.tsx`)

- [ ] **Step 1: Export `Result` from `IlCalculator.tsx`**

Read `frontend/src/components/IlCalculator.tsx` first. Change:

```ts
function Result({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
```

to:

```ts
export function Result({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
```

No other changes to this file — its own internal usage of `Result` keeps working unchanged.

- [ ] **Step 2: Rewrite `MyPositionsPage.tsx`**

Read `frontend/src/pages/MyPositionsPage.tsx` first (current version only renders pool/position addresses + Solscan link). Replace the whole file:

```tsx
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchPositions, fetchPositionCostBasis } from '../lib/api/positions';
import { usePositionsRefresh } from '../lib/positionsRefresh';
import { computePositionPnl } from '../lib/positionPnl';
import { formatPercent, formatPrice } from '../lib/format';
import { Result } from '../components/IlCalculator';
import type { Position, PositionCostBasis } from '../types/liquidity';

type PnlState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; costBasis: PositionCostBasis };

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
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Connect a wallet to see your positions.
      </p>
    );
  }

  if (status === 'loading') {
    return <div className="h-24 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (status === 'error') {
    return (
      <p className="text-sm" style={{ color: 'var(--red)' }}>
        {errorMessage}
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No positions yet.
      </p>
    );
  }

  return (
    <div className="page-enter space-y-3">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        My Positions
      </h1>
      <ul className="space-y-3">
        {positions.map((position) => (
          <PositionRow key={position.positionAddress} position={position} />
        ))}
      </ul>
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const [pnl, setPnl] = useState<PnlState>({ status: 'idle' });

  function handleShowPnl() {
    setPnl({ status: 'loading' });
    fetchPositionCostBasis(position.positionAddress, position.poolAddress)
      .then((res) => {
        if (res.available && res.costBasis) {
          setPnl({ status: 'ready', costBasis: res.costBasis });
        } else {
          setPnl({ status: 'unavailable' });
        }
      })
      .catch((err: unknown) => {
        setPnl({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load P&L.' });
      });
  }

  const computedPnl = pnl.status === 'ready' ? computePositionPnl(position, pnl.costBasis) : null;

  return (
    <li className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <p style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>Pool: {position.poolAddress}</p>
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Position: {position.positionAddress}</p>
      <a href={`https://solscan.io/account/${position.positionAddress}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>
        View on Solscan
      </a>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Result label="Bin range" value={`${position.lowerBinId} .. ${position.upperBinId}`} />
        <Result label="Active bin" value={String(position.activeBinId)} />
        <Result label="Liquidity value" value={`${position.liquidity.valueInQuote.toFixed(4)} (quote)`} accent="var(--green)" />
        <Result label="Fees earned" value={`${position.fees.valueInQuote.toFixed(6)} (quote)`} accent="var(--green)" />
      </div>

      {pnl.status === 'idle' && (
        <button
          onClick={handleShowPnl}
          className="mt-3 rounded border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          Show P&L
        </button>
      )}
      {pnl.status === 'loading' && (
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          Loading P&L…
        </p>
      )}
      {pnl.status === 'unavailable' && (
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          P&L unavailable for this position (entry price could not be resolved).
        </p>
      )}
      {pnl.status === 'error' && (
        <p className="mt-3 text-xs" style={{ color: 'var(--red)' }}>
          {pnl.message}
        </p>
      )}
      {pnl.status === 'ready' && computedPnl && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Result label="Entry price" value={formatPrice(pnl.costBasis.entryPrice)} />
          <Result label="Impermanent loss" value={formatPercent(computedPnl.impermanentLossPct)} accent="var(--red)" />
          <Result
            label="Net yield"
            value={`${computedPnl.netYieldQuote.toFixed(6)} (${formatPercent(computedPnl.netYieldPct)})`}
            accent={computedPnl.netYieldQuote >= 0 ? 'var(--green)' : 'var(--red)'}
          />
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Typecheck and build the frontend**

Run: `cd frontend && npm run build`
Expected: PASS — no TypeScript errors

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions

- [ ] **Step 5: Manual verification note**

This page's on-chain data (real wallet positions, real devnet transactions) can't be exercised by an automated test without a funded devnet wallet and an existing position — consistent with this project's existing convention for wallet-adjacent UI (see the wallet-liquidity spec's Testing section). Before considering this task done end-to-end, manually verify with a real devnet wallet that already holds a DLMM position (e.g. one created via this app's own `AddLiquidityForm`):
1. Connect the wallet on `/positions`.
2. Confirm bin range / active bin / liquidity value / fees render with real numbers (no extra RPC beyond what the page already made).
3. Click "Show P&L" and confirm it either shows entry price / IL / net yield, or "P&L unavailable" — not a crash or an infinite spinner.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IlCalculator.tsx frontend/src/pages/MyPositionsPage.tsx
git commit -m "feat(frontend): show real bin range, value, fees, and on-demand P&L on My Positions"
```

---

## Self-Review Notes

- **Spec coverage:** free list-endpoint fields (Task 1), entry-price derivation via instruction decoding + OHLCV fallback (Tasks 3-4), `position_cost_basis` table + on-demand endpoint (Task 5), math reuse (`calculateRangeIL` untouched; `netYieldFromFees` extracted, Task 2/6), frontend rendering (Task 7) — every spec section has a task.
- **Refinement over the spec during planning:** the spec named Meteora OHLCV as the entry-price source; empirical inspection of the SDK's bundled IDL during planning found that the deposit instruction itself carries `active_id` (the exact bin observed at deposit time) for every strategy-based variant — which is how this project's own `AddLiquidityForm` deposits liquidity. This is strictly more precise and removes an external dependency for the common case, so it's used as primary source with OHLCV kept only as the fallback for the legacy `add_liquidity`/`add_liquidity2` variant, which lacks `active_id`. Same table shape, same endpoint, same math reuse — no re-approval needed, noted here for the record.
- **Placeholder scan:** no TBD/TODO; every step has runnable code.
- **Type consistency:** `PositionSummary`/`PositionAmounts` (Task 1) match `Position`/`PositionAmounts` (Task 6, frontend mirror) field-for-field; `CostBasisResult`/`PositionCostBasis` (Task 4/5 backend, Task 6 frontend) match field-for-field; `DepositInstructionAmounts` (Task 3) is consumed as-is by `deriveCostBasis` (Task 4) with no renamed fields.
