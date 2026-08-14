# Dark Terminal Redesign — Login, Signup, Account Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `LoginPage`, `SignupPage`, and `AccountPage` from the old light-theme tokens
to the dark terminal design system already established on this branch — pure token migration,
no behavior/data changes.

**Architecture:** These three files, plus the 5 files covered by the not-yet-written Plan F
(Forex/Gold Signal page), are the last remaining files on this branch still referencing tokens
that are undefined in `frontend/src/index.css` as of this branch (confirmed by Plan D's final
whole-plan review, which independently grepped the entire `frontend/src` tree and by a fresh
grep run while writing this plan — both found exactly these 8 files). `WalletConnectButton.tsx`
— the only other file the original spec called out under "wallet-connect UI" — was already
fully migrated during Plan B's Task 4 scope extension; grepped clean while writing this plan,
confirmed no work remains there. There is no Figma Make mockup reference for these three pages
(the reference project has no login/signup/account screens) — per the user's standing "restyle
everything to match" decision, this plan extrapolates the established visual language (dark
`--card` panels, `--green` accents, `PillButton`) rather than inventing a new one.

**Tech Stack:** React 19, TypeScript, Tailwind v4 — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-dark-terminal-redesign-design.md`

## Global Constraints

- Every themed color is a CSS variable via `var(--token)` — never a hardcoded hex.
- Established old→new token mapping (verify each against `frontend/src/index.css` if in doubt):
  `--surface-1`→`--card`, `--text-primary`→`--text`, `--text-secondary`→`--text` (bold
  headings) or `--muted` (regular-weight body/captions — judge by font-weight), `--text-muted`→
  `--muted`, `--status-critical`→`--red`, `--accent`→`--green`.
- `--dim` must never be used for text (this exact mistake has recurred twice already on this
  branch, both times caught and fixed in a final review — do not introduce it a third time).
- `PillButton`'s `variant="solid"` (green background, `--green-fg` text) and default
  `variant="tinted"` (subtle green background, `--green` text) are both already correct as
  defined in `frontend/src/components/PillButton.tsx` — do not modify that file, only use the
  component as-is.
- Email/password `<input>` fields are user-entered natural-language text, not displayed data
  values — do NOT add `font-mono` to them (this differs from, e.g., the coin-ticker filter
  input on the News page, which is a data value and does get `font-mono`).
- No prop/export signature changes to any component in this plan.
- No change to any `useEffect`, `fetch` call, auth-context usage, or loading/error/empty state
  machine — styling only.
- This frontend has zero `.test.tsx` files (established project convention) — no test file
  expected for any task in this plan.

---

### Task 1: Restyle `LoginPage.tsx` and `SignupPage.tsx`

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/SignupPage.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`signIn`/`signUp`, unchanged), `PillButton` (unchanged props).
- Produces: no exports change.

No test file — verification is `npx tsc -b` plus a real manual visual check (Step 3).

- [ ] **Step 1: Replace `LoginPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { PillButton } from '../components/PillButton';

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
    <div className="page-enter mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Log in
      </h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
        />
        {error ? (
          <p className="text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        ) : null}
        <PillButton type="submit" variant="solid" disabled={submitting} className="w-full text-sm">
          {submitting ? 'Logging in...' : 'Log in'}
        </PillButton>
      </form>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Don't have an account?{' '}
        <Link to="/signup" style={{ color: 'var(--green)' }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

(`focus:ring-2 focus:ring-[var(--green)]` added to both inputs — matches the focus-indicator
precedent already established for the News-page search input and the Pools search input
earlier on this branch, since `outline-none` alone removes the browser's default focus ring
with nothing replacing it.)

- [ ] **Step 2: Replace `SignupPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { PillButton } from '../components/PillButton';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error, needsConfirmation } = await signUp(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    if (needsConfirmation) {
      setConfirmationSent(true);
      return;
    }
    navigate('/account');
  }

  return (
    <div className="page-enter mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Sign up
      </h1>
      {confirmationSent ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Check your email to confirm your account, then{' '}
          <Link to="/login" style={{ color: 'var(--green)' }}>
            log in
          </Link>
          .
        </p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
            />
            {error ? (
              <p className="text-xs" style={{ color: 'var(--red)' }}>
                {error}
              </p>
            ) : null}
            <PillButton type="submit" variant="solid" disabled={submitting} className="w-full text-sm">
              {submitting ? 'Signing up...' : 'Sign up'}
            </PillButton>
          </form>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--green)' }}>
              Log in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
```

(The `confirmationSent` branch's message keeps `page-enter` from the shared outer div, since
both branches share the same root element here — unlike `MyPositionsPage.tsx`'s multiple
early-return branches, this component has one root div wrapping a conditional, not several
separate returns.)

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the real dev server, navigate to `/login` and `/signup`. Confirm both render on the dark
palette, the form inputs show a visible green focus ring when tabbed/clicked into, submitting
with invalid/missing credentials shows the error message in red, and the Log in ⇄ Sign up
cross-links work. Take real, freshly-timestamped screenshots (with independently-checked
filesystem timestamps, cited in the report) of both pages — do not predict "expected" visual
changes from the code, and do not reuse any pre-existing screenshot file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/SignupPage.tsx
git commit -m "feat(frontend): restyle Login and Signup pages for the dark terminal look"
```

---

### Task 2: Restyle `AccountPage.tsx`

**Files:**
- Modify: `frontend/src/pages/AccountPage.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`session`/`loading`/`signOut`, unchanged), `PillButton` (unchanged
  props).
- Produces: no exports change.

No test file — verification is `npx tsc -b` plus a real manual visual check (Step 3).

- [ ] **Step 1: Replace `AccountPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { PillButton } from '../components/PillButton';

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
        if (response.status === 401) {
          await signOut();
          if (!cancelled) navigate('/login');
          return;
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new Error('Failed to load account.');
        }

        if (!response.ok) {
          const message = typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : 'Failed to load account.';
          throw new Error(message);
        }

        if (cancelled) return;
        setEmail((body as { email: string }).email);
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
  }, [session, loading, navigate, signOut]);

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  if (loading || status === 'loading') {
    return <div className="h-24 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />;
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        My Account
      </h1>
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--muted)' }}>Signed in as</p>
        <p className="font-semibold" style={{ color: 'var(--text)' }}>
          {email}
        </p>
      </div>
      <PillButton onClick={handleLogout} className="text-xs">
        Log out
      </PillButton>
    </div>
  );
}
```

(`page-enter` added only to the `ready` branch's root div, not the loading/error early
returns — matches the precedent already established on `PoolDetailPage.tsx` and
`MyPositionsPage.tsx` earlier on this branch.)

- [ ] **Step 2: Typecheck and manual verification**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

Start the real dev server. This route is session-gated (`useAuth`) — if you can log in using
the credentials flow from Task 1 (or an existing test account, if one is available in this
environment), navigate to `/account` and take a real, freshly-timestamped screenshot of the
`ready` state showing the signed-in email and Log out button. If no session can be established
in this environment, that's an acceptable, expected limitation — say so plainly in your report
rather than fabricating what the ready state looks like, and instead verify what you can reach:
navigating to `/account` while logged out should redirect to `/login` (confirms the `useEffect`
guard still fires correctly), which is itself a real, screenshot-able check.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AccountPage.tsx
git commit -m "feat(frontend): restyle Account page for the dark terminal look"
```

## Verification

1. `cd frontend && npx tsc -b && npm run build` — clean, both succeed.
2. `grep -rn "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\b\|var(--accent-bg\|var(--accent-fg\|var(--status-\|var(--dim)" frontend/src/pages/LoginPage.tsx frontend/src/pages/SignupPage.tsx frontend/src/pages/AccountPage.tsx` returns zero matches.
3. Repo-wide gate for this plan's specific claim (that these are the last 3 files of this
   category — the other 5 remaining old-token files belong to Plan F, not this plan):
   `grep -rln "var(--text-primary\|var(--text-secondary\|var(--text-muted\|var(--surface-1\|var(--surface-page\|var(--accent\b\|var(--accent-bg\|var(--accent-fg\|var(--status-" frontend/src` should, after this plan, list only `MarketSignalPage.tsx`, `DirectionSignal.tsx`, `FundamentalsPanel.tsx`, `MarketNewsList.tsx`, `PriceChart.tsx` — Plan F's scope, not this plan's.
4. Manual verification: real dev server, screenshots of Login, Signup (both the form and the
   post-signup confirmation message if reachable), and Account (ready state if a session can be
   established, otherwise the logged-out-redirect behavior) — every screenshot cited in any task
   report must have its timestamp independently checked before being cited as evidence, per this
   branch's established verification discipline.
