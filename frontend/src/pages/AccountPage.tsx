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
