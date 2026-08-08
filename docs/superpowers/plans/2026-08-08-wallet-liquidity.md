# Wallet Connect + On-Chain Add Liquidity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a Solana wallet (Phantom/Solflare, devnet), build an unsigned add-liquidity
transaction for a DLMM pool server-side, sign/submit/confirm it client-side, persist the
resulting position in Supabase after independently verifying it on-chain, and list it under
"My Positions."

**Architecture:** See `docs/superpowers/specs/2026-08-08-wallet-liquidity-design.md` for full
rationale. Summary: backend builds unsigned txs only and never signs; frontend wallet signs
and submits; backend re-verifies on-chain confirmation before writing to Supabase.

**Tech Stack:** `@solana/web3.js`, `@meteora-ag/dlmm`, `zod` (backend, new);
`@solana/wallet-adapter-react`, `@solana/wallet-adapter-wallets`,
`@solana/wallet-adapter-base`, `@solana/web3.js` (frontend, new); existing Fastify + TS +
Vitest backend, existing React + TS + Tailwind + React Router frontend.

## Global Constraints

- **Devnet only.** `SOLANA_RPC_URL` (backend) / `VITE_SOLANA_RPC_URL` (frontend) default to
  `https://api.devnet.solana.com`. No task in this plan changes that default.
- **The backend never imports a private key, never calls anything that signs a transaction.**
  Every backend function that touches a transaction stops at "build and serialize unsigned."
- Backend code follows the existing DI pattern (`deps` param defaulting to a real
  implementation, e.g. `services/bybit.ts`, `routes/screener.ts`) so tests never hit real
  Solana RPC or real Supabase.
- Backend error handling follows the existing `XUnavailableError` class + route-level
  catch-and-map-to-status-code pattern (`BybitUnavailableError` → 503 in `routes/screener.ts`
  is the reference).
- Frontend follows existing conventions: function components, inline
  `style={{ color: 'var(--...)' }}` design tokens (never hardcoded colors, never Tailwind
  color utility classes), `lib/api/*.ts` per-domain fetch wrappers matching
  `lib/api/news.ts`/`screener.ts`'s shape (local `API_BASE_URL`, throw `Error(body.error ??
  fallback)` on non-2xx), `cancelled`-flag cleanup in data-fetching `useEffect`s.
- `@meteora-ag/dlmm`'s exact current API (method names on the pool class for building an
  add-liquidity instruction/transaction, and the exact shape it expects for bin
  ids/strategy) is confirmed by reading the installed package's type declarations
  (`node_modules/@meteora-ag/dlmm/dist/**/*.d.ts`) during Task 2, Step 1 — **do not
  guess or invent SDK method signatures**; if the installed version's API differs from what
  a step below assumes, adapt the implementation to match the real API and note the
  deviation in that task's commit message.
- Every async call that can fail (RPC call, SDK call, Supabase call) is wrapped so failure
  produces a typed error path (a specific error class, or a discriminated result), never a
  silent catch-and-ignore.

---

## File Structure

**Backend (`backend/src/`):**
- Create `lib/solanaConnection.ts` — `createConnection(rpcUrl)` factory.
- Create `lib/dlmmError.ts` — `SolanaUnavailableError`, `PoolNotFoundError`.
- Create `lib/liquidityValidation.ts` — zod schema + parsed-input type for `build-tx`.
- Create `lib/liquidityValidation.test.ts`
- Create `routes/liquidity.ts` — `POST /api/liquidity/build-tx`.
- Create `routes/liquidity.test.ts`
- Create `routes/positions.ts` — `POST /api/positions`, `GET /api/positions`.
- Create `routes/positions.test.ts`
- Modify `server.ts` — wire the two new route registrations.
- Modify `.env.example` — add `SOLANA_RPC_URL=`.
- Modify `package.json` — add `@solana/web3.js`, `@meteora-ag/dlmm`, `zod`.
- Modify `../../db/schema.sql` — add the `positions` table.

**Frontend (`frontend/src/`):**
- Create `lib/wallet/WalletContextProvider.tsx`
- Create `components/WalletConnectButton.tsx`
- Create `lib/api/liquidity.ts`
- Create `lib/api/positions.ts`
- Create `lib/positionsRefresh.tsx` — `PositionsRefreshProvider` + `usePositionsRefresh()`.
- Create `types/liquidity.ts` — `Position`, `BuildTxResponse` types.
- Create `components/AddLiquidityForm.tsx`
- Create `pages/MyPositionsPage.tsx`
- Modify `App.tsx` — wrap in `WalletContextProvider` + `PositionsRefreshProvider`, add
  `/positions` route.
- Modify `components/Layout.tsx` — add `WalletConnectButton`, `/positions` nav link.
- Modify `pages/PoolDetailPage.tsx` — render `AddLiquidityForm` when connected.
- Modify `.env.example` — add `VITE_SOLANA_RPC_URL=`.
- Modify `package.json` — add `@solana/web3.js`, `@solana/wallet-adapter-react`,
  `@solana/wallet-adapter-wallets`, `@solana/wallet-adapter-base`.

---

### Task 1: Backend — Solana connection factory + error classes + deps install

**Files:**
- Create: `backend/src/lib/solanaConnection.ts`
- Create: `backend/src/lib/dlmmError.ts`
- Modify: `backend/package.json`, `backend/.env.example`

**Interfaces:**
- Produces: `function createConnection(rpcUrl: string): Connection` (from `@solana/web3.js`);
  `class SolanaUnavailableError extends Error {}`; `class PoolNotFoundError extends Error {}`.

- [ ] **Step 1: Install dependencies**

Run: `cd backend && npm install @solana/web3.js @meteora-ag/dlmm zod`
Expected: packages installed; if `@meteora-ag/dlmm` resolves to a different real package
name on npm (confirm via the install output / npm registry — the org/package naming for the
Meteora DLMM SDK has changed before), use the actual published package name instead and note
it in the commit message and in this file via a one-line edit.

- [ ] **Step 2: Implement the connection factory**

```typescript
// backend/src/lib/solanaConnection.ts
import { Connection } from '@solana/web3.js';

export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed');
}
```

- [ ] **Step 3: Implement the error classes**

```typescript
// backend/src/lib/dlmmError.ts
export class SolanaUnavailableError extends Error {
  constructor(message = 'Solana RPC is unavailable right now.') {
    super(message);
    this.name = 'SolanaUnavailableError';
  }
}

export class PoolNotFoundError extends Error {
  constructor(poolAddress: string) {
    super(`Pool ${poolAddress} was not found on-chain.`);
    this.name = 'PoolNotFoundError';
  }
}
```

- [ ] **Step 4: Add the RPC env var**

`backend/.env.example` (append):
```
SOLANA_RPC_URL=https://api.devnet.solana.com
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/solanaConnection.ts backend/src/lib/dlmmError.ts backend/.env.example
git commit -m "feat(backend): add Solana connection factory and DLMM error classes"
```

---

### Task 2: Backend — input validation for build-tx

**Files:**
- Create: `backend/src/lib/liquidityValidation.ts`
- Test: `backend/src/lib/liquidityValidation.test.ts`

**Interfaces:**
- Produces: `buildTxRequestSchema` (zod), `type BuildTxRequest = z.infer<typeof
  buildTxRequestSchema>`, `function parseBuildTxRequest(body: unknown): { success: true; data:
  BuildTxRequest } | { success: false; error: string }` — wraps zod's own result into this
  project's plain-string-error convention (see design spec's Validation section) instead of
  leaking zod's `.flatten()` shape to the route.

- [ ] **Step 1: Read the installed DLMM SDK's types to confirm real bin-range limits**

Run: `find backend/node_modules/@meteora-ag -name "*.d.ts" | xargs grep -il "bin" ` (or
equivalent) and skim for any exported constant describing the max bin-array span per
transaction (e.g. something like `MAX_BIN_ARRAY_SIZE` / a strategy builder's own bounds
check). Use whatever real bound exists; if none is discoverable from the types alone, use a
conservative bound of 69 bins (`maxBinId - minBinId <= 69`) — this matches Meteora DLMM's
well-documented per-position bin-array constraint at the time this plan was written, but the
SDK's own types are the source of truth if they say otherwise.

- [ ] **Step 2: Write the failing tests**

```typescript
// backend/src/lib/liquidityValidation.test.ts
import { describe, expect, it } from 'vitest';
import { parseBuildTxRequest } from './liquidityValidation.js';

const validPoolAddress = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'; // valid base58 pubkey shape
const validUserPublicKey = '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q';

function baseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    poolAddress: validPoolAddress,
    amountX: '1000000',
    amountY: '1000000',
    minBinId: 100,
    maxBinId: 120,
    userPublicKey: validUserPublicKey,
    ...overrides,
  };
}

describe('parseBuildTxRequest', () => {
  it('accepts a well-formed request', () => {
    const result = parseBuildTxRequest(baseBody());
    expect(result.success).toBe(true);
  });

  it('rejects an invalid poolAddress', () => {
    const result = parseBuildTxRequest(baseBody({ poolAddress: 'not-a-pubkey' }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid userPublicKey', () => {
    const result = parseBuildTxRequest(baseBody({ userPublicKey: 'not-a-pubkey' }));
    expect(result.success).toBe(false);
  });

  it('rejects amountX/amountY that are both zero', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '0', amountY: '0' }));
    expect(result.success).toBe(false);
  });

  it('rejects a negative amount', () => {
    const result = parseBuildTxRequest(baseBody({ amountX: '-5' }));
    expect(result.success).toBe(false);
  });

  it('rejects minBinId > maxBinId', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: 200, maxBinId: 100 }));
    expect(result.success).toBe(false);
  });

  it('rejects a bin range wider than the allowed span', () => {
    const result = parseBuildTxRequest(baseBody({ minBinId: 0, maxBinId: 5000 }));
    expect(result.success).toBe(false);
  });

  it('rejects a slippageBps outside 1-2000', () => {
    const result = parseBuildTxRequest(baseBody({ slippageBps: 5000 }));
    expect(result.success).toBe(false);
  });

  it('defaults slippageBps to 100 when omitted', () => {
    const result = parseBuildTxRequest(baseBody());
    if (!result.success) throw new Error('expected success');
    expect(result.data.slippageBps).toBe(100);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/lib/liquidityValidation.test.ts`
Expected: FAIL — `Cannot find module './liquidityValidation.js'`

- [ ] **Step 4: Implement the schema**

```typescript
// backend/src/lib/liquidityValidation.ts
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

const MAX_BIN_SPAN = 69; // confirmed against @meteora-ag/dlmm's own bin-array limit (Task 2, Step 1)

const pubkeyString = z.string().refine(
  (value) => {
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Not a valid Solana public key.' },
);

const positiveNumericString = z.string().refine(
  (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  },
  { message: 'Amount must be a non-negative number.' },
);

export const buildTxRequestSchema = z
  .object({
    poolAddress: pubkeyString,
    userPublicKey: pubkeyString,
    amountX: positiveNumericString,
    amountY: positiveNumericString,
    minBinId: z.number().int(),
    maxBinId: z.number().int(),
    slippageBps: z.number().int().min(1).max(2000).default(100),
  })
  .refine((data) => data.minBinId <= data.maxBinId, {
    message: 'minBinId must be less than or equal to maxBinId.',
    path: ['minBinId'],
  })
  .refine((data) => data.maxBinId - data.minBinId <= MAX_BIN_SPAN, {
    message: `Bin range cannot span more than ${MAX_BIN_SPAN} bins.`,
    path: ['maxBinId'],
  })
  .refine((data) => Number(data.amountX) > 0 || Number(data.amountY) > 0, {
    message: 'At least one of amountX or amountY must be greater than zero.',
    path: ['amountX'],
  });

export type BuildTxRequest = z.infer<typeof buildTxRequestSchema>;

export function parseBuildTxRequest(
  body: unknown,
): { success: true; data: BuildTxRequest } | { success: false; error: string } {
  const result = buildTxRequestSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message ?? 'Invalid request body.' };
  }
  return { success: true, data: result.data };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/lib/liquidityValidation.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/liquidityValidation.ts backend/src/lib/liquidityValidation.test.ts
git commit -m "feat(backend): add zod validation for the build-tx request body"
```

---

### Task 3: Backend — `POST /api/liquidity/build-tx`

**Files:**
- Create: `backend/src/routes/liquidity.ts`
- Test: `backend/src/routes/liquidity.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `parseBuildTxRequest` (Task 2); `createConnection` (Task 1);
  `SolanaUnavailableError`, `PoolNotFoundError` (Task 1).
- Produces: `function registerLiquidityRoutes(app, deps?: { buildTx?: BuildTxFn }): void`
  where `type BuildTxFn = (input: BuildTxRequest) => Promise<{ transaction: string;
  blockhash: string; lastValidBlockHeight: number }>` — the DLMM-SDK-touching logic is
  injected as `deps.buildTx` so the route's tests never construct a real `Connection` or call
  the real SDK; the default (non-test) implementation lives in this same file but is only
  exercised in Task 10's manual devnet verification.

- [ ] **Step 1: Write the failing route tests**

```typescript
// backend/src/routes/liquidity.test.ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerLiquidityRoutes } from './liquidity.js';
import { SolanaUnavailableError, PoolNotFoundError } from '../lib/dlmmError.js';

const validBody = {
  poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  userPublicKey: '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q',
  amountX: '1000000',
  amountY: '1000000',
  minBinId: 100,
  maxBinId: 120,
};

describe('POST /api/liquidity/build-tx', () => {
  it('returns the serialized unsigned transaction on success', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, {
      buildTx: async () => ({ transaction: 'base64tx', blockhash: 'abc', lastValidBlockHeight: 123 }),
    });

    const response = await app.inject({ method: 'POST', url: '/api/liquidity/build-tx', payload: validBody });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transaction: 'base64tx', blockhash: 'abc', lastValidBlockHeight: 123 });
  });

  it('returns 400 on an invalid request body', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, { buildTx: async () => ({ transaction: '', blockhash: '', lastValidBlockHeight: 0 }) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/liquidity/build-tx',
      payload: { ...validBody, poolAddress: 'not-a-pubkey' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the pool is not found on-chain', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, {
      buildTx: async () => {
        throw new PoolNotFoundError(validBody.poolAddress);
      },
    });

    const response = await app.inject({ method: 'POST', url: '/api/liquidity/build-tx', payload: validBody });

    expect(response.statusCode).toBe(404);
  });

  it('returns 503 when Solana RPC is unavailable', async () => {
    const app = Fastify();
    registerLiquidityRoutes(app, {
      buildTx: async () => {
        throw new SolanaUnavailableError();
      },
    });

    const response = await app.inject({ method: 'POST', url: '/api/liquidity/build-tx', payload: validBody });

    expect(response.statusCode).toBe(503);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/liquidity.test.ts`
Expected: FAIL — `Cannot find module './liquidity.js'`

- [ ] **Step 3: Read the installed DLMM SDK's types before implementing the real `buildTx`**

Run: `find backend/node_modules/@meteora-ag -name "*.d.ts"` and read the main pool class's
declarations to find the actual method(s) for: loading a pool by address, and building an
add-liquidity-by-strategy instruction/transaction. Use the real method names/argument shapes
found there for the implementation below — the code sample in Step 4 is a best-effort
sketch based on the SDK's documented shape as of this plan's writing (a static
`DLMM.create(connection, poolPubkey)` loader, and a `pool.addLiquidityByStrategy({...})`
instance method returning a `Transaction`) and **must be corrected to match the real
installed API** if it differs.

- [ ] **Step 4: Implement the route**

```typescript
// backend/src/routes/liquidity.ts
import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { parseBuildTxRequest, type BuildTxRequest } from '../lib/liquidityValidation.js';
import { createConnection } from '../lib/solanaConnection.js';
import { SolanaUnavailableError, PoolNotFoundError } from '../lib/dlmmError.js';

export type BuildTxFn = (
  input: BuildTxRequest,
) => Promise<{ transaction: string; blockhash: string; lastValidBlockHeight: number }>;

async function defaultBuildTx(input: BuildTxRequest) {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new SolanaUnavailableError('Server is missing Solana RPC configuration.');
  }
  const connection = createConnection(rpcUrl);

  // NOTE: confirm exact @meteora-ag/dlmm API against installed types (Task 3, Step 3)
  // before relying on this shape — DLMM.create / addLiquidityByStrategy are best-effort
  // names based on the SDK's documented usage, not verified against this repo's
  // node_modules at spec-writing time.
  const { default: DLMM } = await import('@meteora-ag/dlmm');
  let pool;
  try {
    pool = await DLMM.create(connection, new PublicKey(input.poolAddress));
  } catch (err) {
    if (err instanceof Error && /not found|invalid/i.test(err.message)) {
      throw new PoolNotFoundError(input.poolAddress);
    }
    throw new SolanaUnavailableError();
  }

  const userPubkey = new PublicKey(input.userPublicKey);

  let transaction;
  try {
    transaction = await pool.addLiquidityByStrategy({
      positionPubKey: userPubkey, // placeholder — real param name/shape TBD from SDK types
      user: userPubkey,
      totalXAmount: input.amountX,
      totalYAmount: input.amountY,
      strategy: {
        minBinId: input.minBinId,
        maxBinId: input.maxBinId,
      },
      slippage: input.slippageBps,
    });
  } catch {
    throw new SolanaUnavailableError('Failed to build the add-liquidity transaction.');
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = userPubkey;

  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { transaction: serialized.toString('base64'), blockhash, lastValidBlockHeight };
}

export function registerLiquidityRoutes(app: FastifyInstance, deps: { buildTx?: BuildTxFn } = {}): void {
  const buildTx = deps.buildTx ?? defaultBuildTx;

  app.post('/api/liquidity/build-tx', async (request, reply) => {
    const parsed = parseBuildTxRequest(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error };
    }

    try {
      return await buildTx(parsed.data);
    } catch (err) {
      if (err instanceof PoolNotFoundError) {
        reply.code(404);
        return { error: err.message };
      }
      if (err instanceof SolanaUnavailableError) {
        reply.code(503);
        return { error: err.message };
      }
      throw err;
    }
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/routes/liquidity.test.ts`
Expected: PASS (4 tests) — these pass regardless of whether Step 3/4's exact SDK call shape
is correct, since the tests inject a fake `buildTx` and never invoke `defaultBuildTx`. Real
correctness of `defaultBuildTx` is only proven in Task 10's live devnet run — treat that task
as required, not optional, before calling this endpoint done.

- [ ] **Step 6: Wire the route into the server**

In `backend/src/server.ts`, add the import and registration call:

```typescript
import { registerLiquidityRoutes } from './routes/liquidity.js';
```
```typescript
  registerLiquidityRoutes(app);
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/liquidity.ts backend/src/routes/liquidity.test.ts backend/src/server.ts
git commit -m "feat(backend): add POST /api/liquidity/build-tx route"
```

---

### Task 4: Backend — `positions` table + `POST`/`GET /api/positions`

**Files:**
- Modify: `db/schema.sql`
- Create: `backend/src/routes/positions.ts`
- Test: `backend/src/routes/positions.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `createSupabaseAdmin` (existing, `lib/supabaseAdmin.ts`); `createConnection`
  (Task 1).
- Produces: `function registerPositionsRoutes(app, deps?: { supabase?: SupabaseClientLike;
  verifySignature?: VerifySignatureFn }): void` where `type VerifySignatureFn = (signature:
  string) => Promise<boolean>` (true only if the signature is confirmed/finalized on-chain
  with no error).

- [ ] **Step 1: Add the `positions` table to the schema**

Append to `db/schema.sql` (matching the file's existing Indonesian-comment style):

```sql
-- =========================================================
-- positions: catatan add-liquidity yang berhasil di-submit user via wallet
-- mereka sendiri. Backend menulis baris ini HANYA setelah verifikasi
-- on-chain independen (lihat routes/positions.ts) — tidak percaya klaim
-- frontend begitu saja. RLS tidak diaktifkan karena tabel ini hanya
-- diakses lewat backend (service-role client), tidak pernah lewat
-- supabase-js langsung dari frontend — sama seperti tabel-tabel lain di
-- file ini (lihat SECURITY NOTE di atas).
-- =========================================================
CREATE TABLE positions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  pool_address   TEXT NOT NULL,
  tx_signature   TEXT NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_positions_wallet ON positions (wallet_address, created_at DESC);
```

- [ ] **Step 2: Write the failing route tests**

```typescript
// backend/src/routes/positions.test.ts
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerPositionsRoutes } from './positions.js';

const validBody = {
  walletAddress: '7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q',
  poolAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  txSignature: '5'.repeat(88),
};

function fakeSupabase(overrides: Partial<{ insertError: { code: string; message: string } | null; rows: unknown[] }> = {}) {
  const insertError = overrides.insertError ?? null;
  const rows = overrides.rows ?? [];
  return {
    from: () => ({
      insert: () => ({ error: insertError }),
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  } as unknown as never;
}

describe('POST /api/positions', () => {
  it('inserts a position when the signature verifies on-chain', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => true });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: validBody });

    expect(response.statusCode).toBe(200);
  });

  it('returns 422 when the signature does not verify on-chain', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => false });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: validBody });

    expect(response.statusCode).toBe(422);
  });

  it('returns 400 on an invalid body', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => true });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: { ...validBody, walletAddress: 'bad' } });

    expect(response.statusCode).toBe(400);
  });

  it('returns 200 (idempotent) when the signature was already recorded', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, {
      supabase: fakeSupabase({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
      verifySignature: async () => true,
    });

    const response = await app.inject({ method: 'POST', url: '/api/positions', payload: validBody });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /api/positions', () => {
  it('returns rows for the given wallet', async () => {
    const rows = [{ id: '1', wallet_address: validBody.walletAddress, pool_address: validBody.poolAddress, tx_signature: validBody.txSignature, created_at: '2026-08-08T00:00:00Z' }];
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase({ rows }), verifySignature: async () => true });

    const response = await app.inject({ method: 'GET', url: `/api/positions?wallet=${validBody.walletAddress}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ positions: rows });
  });

  it('returns 400 when wallet query param is missing', async () => {
    const app = Fastify();
    registerPositionsRoutes(app, { supabase: fakeSupabase(), verifySignature: async () => true });

    const response = await app.inject({ method: 'GET', url: '/api/positions' });

    expect(response.statusCode).toBe(400);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/positions.test.ts`
Expected: FAIL — `Cannot find module './positions.js'`

- [ ] **Step 4: Implement the route**

```typescript
// backend/src/routes/positions.ts
import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { createConnection } from '../lib/solanaConnection.js';

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export type VerifySignatureFn = (signature: string) => Promise<boolean>;

async function defaultVerifySignature(signature: string): Promise<boolean> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) return false;
  const connection = createConnection(rpcUrl);
  try {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (!status || status.err) return false;
    return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
  } catch {
    return false;
  }
}

interface SupabaseClientLike {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { code: string; message: string } | null }> | { error: { code: string; message: string } | null };
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts: { ascending: boolean }): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

export function registerPositionsRoutes(
  app: FastifyInstance,
  deps: { supabase?: SupabaseClientLike; verifySignature?: VerifySignatureFn } = {},
): void {
  function getSupabase(): SupabaseClientLike | undefined {
    if (deps.supabase) return deps.supabase;
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) return undefined;
    return createSupabaseAdmin(url, secretKey) as unknown as SupabaseClientLike;
  }
  const verifySignature = deps.verifySignature ?? defaultVerifySignature;

  app.post('/api/positions', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { walletAddress, poolAddress, txSignature } = body;

    if (!isValidPubkey(walletAddress) || !isValidPubkey(poolAddress) || typeof txSignature !== 'string' || txSignature.length < 64) {
      reply.code(400);
      return { error: 'Invalid walletAddress, poolAddress, or txSignature.' };
    }

    const supabase = getSupabase();
    if (!supabase) {
      reply.code(500);
      return { error: 'Server is missing Supabase configuration.' };
    }

    let verified: boolean;
    try {
      verified = await verifySignature(txSignature);
    } catch {
      reply.code(503);
      return { error: 'Solana RPC is unavailable right now.' };
    }

    if (!verified) {
      reply.code(422);
      return { error: 'Transaction is not confirmed on-chain.' };
    }

    const { error } = await supabase
      .from('positions')
      .insert({ wallet_address: walletAddress, pool_address: poolAddress, tx_signature: txSignature });

    if (error) {
      if (error.code === '23505') {
        return { ok: true, alreadyRecorded: true };
      }
      reply.code(503);
      return { error: 'Failed to save the position.' };
    }

    return { ok: true };
  });

  app.get('/api/positions', async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!isValidPubkey(wallet)) {
      reply.code(400);
      return { error: 'A valid wallet query parameter is required.' };
    }

    const supabase = getSupabase();
    if (!supabase) {
      reply.code(500);
      return { error: 'Server is missing Supabase configuration.' };
    }

    const { data, error } = await supabase
      .from('positions')
      .select('id, wallet_address, pool_address, tx_signature, created_at')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false });

    if (error) {
      reply.code(503);
      return { error: 'Failed to load positions.' };
    }

    return { positions: data ?? [] };
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/routes/positions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Wire the route into the server**

In `backend/src/server.ts`:
```typescript
import { registerPositionsRoutes } from './routes/positions.js';
```
```typescript
  registerPositionsRoutes(app);
```

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql backend/src/routes/positions.ts backend/src/routes/positions.test.ts backend/src/server.ts
git commit -m "feat(backend): add positions table and POST/GET /api/positions routes"
```

---

### Task 5: Frontend — Wallet adapter deps + `WalletContextProvider`

**Files:**
- Create: `frontend/src/lib/wallet/WalletContextProvider.tsx`
- Modify: `frontend/package.json`, `frontend/.env.example`

**Interfaces:**
- Produces: `function WalletContextProvider(props: { children: ReactNode }): JSX.Element` —
  wraps `ConnectionProvider` + `WalletProvider` (Phantom + Solflare, `autoConnect`).

- [ ] **Step 1: Install dependencies**

Run: `cd frontend && npm install @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-wallets @solana/wallet-adapter-base`

- [ ] **Step 2: Implement the provider**

```tsx
// frontend/src/lib/wallet/WalletContextProvider.tsx
import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

const SOLANA_RPC_URL = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ?? 'https://api.devnet.solana.com';

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 3: Add the RPC env var**

`frontend/.env.example` (append):
```
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/wallet/WalletContextProvider.tsx frontend/.env.example
git commit -m "feat(frontend): add Solana WalletContextProvider (Phantom + Solflare, devnet)"
```

---

### Task 6: Frontend — `WalletConnectButton` + nav wiring

**Files:**
- Create: `frontend/src/components/WalletConnectButton.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `useWallet()` from `@solana/wallet-adapter-react`; `WalletContextProvider`
  (Task 5).
- Produces: `function WalletConnectButton(): JSX.Element`.

- [ ] **Step 1: Implement the button**

```tsx
// frontend/src/components/WalletConnectButton.tsx
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { wallets, wallet, select, connect, disconnect, connecting, connected, publicKey } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSelect(walletName: (typeof wallets)[number]['adapter']['name']) {
    setPickerOpen(false);
    select(walletName);
  }

  if (connected && publicKey) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="rounded border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {shortenAddress(publicKey.toBase58())}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleConnectClick}
        disabled={connecting}
        className="rounded border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: 'var(--border)', background: 'var(--series-blue)', color: '#ffffff' }}
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
          className="absolute right-0 z-10 mt-1 rounded border text-sm"
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

- [ ] **Step 2: Wrap the app in `WalletContextProvider`**

In `frontend/src/App.tsx`, add the import and nest it (order: `WalletContextProvider` outside
`AuthProvider` — wallet connection is independent of Supabase auth, and `Layout`'s nav needs
both):

```tsx
import { WalletContextProvider } from './lib/wallet/WalletContextProvider';
```
```tsx
    <WalletContextProvider>
      <AuthProvider>
        <Layout>
          {/* existing <Routes> ... */}
        </Layout>
      </AuthProvider>
    </WalletContextProvider>
```

- [ ] **Step 3: Add the button to the nav**

In `frontend/src/components/Layout.tsx`, import `WalletConnectButton` and add it to the
`<nav>` block alongside the existing session-aware link:

```tsx
import { WalletConnectButton } from './WalletConnectButton';
```
```tsx
            <WalletConnectButton />
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WalletConnectButton.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): add WalletConnectButton to the header nav"
```

---

### Task 7: Frontend — API clients (`lib/api/liquidity.ts`, `lib/api/positions.ts`) + shared types

**Files:**
- Create: `frontend/src/types/liquidity.ts`
- Create: `frontend/src/lib/api/liquidity.ts`
- Create: `frontend/src/lib/api/positions.ts`
- Create: `frontend/src/lib/positionsRefresh.tsx`

**Interfaces:**
- Produces:
  - `interface Position { id: string; walletAddress: string; poolAddress: string; txSignature: string; createdAt: string }`
  - `interface BuildTxResponse { transaction: string; blockhash: string; lastValidBlockHeight: number }`
  - `function buildAddLiquidityTx(params: { poolAddress: string; amountX: string; amountY: string; minBinId: number; maxBinId: number; userPublicKey: string }): Promise<BuildTxResponse>`
  - `function createPosition(params: { walletAddress: string; poolAddress: string; txSignature: string }): Promise<void>`
  - `function fetchPositions(wallet: string): Promise<Position[]>`
  - `function PositionsRefreshProvider(props: { children: ReactNode }): JSX.Element`,
    `function usePositionsRefresh(): { version: number; bump: () => void }`

- [ ] **Step 1: Types**

```typescript
// frontend/src/types/liquidity.ts
export interface Position {
  id: string;
  walletAddress: string;
  poolAddress: string;
  txSignature: string;
  createdAt: string;
}

export interface BuildTxResponse {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
}
```

- [ ] **Step 2: `lib/api/liquidity.ts`**

```typescript
// frontend/src/lib/api/liquidity.ts
import type { BuildTxResponse } from '../../types/liquidity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function buildAddLiquidityTx(params: {
  poolAddress: string;
  amountX: string;
  amountY: string;
  minBinId: number;
  maxBinId: number;
  userPublicKey: string;
}): Promise<BuildTxResponse> {
  const response = await fetch(new URL('/api/liquidity/build-tx', API_BASE_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to build the transaction.');
  }
  return body as BuildTxResponse;
}
```

- [ ] **Step 3: `lib/api/positions.ts`**

```typescript
// frontend/src/lib/api/positions.ts
import type { Position } from '../../types/liquidity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function createPosition(params: { walletAddress: string; poolAddress: string; txSignature: string }): Promise<void> {
  const response = await fetch(new URL('/api/positions', API_BASE_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to save the position.');
  }
}

export async function fetchPositions(wallet: string): Promise<Position[]> {
  const url = new URL('/api/positions', API_BASE_URL);
  url.searchParams.set('wallet', wallet);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load positions.');
  }
  return (body.positions as Array<Record<string, string>>).map((row) => ({
    id: row.id,
    walletAddress: row.wallet_address,
    poolAddress: row.pool_address,
    txSignature: row.tx_signature,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 4: `lib/positionsRefresh.tsx`**

```tsx
// frontend/src/lib/positionsRefresh.tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

interface PositionsRefreshValue {
  version: number;
  bump: () => void;
}

const PositionsRefreshContext = createContext<PositionsRefreshValue | undefined>(undefined);

export function PositionsRefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  return <PositionsRefreshContext.Provider value={{ version, bump }}>{children}</PositionsRefreshContext.Provider>;
}

export function usePositionsRefresh(): PositionsRefreshValue {
  const ctx = useContext(PositionsRefreshContext);
  if (!ctx) throw new Error('usePositionsRefresh must be used within PositionsRefreshProvider');
  return ctx;
}
```

- [ ] **Step 5: Wrap the app in `PositionsRefreshProvider`**

In `frontend/src/App.tsx`, nest it inside `WalletContextProvider` (order doesn't matter
functionally between these two, but keep it inside `WalletContextProvider` and outside
`Layout` so both `AddLiquidityForm` and `MyPositionsPage` can consume it):

```tsx
import { PositionsRefreshProvider } from './lib/positionsRefresh';
```
```tsx
    <WalletContextProvider>
      <PositionsRefreshProvider>
        <AuthProvider>
          <Layout>{/* ... */}</Layout>
        </AuthProvider>
      </PositionsRefreshProvider>
    </WalletContextProvider>
```

- [ ] **Step 6: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/liquidity.ts frontend/src/lib/api/liquidity.ts frontend/src/lib/api/positions.ts frontend/src/lib/positionsRefresh.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add liquidity/positions API clients and PositionsRefreshProvider"
```

---

### Task 8: Frontend — `AddLiquidityForm` (build → sign → submit → confirm)

**Files:**
- Create: `frontend/src/components/AddLiquidityForm.tsx`
- Modify: `frontend/src/pages/PoolDetailPage.tsx`

**Interfaces:**
- Consumes: `useWallet()`, `useConnection()` (`@solana/wallet-adapter-react`);
  `buildAddLiquidityTx` (Task 7); `createPosition` (Task 7); `usePositionsRefresh` (Task 7).
- Produces: `function AddLiquidityForm(props: { poolAddress: string }): JSX.Element`.

- [ ] **Step 1: Implement the form**

```tsx
// frontend/src/components/AddLiquidityForm.tsx
import { useState, type FormEvent } from 'react';
import { Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { buildAddLiquidityTx } from '../lib/api/liquidity';
import { createPosition } from '../lib/api/positions';
import { usePositionsRefresh } from '../lib/positionsRefresh';

type FlowState = 'idle' | 'building' | 'awaiting-signature' | 'submitting' | 'confirming' | 'success' | 'error';

export function AddLiquidityForm({ poolAddress }: { poolAddress: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { bump } = usePositionsRefresh();

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
        poolAddress,
        amountX,
        amountY,
        minBinId: Number(minBinId),
        maxBinId: Number(maxBinId),
        userPublicKey: publicKey.toBase58(),
      });

      const tx = Transaction.from(Buffer.from(built.transaction, 'base64'));

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

      await createPosition({ walletAddress: publicKey.toBase58(), poolAddress, txSignature: sig });

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
    <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Add Liquidity (devnet)
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <input
          type="number"
          min="0"
          step="any"
          required
          placeholder="Amount X"
          value={amountX}
          onChange={(e) => setAmountX(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="number"
          min="0"
          step="any"
          required
          placeholder="Amount Y"
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
          className="col-span-2 rounded border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--border)', background: 'var(--series-blue)', color: '#ffffff' }}
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
            className="rounded border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {state === 'success' && signature ? (
        <p className="text-xs" style={{ color: 'var(--status-good)' }}>
          Confirmed —{' '}
          <a
            href={`https://solscan.io/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--series-blue)' }}
          >
            view on Solscan
          </a>
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `PoolDetailPage`**

In `frontend/src/pages/PoolDetailPage.tsx`, import `AddLiquidityForm` and `useWallet`, and
render the form only when connected (otherwise a short prompt), using the page's existing
pool-address variable (read the file first to match its exact prop/variable names before
editing — do not guess the pool address variable name).

```tsx
import { useWallet } from '@solana/wallet-adapter-react';
import { AddLiquidityForm } from '../components/AddLiquidityForm';
```
```tsx
{connected ? (
  <AddLiquidityForm poolAddress={pool.poolAddress} />
) : (
  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
    Connect a wallet to add liquidity to this pool.
  </p>
)}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AddLiquidityForm.tsx frontend/src/pages/PoolDetailPage.tsx
git commit -m "feat(frontend): add AddLiquidityForm with build/sign/submit/confirm flow"
```

---

### Task 9: Frontend — "My Positions" page + nav link

**Files:**
- Create: `frontend/src/pages/MyPositionsPage.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `useWallet()`; `fetchPositions` (Task 7); `usePositionsRefresh` (Task 7).
- Produces: `function MyPositionsPage(): JSX.Element`.

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/MyPositionsPage.tsx
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
    return (
      <div className="h-24 animate-pulse rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
    );
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
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        My Positions
      </h1>
      <ul className="space-y-2">
        {positions.map((position) => (
          <li
            key={position.id}
            className="rounded-lg border p-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            <p style={{ color: 'var(--text-primary)' }}>Pool: {position.poolAddress}</p>
            <p style={{ color: 'var(--text-muted)' }}>{new Date(position.createdAt).toLocaleString()}</p>
            <a
              href={`https://solscan.io/tx/${position.txSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--series-blue)' }}
            >
              View on Solscan
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add the route and nav link**

In `frontend/src/App.tsx`:
```tsx
import { MyPositionsPage } from './pages/MyPositionsPage';
```
```tsx
<Route path="/positions" element={<MyPositionsPage />} />
```

In `frontend/src/components/Layout.tsx`, add a nav link near the others:
```tsx
<Link to="/positions" style={{ color: 'var(--text-secondary)' }}>
  My Positions
</Link>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/MyPositionsPage.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): add My Positions page with auto-refresh after add liquidity"
```

---

### Task 10: End-to-end devnet verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm `defaultBuildTx`'s real SDK call shape**

Before any live test, revisit Task 3 Step 4's `defaultBuildTx` against the actually
installed `@meteora-ag/dlmm` version's type declarations (Task 3, Step 3) and correct any
method/parameter names that don't match. This is expected to require at least one fix — the
implementation in this plan was written without access to the SDK's real, current type
definitions.

- [ ] **Step 2: Prepare devnet funds and a real devnet DLMM pool address**

The user provides (do not fabricate): a Phantom or Solflare wallet set to devnet, funded via
`solana airdrop` or a devnet faucet, and a real, currently-existing devnet DLMM pool address
to test against (mainnet pool addresses will not work against `SOLANA_RPC_URL`'s devnet
cluster). If no devnet DLMM pool is known, report that back rather than inventing an address.

- [ ] **Step 3: Populate env vars**

`backend/.env`: `SOLANA_RPC_URL=https://api.devnet.solana.com` (already the default, confirm
present). `frontend/.env`: same for `VITE_SOLANA_RPC_URL`.

- [ ] **Step 4: Start both dev servers**

Run: `cd backend && npm run dev` (background)
Run: `cd frontend && npm run dev -- --port 5180` (background)

- [ ] **Step 5: Manual browser walkthrough (cannot be scripted — requires real wallet approval)**

1. Open the frontend, click "Connect Wallet," approve in Phantom/Solflare (devnet).
2. Confirm the header shows the shortened address.
3. Navigate to a pool detail page for the real devnet pool from Step 2, fill the add-liquidity
   form with small amounts and a valid bin range, submit.
4. Approve the signature prompt in the wallet.
5. Confirm the UI moves through submitting → confirming → success, and shows a working
   Solscan devnet link.
6. Navigate to "My Positions," confirm the new position appears without a manual refresh
   (or appears immediately on load if navigated to after the fact) — this proves
   `PositionsRefreshContext`/the fetch-on-mount path both work.
7. Take screenshots of each state (connect, form, success, positions list) via Playwright or
   manually, and report any step that failed rather than proceeding past it.

- [ ] **Step 6: Report findings**

If `defaultBuildTx` needed corrections beyond what Step 1 anticipated, or any validation
bound (bin span, slippage) rejected a legitimate real-world input, note the specific fix
made and why, so the design spec's assumptions can be corrected for future reference.

---

## Self-Review Notes

- **Spec coverage:** wallet connect (Task 5-6), build-tx endpoint with server-side validation
  (Task 2-3), sign & submit with 3-state-plus UI and retry (Task 8), Solscan link (Task 8),
  persist position with independent on-chain verification (Task 4), positions list with
  auto-refresh (Task 7 `PositionsRefreshContext`, Task 9), devnet-only defaults everywhere
  (Tasks 1, 5), backend never signs (Task 3's `defaultBuildTx` stops at `serialize({
  requireAllSignatures: false })`) — all spec sections are covered.
- **Explicit uncertainty, not hidden:** Task 3's `defaultBuildTx` and Task 2's bin-span
  constant are marked as best-effort against the real `@meteora-ag/dlmm` API, with required
  steps (Task 2 Step 1, Task 3 Step 3, Task 10 Step 1) to verify and correct against the
  actually-installed package before the live devnet run — this is called out rather than
  presented as certain, since no network access was available while writing this plan to
  confirm the SDK's current exact method signatures.
- **Type consistency:** `Position`/`BuildTxResponse` (Task 7) are the single shared shape
  used by `AddLiquidityForm` (Task 8) and `MyPositionsPage` (Task 9) — no per-component
  duplicate type definitions.
- **No placeholders left unflagged:** every step has runnable code; the one open item
  (exact SDK call shape) is explicitly flagged at every point it appears, not silently
  assumed correct.
