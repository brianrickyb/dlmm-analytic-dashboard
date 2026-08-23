import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './AuthContext';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: authMocks },
}));

function fakeSession(userId: string): Session {
  return {
    access_token: 'token',
    token_type: 'bearer',
    expires_in: 3600,
    expiresAt: 9999999999,
    user: { id: userId, email: `u${userId}@x.dev`, aud: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
  } as unknown as Session;
}

// Renders nothing but captures the latest context value so tests can drive the API.
let latest: ReturnType<typeof useAuth>;
function Probe() {
  latest = useAuth();
  return <div>{latest.loading ? 'loading' : latest.session ? 'has-session' : 'no-session'}</div>;
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  it('restores an existing session on mount and stops loading', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: fakeSession('u1') } });
    const unsubscribe = vi.fn();
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });

    renderAuth();

    await waitFor(() => expect(screen.getByText('has-session')).toBeInTheDocument());
    expect(authMocks.getSession).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled(); // subscription lives until unmount
  });

  it('ends with no session and not loading when Supabase has none', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    renderAuth();

    await waitFor(() => expect(screen.getByText('no-session')).toBeInTheDocument());
  });

  it('survives a failing getSession without crashing (treated as signed out)', async () => {
    authMocks.getSession.mockRejectedValue(new Error('network down'));
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    renderAuth();

    await waitFor(() => expect(screen.getByText('no-session')).toBeInTheDocument());
  });

  it('signUp reports needsConfirmation when no session comes back (email confirmation required)', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    authMocks.signUp.mockResolvedValue({ data: { session: null }, error: null });

    renderAuth();
    await waitFor(() => expect(latest.loading).toBe(false));

    const result = await latest.signUp('a@b.dev', 'hunter2hunter2');
    expect(result).toEqual({ error: null, needsConfirmation: true });
  });

  it('signIn surfaces the provider error message verbatim', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    authMocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    renderAuth();
    await waitFor(() => expect(latest.loading).toBe(false));

    const result = await latest.signIn('a@b.dev', 'wrong');
    expect(result).toEqual({ error: 'Invalid login credentials' });
  });

  it('signOut delegates to supabase and clears the session via the state listener', async () => {
    let stateHandler: ((event: string, session: Session | null) => void) | undefined;
    authMocks.getSession.mockResolvedValue({ data: { session: fakeSession('u1') } });
    authMocks.onAuthStateChange.mockImplementation((cb: (event: string, session: Session | null) => void) => {
      stateHandler = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    authMocks.signOut.mockResolvedValue({});

    renderAuth();
    await waitFor(() => expect(screen.getByText('has-session')).toBeInTheDocument());

    await latest.signOut();
    expect(authMocks.signOut).toHaveBeenCalledTimes(1);

    // Simulate the provider firing the state change after signOut.
    stateHandler?.('SIGNED_OUT', null);
    await waitFor(() => expect(screen.getByText('no-session')).toBeInTheDocument());
  });

  it('unsubscribes the auth listener on unmount', () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    const unsubscribe = vi.fn();
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });

    const { unmount } = renderAuth();
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
