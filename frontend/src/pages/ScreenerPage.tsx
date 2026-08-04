import { useEffect, useState } from 'react';
import { PositioningTable } from '../components/PositioningTable';
import { TrendingWatch } from '../components/TrendingWatch';
import { fetchMajors, fetchTrending } from '../lib/api/screener';
import type { MajorsResponse, TrendingCoin } from '../types/screener';

export function ScreenerPage() {
  const [majorsStatus, setMajorsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [majors, setMajors] = useState<MajorsResponse | null>(null);
  const [majorsError, setMajorsError] = useState<string | undefined>(undefined);
  const [majorsRequestId, setMajorsRequestId] = useState(0);

  const [trendingStatus, setTrendingStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [trendingError, setTrendingError] = useState<string | undefined>(undefined);
  const [trendingRequestId, setTrendingRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMajorsStatus('loading');
    fetchMajors()
      .then((result) => {
        if (cancelled) return;
        setMajors(result);
        setMajorsStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMajorsError(err instanceof Error ? err.message : 'Failed to load market positioning.');
        setMajorsStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [majorsRequestId]);

  useEffect(() => {
    let cancelled = false;
    setTrendingStatus('loading');
    fetchTrending()
      .then((result) => {
        if (cancelled) return;
        setTrending(result);
        setTrendingStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTrendingError(err instanceof Error ? err.message : 'Failed to load trending coins.');
        setTrendingStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [trendingRequestId]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Screener
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Two independent signals: current futures market positioning on major pairs, and coins
        seeing a spike in search interest. Neither panel is investment advice — see the FAQ for
        how to read each term.
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Market Positioning
        </h2>
        {majorsStatus === 'loading' ? (
          <div className="h-48 animate-pulse rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ) : majorsStatus === 'error' ? (
          <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <p style={{ color: 'var(--status-critical)' }}>{majorsError}</p>
            <button
              type="button"
              onClick={() => setMajorsRequestId((n) => n + 1)}
              className="mt-2 rounded border px-3 py-1 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <PositioningTable pairs={majors!.pairs} topLongSymbols={majors!.topLongSymbols} topShortSymbols={majors!.topShortSymbols} />
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Trending / Narrative Watch
        </h2>
        <TrendingWatch
          status={trendingStatus}
          coins={trending}
          errorMessage={trendingError}
          onRetry={() => setTrendingRequestId((n) => n + 1)}
        />
      </div>
    </div>
  );
}
