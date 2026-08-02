# Auth + Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real user accounts (signup/login/logout) backed by Supabase (Postgres + Supabase Auth), proven by one genuinely protected endpoint/page (`/account`) that a Fastify backend hook verifies server-side.

**Architecture:** Frontend talks to Supabase Auth directly via `@supabase/supabase-js` for signup/login/logout/session (no custom `/login` endpoint on our backend). The backend adds one verification hook that checks a Bearer token against Supabase's Auth API and gates a single new endpoint, `GET /api/account/me`. No custom database tables are created — Supabase's built-in `auth.users` is sufficient for this module's scope.

**Tech Stack:** `@supabase/supabase-js` (frontend and backend), existing Fastify + TypeScript + Vitest backend, existing React + TypeScript + Tailwind + React Router frontend.

## Global Constraints

- `SUPABASE_SECRET_KEY` must never reach frontend code or version control — backend-only, in `backend/.env`, exactly like every other secret in this project.
- `VITE_SUPABASE_PUBLISHABLE_KEY` is safe in frontend code (designed to be public).
- No custom `profiles` or other database tables in this module — Supabase's built-in `auth.users` (id + email) is the only user data used here.
- The frontend never sends a password to our own backend — signup/login/logout go directly through `@supabase/supabase-js` to Supabase. Our backend only ever sees a bearer access token, never credentials.
- CORS stays `origin: true` (unchanged, deliberate — see the design spec's Security notes: this project uses Bearer tokens, not cookies, so the cookie-based CSRF risk open CORS would otherwise create doesn't apply).
- Backend code must follow the existing dependency-injection pattern from `backend/src/services/bybit.ts`/`coingecko.ts` and `backend/src/routes/news.ts` (an optional `deps` parameter, defaulting to a real implementation, so tests never call the real Supabase API) and the existing "missing config → 500, not a startup crash" pattern from the project's earlier CryptoPanic-era route design.
- Follow existing frontend code style: function components, inline `style={{ color: 'var(--...)' }}` for design tokens, reuse existing patterns (`NewsPage.tsx`'s `cancelled`-flag fetch-cleanup pattern, `Layout.tsx`'s nav structure).

---

## File Structure

**Backend (`backend/src/`):**
- Create `middleware/requireAuth.ts` — the Fastify auth hook, its result-type contract (`AuthResult`, `VerifyTokenFn`), and the `FastifyRequest.user` type augmentation. Fully unit-testable with a fake `VerifyTokenFn` — no real Supabase dependency.
- Create `middleware/requireAuth.test.ts`
- Create `lib/supabaseAdmin.ts` — the real Supabase admin client factory and the adapter (`createVerifyToken`) that translates Supabase's actual `auth.getUser()` response shape into `AuthResult`. This is the only file that touches the real `@supabase/supabase-js` client.
- Create `lib/supabaseAdmin.test.ts` — tests the translation logic with a fake Supabase-shaped object, not the real network.
- Create `routes/account.ts` — registers `GET /api/account/me`.
- Create `routes/account.test.ts`
- Modify `server.ts` — wire `registerAccountRoutes` alongside the existing `registerNewsRoutes`/`registerScreenerRoutes` calls.
- Modify `.env.example` — add `SUPABASE_URL=` and `SUPABASE_SECRET_KEY=`.
- Modify `package.json` — add `@supabase/supabase-js`.

**Frontend (`frontend/src/`):**
- Create `lib/supabase.ts` — the Supabase client singleton.
- Create `lib/auth/AuthContext.tsx` — the `AuthProvider` and `useAuth()` hook.
- Create `pages/SignupPage.tsx`
- Create `pages/LoginPage.tsx`
- Create `pages/AccountPage.tsx`
- Modify `App.tsx` — wrap the app in `AuthProvider`, add `/signup`, `/login`, `/account` routes.
- Modify `components/Layout.tsx` — nav shows "Login" when signed out, or the user's email linking to "My Account" when signed in.
- Modify `.env.example` — add `VITE_SUPABASE_URL=` and `VITE_SUPABASE_PUBLISHABLE_KEY=`.
- Modify `package.json` — add `@supabase/supabase-js`.

---

### Task 1: Backend — `requireAuth` hook (pure, fully DI-testable)

**Files:**
- Create: `backend/src/middleware/requireAuth.ts`
- Test: `backend/src/middleware/requireAuth.test.ts`

**Interfaces:**
- Produces:
  - `interface AuthenticatedUser { id: string; email: string }`
  - `type AuthResult = { kind: 'ok'; user: AuthenticatedUser } | { kind: 'invalid' } | { kind: 'unavailable' }`
  - `type VerifyTokenFn = (token: string) => Promise<AuthResult>`
  - `function createRequireAuth(verifyToken: VerifyTokenFn | undefined): (request: FastifyRequest, reply: FastifyReply) => Promise<void>` — a Fastify `preHandler`.
  - A `declare module 'fastify' { interface FastifyRequest { user?: AuthenticatedUser } }` augmentation.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/middleware/requireAuth.test.ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createRequireAuth } from './requireAuth.js';
import type { AuthResult } from './requireAuth.js';

function buildApp(verifyToken: ((token: string) => Promise<AuthResult>) | undefined) {
  const app = Fastify();
  const requireAuth = createRequireAuth(verifyToken);
  app.get('/protected', { preHandler: requireAuth }, async (request) => {
    return { email: request.user!.email };
  });
  return app;
}

describe('createRequireAuth', () => {
  it('returns 500 when verifyToken is not configured', async () => {
    const app = buildApp(undefined);

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Server is missing Supabase configuration.' });
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const app = buildApp(async () => ({ kind: 'ok', user: { id: '1', email: 'a@b.com' } }));

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Missing bearer token.' });
  });

  it('returns 401 when the Authorization header is not a Bearer token', async () => {
    const app = buildApp(async () => ({ kind: 'ok', user: { id: '1', email: 'a@b.com' } }));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc123' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when verifyToken reports the token is invalid', async () => {
    const app = buildApp(async () => ({ kind: 'invalid' }));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer bad-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid or expired session.' });
  });

  it('returns 503 when verifyToken reports the auth service is unavailable', async () => {
    const app = buildApp(async () => ({ kind: 'unavailable' }));

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer some-token' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Auth service is unavailable right now.' });
  });

  it('attaches the user to the request and lets the route handler run when the token is valid', async () => {
    const app = buildApp(async (token) => {
      expect(token).toBe('good-token');
      return { kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'me@example.com' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/middleware/requireAuth.test.ts`
Expected: FAIL — `Cannot find module './requireAuth.js'`

- [ ] **Step 3: Implement the hook**

```typescript
// backend/src/middleware/requireAuth.ts
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthResult = { kind: 'ok'; user: AuthenticatedUser } | { kind: 'invalid' } | { kind: 'unavailable' };

export type VerifyTokenFn = (token: string) => Promise<AuthResult>;

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function createRequireAuth(verifyToken: VerifyTokenFn | undefined) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!verifyToken) {
      reply.code(500).send({ error: 'Server is missing Supabase configuration.' });
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing bearer token.' });
      return;
    }

    const token = authHeader.slice('Bearer '.length);
    const result = await verifyToken(token);

    if (result.kind === 'unavailable') {
      reply.code(503).send({ error: 'Auth service is unavailable right now.' });
      return;
    }
    if (result.kind === 'invalid') {
      reply.code(401).send({ error: 'Invalid or expired session.' });
      return;
    }

    request.user = result.user;
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/middleware/requireAuth.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/requireAuth.ts backend/src/middleware/requireAuth.test.ts
git commit -m "feat(backend): add requireAuth Fastify hook with injectable token verification"
```

---

### Task 2: Backend — Supabase admin adapter

**Files:**
- Create: `backend/src/lib/supabaseAdmin.ts`
- Test: `backend/src/lib/supabaseAdmin.test.ts`
- Modify: `backend/package.json` (add `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `AuthResult`, `VerifyTokenFn` from Task 1 (`../middleware/requireAuth.js`).
- Produces:
  - `function createSupabaseAdmin(url: string, secretKey: string): SupabaseClient` (from `@supabase/supabase-js`).
  - `function createVerifyToken(admin: SupabaseClient): VerifyTokenFn` — the adapter Task 3's route wiring and Task 1's hook both rely on.

- [ ] **Step 1: Install the dependency**

Run: `cd backend && npm install @supabase/supabase-js`
Expected: package installed, `backend/package.json` and `backend/package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

```typescript
// backend/src/lib/supabaseAdmin.test.ts
import { describe, expect, it } from 'vitest';
import { createVerifyToken } from './supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

function fakeAdmin(
  getUser: (token: string) => Promise<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>,
): SupabaseClient {
  return { auth: { getUser } } as unknown as SupabaseClient;
}

describe('createVerifyToken', () => {
  it('returns ok with the user id/email when Supabase confirms the token', async () => {
    const admin = fakeAdmin(async (token) => {
      expect(token).toBe('good-token');
      return { data: { user: { id: 'user-1', email: 'me@example.com' } }, error: null };
    });
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('good-token');

    expect(result).toEqual({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } });
  });

  it('returns invalid when Supabase returns an error', async () => {
    const admin = fakeAdmin(async () => ({ data: { user: null }, error: { message: 'invalid JWT' } }));
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('bad-token');

    expect(result).toEqual({ kind: 'invalid' });
  });

  it('returns invalid when Supabase returns no error but also no user', async () => {
    const admin = fakeAdmin(async () => ({ data: { user: null }, error: null }));
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('weird-token');

    expect(result).toEqual({ kind: 'invalid' });
  });

  it('returns unavailable when the Supabase call throws (network failure)', async () => {
    const admin = fakeAdmin(async () => {
      throw new Error('ECONNREFUSED');
    });
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('any-token');

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('falls back to an empty string email when Supabase omits it', async () => {
    const admin = fakeAdmin(async () => ({ data: { user: { id: 'user-2' } }, error: null }));
    const verifyToken = createVerifyToken(admin);

    const result = await verifyToken('token');

    expect(result).toEqual({ kind: 'ok', user: { id: 'user-2', email: '' } });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/lib/supabaseAdmin.test.ts`
Expected: FAIL — `Cannot find module './supabaseAdmin.js'`

- [ ] **Step 4: Implement the adapter**

```typescript
// backend/src/lib/supabaseAdmin.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthResult, VerifyTokenFn } from '../middleware/requireAuth.js';

export function createSupabaseAdmin(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey);
}

export function createVerifyToken(admin: SupabaseClient): VerifyTokenFn {
  return async (token: string): Promise<AuthResult> => {
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) {
        return { kind: 'invalid' };
      }
      return { kind: 'ok', user: { id: data.user.id, email: data.user.email ?? '' } };
    } catch {
      return { kind: 'unavailable' };
    }
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/lib/supabaseAdmin.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/lib/supabaseAdmin.ts backend/src/lib/supabaseAdmin.test.ts
git commit -m "feat(backend): add Supabase admin client and token-verification adapter"
```

---

### Task 3: Backend — `/api/account/me` route and server wiring

**Files:**
- Create: `backend/src/routes/account.ts`
- Test: `backend/src/routes/account.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `createRequireAuth`, `VerifyTokenFn` (Task 1); `createSupabaseAdmin`, `createVerifyToken` (Task 2).
- Produces: `function registerAccountRoutes(app: FastifyInstance, deps?: { verifyToken?: VerifyTokenFn }): void`, mounting `GET /api/account/me`.

- [ ] **Step 1: Write the failing route tests**

```typescript
// backend/src/routes/account.test.ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAccountRoutes } from './account.js';

describe('GET /api/account/me', () => {
  it("returns the authenticated user's email on success", async () => {
    const app = Fastify();
    registerAccountRoutes(app, {
      verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/account/me',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'me@example.com' });
  });

  it('returns 401 when no token is provided', async () => {
    const app = Fastify();
    registerAccountRoutes(app, {
      verifyToken: async () => ({ kind: 'ok', user: { id: 'user-1', email: 'me@example.com' } }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/account/me' });

    expect(response.statusCode).toBe(401);
  });

  it('returns 500 when Supabase configuration is missing', async () => {
    const app = Fastify();
    registerAccountRoutes(app, {});

    const response = await app.inject({ method: 'GET', url: '/api/account/me' });

    expect(response.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/routes/account.test.ts`
Expected: FAIL — `Cannot find module './account.js'`

- [ ] **Step 3: Implement the route**

```typescript
// backend/src/routes/account.ts
import type { FastifyInstance } from 'fastify';
import { createRequireAuth, type VerifyTokenFn } from '../middleware/requireAuth.js';
import { createSupabaseAdmin, createVerifyToken } from '../lib/supabaseAdmin.js';

export function registerAccountRoutes(app: FastifyInstance, deps: { verifyToken?: VerifyTokenFn } = {}): void {
  let verifyToken = deps.verifyToken;

  if (!verifyToken) {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (url && secretKey) {
      verifyToken = createVerifyToken(createSupabaseAdmin(url, secretKey));
    }
  }

  const requireAuth = createRequireAuth(verifyToken);

  app.get('/api/account/me', { preHandler: requireAuth }, async (request) => {
    return { email: request.user!.email };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/routes/account.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire the route into the server**

In `backend/src/server.ts`, add the import and registration call alongside the existing ones:

```typescript
import { registerAccountRoutes } from './routes/account.js';
```

```typescript
  registerNewsRoutes(app);
  registerScreenerRoutes(app);
  registerAccountRoutes(app);
```

- [ ] **Step 6: Add the Supabase env vars to `.env.example`**

`backend/.env.example` (append to the existing content):
```
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

- [ ] **Step 7: Manual verification against the real Supabase project**

The user has already created a Supabase project and populated `backend/.env` with real `SUPABASE_URL`/`SUPABASE_SECRET_KEY` values (do not ask them to paste these values into chat — read the file directly if you need to confirm it's populated, never echo its contents back).

Run: `cd backend && npm run dev` (background)
Then: `curl -s -w "\nHTTP %{http_code}\n" http://localhost:4000/api/account/me`
Expected: `HTTP 401` with `{"error":"Missing bearer token."}` (proves the route is live and wired to a real Supabase client, since a missing-config 500 would appear instead if the env vars weren't loaded).

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/account.ts backend/src/routes/account.test.ts backend/src/server.ts backend/.env.example
git commit -m "feat(backend): wire GET /api/account/me route into the server"
```

---

### Task 4: Frontend — Supabase client and env setup

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Modify: `frontend/.env.example`
- Modify: `frontend/package.json` (add `@supabase/supabase-js`)

**Interfaces:**
- Produces: `export const supabase: SupabaseClient` — the singleton every later frontend task imports.

- [ ] **Step 1: Install the dependency**

Run: `cd frontend && npm install @supabase/supabase-js`
Expected: package installed, `frontend/package.json` and `frontend/package-lock.json` updated.

- [ ] **Step 2: Create the Supabase client**

```typescript
// frontend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

- [ ] **Step 3: Add the env vars to `.env.example`**

`frontend/.env.example` (append to the existing content):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/supabase.ts frontend/.env.example
git commit -m "feat(frontend): add Supabase client singleton"
```

---

### Task 5: Frontend — AuthContext (provider + hook)

**Files:**
- Create: `frontend/src/lib/auth/AuthContext.tsx`

**Interfaces:**
- Consumes: `supabase` from Task 4.
- Produces:
  - `function AuthProvider(props: { children: ReactNode }): JSX.Element`
  - `function useAuth(): { session: Session | null; loading: boolean; signUp: (email: string, password: string) => Promise<{ error: string | null }>; signIn: (email: string, password: string) => Promise<{ error: string | null }>; signOut: () => Promise<void> }`

- [ ] **Step 1: Implement the provider and hook**

```tsx
// frontend/src/lib/auth/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return <AuthContext.Provider value={{ session, loading, signUp, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/auth/AuthContext.tsx
git commit -m "feat(frontend): add AuthProvider and useAuth hook"
```

---

### Task 6: Frontend — SignupPage and LoginPage

**Files:**
- Create: `frontend/src/pages/SignupPage.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 5).
- Produces: `function SignupPage(): JSX.Element`, `function LoginPage(): JSX.Element` — both navigate to `/account` on success.

- [ ] **Step 1: Implement SignupPage**

```tsx
// frontend/src/pages/SignupPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/account');
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Sign up
      </h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        {error ? (
          <p className="text-xs" style={{ color: 'var(--status-critical)' }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--border)', background: 'var(--series-blue)', color: '#ffffff' }}
        >
          {submitting ? 'Signing up...' : 'Sign up'}
        </button>
      </form>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--series-blue)' }}>
          Log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Implement LoginPage**

```tsx
// frontend/src/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/account');
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Log in
      </h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
        />
        {error ? (
          <p className="text-xs" style={{ color: 'var(--status-critical)' }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--border)', background: 'var(--series-blue)', color: '#ffffff' }}
        >
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Don't have an account?{' '}
        <Link to="/signup" style={{ color: 'var(--series-blue)' }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SignupPage.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat(frontend): add SignupPage and LoginPage"
```

---

### Task 7: Frontend — AccountPage

**Files:**
- Create: `frontend/src/pages/AccountPage.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 5). Calls the backend's `GET /api/account/me` (Task 3) directly with `fetch`, attaching `Authorization: Bearer <session.access_token>`.
- Produces: `function AccountPage(): JSX.Element`.

- [ ] **Step 1: Implement AccountPage**

```tsx
// frontend/src/pages/AccountPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export function AccountPage() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    fetch(new URL('/api/account/me', API_BASE_URL).toString(), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load account.');
        }
        return body as { email: string };
      })
      .then((body) => {
        if (cancelled) return;
        setEmail(body.email);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load account.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [session, loading, navigate]);

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  if (loading || status === 'loading') {
    return (
      <div className="h-24 animate-pulse rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        My Account
      </h1>
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Signed in as</p>
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {email}
        </p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded border px-3 py-1.5 text-sm font-medium"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        Log out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AccountPage.tsx
git commit -m "feat(frontend): add AccountPage calling the protected /api/account/me endpoint"
```

---

### Task 8: Frontend — wire AuthProvider, routes, and nav

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` (Task 5); `SignupPage`, `LoginPage` (Task 6); `AccountPage` (Task 7).

- [ ] **Step 1: Wrap the app in AuthProvider and add the new routes**

```tsx
// frontend/src/App.tsx
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { Layout } from './components/Layout';
import { PoolListPage } from './pages/PoolListPage';
import { PoolDetailPage } from './pages/PoolDetailPage';
import { NewsPage } from './pages/NewsPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { SignupPage } from './pages/SignupPage';
import { LoginPage } from './pages/LoginPage';
import { AccountPage } from './pages/AccountPage';

function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<PoolListPage />} />
          <Route path="/pools/:poolId" element={<PoolDetailPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/screener" element={<ScreenerPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}

export default App;
```

- [ ] **Step 2: Update the nav to reflect auth state**

In `frontend/src/components/Layout.tsx`, add the `useAuth` import and replace the `<nav>` block:

```tsx
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link to="/" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              DLMM Pool Analytics
            </Link>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Meteora DLMM pools on Solana — TVL, volume, fee APR & impermanent loss
            </p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link to="/" style={{ color: 'var(--text-secondary)' }}>
              Pools
            </Link>
            <Link to="/news" style={{ color: 'var(--text-secondary)' }}>
              News
            </Link>
            <Link to="/screener" style={{ color: 'var(--text-secondary)' }}>
              Screener
            </Link>
            {session ? (
              <Link to="/account" style={{ color: 'var(--text-secondary)' }}>
                {session.user.email}
              </Link>
            ) : (
              <Link to="/login" style={{ color: 'var(--text-secondary)' }}>
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): wire AuthProvider, auth routes, and auth-aware nav"
```

---

### Task 9: End-to-end verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start both dev servers**

Run: `cd backend && npm run dev` (background; requires `backend/.env` populated with real `SUPABASE_URL`/`SUPABASE_SECRET_KEY` — already done)
Run: `cd frontend && npm run dev -- --port 5180` (background; requires `frontend/.env` populated with real `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` — already done)

- [ ] **Step 2: Confirm the backend's account endpoint is live**

Run: `curl -s -w "\nHTTP %{http_code}\n" http://localhost:4000/api/account/me`
Expected: `HTTP 401` (route is live, just no token supplied — this confirms real Supabase wiring, not a 500 config-missing response).

- [ ] **Step 3: Drive the full signup → account → logout → login flow with Playwright**

Use a real, throwaway email (e.g. `test+<random>@example.com` — Supabase's default settings typically don't require email confirmation for new projects, but if the signup redirects to a "check your email" state instead of landing on `/account`, note that in your report rather than treating it as a failure — it means email confirmation is enabled on this Supabase project, which is a legitimate project setting, not a bug).

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

const testEmail = `test+${Date.now()}@example.com`;
const testPassword = 'test-password-123';

await page.goto('http://localhost:5180/signup', { waitUntil: 'networkidle', timeout: 30000 });
await page.fill('input[type="email"]', testEmail);
await page.fill('input[type="password"]', testPassword);
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'auth-after-signup.png', fullPage: true });

// If signup landed on /account directly (no email confirmation required):
if (page.url().includes('/account')) {
  await page.waitForSelector('text=My Account');
  await page.screenshot({ path: 'auth-account-page.png', fullPage: true });

  await page.click('text=Log out');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'auth-after-logout.png', fullPage: true });

  await page.goto('http://localhost:5180/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'auth-after-login.png', fullPage: true });
}

console.log('ERRORS:', JSON.stringify(errors));
console.log('FINAL URL:', page.url());
await browser.close();
```

Expected: `auth-after-signup.png` shows either the account page (if no email confirmation required) or a Supabase-driven "check your email" state; if the flow proceeded, `auth-account-page.png` shows the signed-up email rendered from the real backend call, `auth-after-logout.png` shows the nav reverting to "Login", and `auth-after-login.png` shows the account page again after re-authenticating. `ERRORS` is `[]` throughout.

- [ ] **Step 4: Clean up**

Remove any temporary screenshot script files from `frontend/` (keep screenshots only in a scratch/temp directory, not committed to the repo). If a test user was created in the Supabase project during this verification, note it in your report — deleting it isn't required for a portfolio-scale project, but the user should know it exists (Supabase dashboard → Authentication → Users). No commit needed for this task — it's verification only.

---

## Self-Review Notes

- **Spec coverage:** Supabase Auth via `@supabase/supabase-js` on the frontend (Tasks 4-6), backend token verification via `auth.getUser()` (Tasks 1-2), one protected endpoint (Task 3), one protected page proving the loop (Task 7), auth-aware nav (Task 8), no custom database tables (verified: no task creates one), `SUPABASE_SECRET_KEY` backend-only (Task 2/3 only reference `process.env` server-side, never in any frontend file), Bearer-token-not-cookie pattern (Task 7's `fetch` call), manual end-to-end browser verification (Task 9) — all spec sections are covered.
- **No placeholders:** every step has complete, runnable code.
- **Type consistency:** `AuthResult`/`VerifyTokenFn`/`AuthenticatedUser` (Task 1) are reused verbatim by `supabaseAdmin.ts` (Task 2), `routes/account.ts` (Task 3) — no renaming across tasks. The `{ email: string }` shape returned by `GET /api/account/me` (Task 3) matches exactly what `AccountPage.tsx` (Task 7) destructures — no field renaming needed, consistent with every prior module in this project.
