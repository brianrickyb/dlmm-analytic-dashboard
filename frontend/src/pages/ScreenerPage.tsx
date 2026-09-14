import { useEffect, useMemo, useState } from 'react';
import { PositioningTable } from '../components/PositioningTable';
import { TrendingWatch } from '../components/TrendingWatch';
import { PumpWatch } from '../components/PumpWatch';
import { PillButton } from '../components/PillButton';
import { TradingViewTickerTape } from '../components/TradingViewTickerTape';
import { fetchMajors, fetchTrending, fetchPumpWatch } from '../lib/api/screener';
import type { MajorsResponse, TrendingCoin, PumpCandidate } from '../types/screener';

export function ScreenerPage() {
  const [majorsStatus, setMajorsStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [majors, setMajors] = useState<MajorsResponse | null>(null);
  const [majorsError, setMajorsError] = useState<string | undefined>(undefined);
  const [majorsRequestId, setMajorsRequestId] = useState(0);

  const [trendingStatus, setTrendingStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [trendingError, setTrendingError] = useState<string | undefined>(undefined);
  const [trendingRequestId, setTrendingRequestId] = useState(0);

  const [pumpStatus, setPumpStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [pumpCandidates, setPumpCandidates] = useState<PumpCandidate[]>([]);
  const [pumpError, setPumpError] = useState<string | undefined>(undefined);
  const [pumpRequestId, setPumpRequestId] = useState(0);

  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

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

  useEffect(() => {
    let cancelled = false;
    setPumpStatus('loading');
    fetchPumpWatch()
      .then((result) => {
        if (cancelled) return;
        setPumpCandidates(result);
        setPumpStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPumpError(err instanceof Error ? err.message : 'Failed to load pump watch.');
        setPumpStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pumpRequestId]);

  const filteredPairs = useMemo(
    () => (query ? (majors?.pairs ?? []).filter((p) => p.symbol.toLowerCase().includes(query)) : majors?.pairs ?? []),
    [majors, query],
  );
  const filteredTrending = useMemo(
    () => (query ? trending.filter((c) => c.symbol.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)) : trending),
    [trending, query],
  );
  const filteredPumpCandidates = useMemo(
    () => (query ? pumpCandidates.filter((c) => c.symbol.toLowerCase().includes(query)) : pumpCandidates),
    [pumpCandidates, query],
  );

  return (
    <div className="page-enter space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Screener
      </h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Three independent signals: current futures market positioning on major pairs, coins
        seeing a spike in search interest, and freshly created pools showing an unusual price
        move. None of these panels is investment advice — see the FAQ for how to read each term.
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search symbol across all panels…"
        aria-label="Search symbol across all panels"
        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)' }}
      />

      <TradingViewTickerTape />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Market Positioning
        </h2>
        {majorsStatus === 'loading' ? (
          <div className="h-48 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ) : majorsStatus === 'error' ? (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <p style={{ color: 'var(--red)' }}>{majorsError}</p>
            <PillButton onClick={() => setMajorsRequestId((n) => n + 1)} className="mt-2 text-xs">
              Retry
            </PillButton>
          </div>
        ) : (
          <PositioningTable pairs={filteredPairs} topLongSymbols={majors!.topLongSymbols} topShortSymbols={majors!.topShortSymbols} />
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Trending / Narrative Watch
        </h2>
        <TrendingWatch
          status={trendingStatus}
          coins={filteredTrending}
          errorMessage={trendingError}
          onRetry={() => setTrendingRequestId((n) => n + 1)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Pump Watch
        </h2>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Pools created in the last 72 hours with a 6h price move of 25%+ and meaningful volume —
          computed from raw on-chain data across all networks GeckoTerminal indexes, not a
          third-party trending list. A "News" tag means a recent (last 48h) article was found for
          that token; no tag doesn't mean nothing's happening, just that nothing's been published
          yet. Not investment advice — verify independently.
        </p>
        <PumpWatch
          status={pumpStatus}
          candidates={filteredPumpCandidates}
          errorMessage={pumpError}
          onRetry={() => setPumpRequestId((n) => n + 1)}
        />
      </div>
    </div>
  );
}
