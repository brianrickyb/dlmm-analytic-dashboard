import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { createCheckoutSession, createPortalSession } from '../lib/api/premium';

const ACCENT = '#4f46e5';
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 8;

export function UpgradePage() {
  const { session, isPremium, refreshPremiumStatus } = useAuth();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(searchParams.get('success') === 'true');

  useEffect(() => {
    if (searchParams.get('success') !== 'true' || isPremium) {
      setPolling(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const interval = setInterval(() => {
      attempts += 1;
      refreshPremiumStatus().then(() => {
        if (cancelled) return;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          clearInterval(interval);
          setPolling(false);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [searchParams, isPremium, refreshPremiumStatus]);

  async function handleSubscribe() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession(session.access_token);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setBusy(false);
    }
  }

  async function handleManage() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await createPortalSession(session.access_token);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open the billing portal.');
      setBusy(false);
    }
  }

  return (
    <div
      className="mx-auto max-w-md space-y-5 rounded-2xl border p-10 text-center"
      style={{ borderColor: '#e4e4e7', background: '#ffffff' }}
    >
      {isPremium ? (
        <>
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: '#ecfdf5', color: '#059669' }}
          >
            ✓ PREMIUM ACTIVE
          </span>
          <h1 className="text-2xl font-extrabold" style={{ color: '#18181b' }}>
            You're all set
          </h1>
          <p className="mx-auto max-w-xs text-sm" style={{ color: '#71717a' }}>
            2:1 signal badges are live on your Screener. Renews monthly.
          </p>
          {error ? (
            <p className="text-xs" style={{ color: '#dc2626' }}>
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleManage}
            disabled={busy}
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: '#d4d4d8', color: '#3f3f46' }}
          >
            {busy ? 'Opening...' : 'Manage subscription →'}
          </button>
        </>
      ) : (
        <>
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: '#eef2ff', color: ACCENT }}
          >
            ⭐ FOR ACTIVE TRADERS
          </span>
          <h1 className="text-2xl font-extrabold" style={{ color: '#18181b' }}>
            See the signal before the crowd
          </h1>
          <p className="mx-auto max-w-xs text-sm" style={{ color: '#71717a' }}>
            Get an automatic badge on the Screener whenever a pair's long/short positioning hits a 2:1 extreme.
          </p>

          <div className="mx-auto max-w-xs space-y-1 rounded-xl border p-5" style={{ borderColor: '#e4e4e7', boxShadow: '0 8px 24px rgba(0,0,0,.06)' }}>
            <div className="text-3xl font-extrabold" style={{ color: ACCENT }}>
              $5<span className="text-sm font-normal" style={{ color: '#a1a1aa' }}>/month</span>
            </div>
            <div className="text-xs" style={{ color: '#a1a1aa' }}>
              Cancel anytime · Secured by Stripe
            </div>
          </div>

          {error ? (
            <p className="text-xs" style={{ color: '#dc2626' }}>
              {error}
            </p>
          ) : null}

          {polling ? (
            <p className="text-sm" style={{ color: '#71717a' }}>
              Processing your subscription...
            </p>
          ) : session ? (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
              style={{ background: ACCENT, color: '#ffffff' }}
            >
              {busy ? 'Starting checkout...' : 'Subscribe with Stripe'}
            </button>
          ) : (
            <Link
              to="/login"
              className="block w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
              style={{ background: ACCENT, color: '#ffffff' }}
            >
              Log in to subscribe
            </Link>
          )}
          <p className="text-xs" style={{ color: '#d4d4d8' }}>
            Test mode — no real charge
          </p>
        </>
      )}
    </div>
  );
}
