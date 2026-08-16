import { useEffect, useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { DirectionSignal } from '../components/DirectionSignal';
import { FundamentalsPanel } from '../components/FundamentalsPanel';
import { MarketNewsList } from '../components/MarketNewsList';
import { PillButton } from '../components/PillButton';
import { StatTile } from '../components/StatTile';
import { fetchMarketHistory, fetchMarketSignal } from '../lib/api/markets';
import { formatUsd } from '../lib/format';
import type { MarketSignalResponse, PriceRow } from '../types/market';

const SYMBOL = 'xau';
// The committed static dataset spans 2004-2026 (5500+ trading-day rows, not calendar days --
// weekends/holidays aren't included). Rendering the full series on every mount is unnecessary
// render weight for a chart whose purpose is recent trend context next to the direction signal,
// so we slice to the most recent CHART_WINDOW_ROWS rows (roughly 1.5 years) client-side after
// fetch. Note this slice only reduces render cost, not network cost: the full ~520KB /history
// payload is still fetched in full on every cache miss. The real mitigation for repeat-visit
// network cost is Phase 2's `Cache-Control: public, max-age=3600` header on the /history route
// (repeat visits within an hour are served from cache, not refetched) -- we deliberately did not
// add a `?days=`/`?limit=` backend query param, since that's out of scope for what this one
// chart needs.
const CHART_WINDOW_ROWS = 365;

type FetchStatus = 'loading' | 'error' | 'ready';

export function MarketSignalPage() {
  const [signalStatus, setSignalStatus] = useState<FetchStatus>('loading');
  const [signal, setSignal] = useState<MarketSignalResponse | null>(null);
  const [signalError, setSignalError] = useState<string | undefined>(undefined);

  const [historyStatus, setHistoryStatus] = useState<FetchStatus>('loading');
  const [history, setHistory] = useState<PriceRow[]>([]);
  const [historyError, setHistoryError] = useState<string | undefined>(undefined);

  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSignalStatus('loading');

    fetchMarketSignal(SYMBOL)
      .then((result) => {
        if (cancelled) return;
        setSignal(result);
        setSignalStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSignalError(err instanceof Error ? err.message : 'Failed to load market signal.');
        setSignalStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryStatus('loading');

    fetchMarketHistory(SYMBOL)
      .then((result) => {
        if (cancelled) return;
        setHistory(result);
        setHistoryStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : 'Failed to load price history.');
        setHistoryStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const retry = () => setRequestId((n) => n + 1);
  const chartData = history.slice(-CHART_WINDOW_ROWS);

  // Fold the top-level /signal fetch's own loading/error state together with each section's
  // independent SectionResult failure, so DirectionSignal/FundamentalsPanel/MarketNewsList
  // only ever need the same simple 3-state status prop every other panel in this app uses.
  const directionStatus: FetchStatus = signalStatus === 'ready' && !signal?.direction.data ? 'error' : signalStatus;
  const fundamentalsStatus: FetchStatus = signalStatus === 'ready' && !signal?.fundamentals.data ? 'error' : signalStatus;
  const newsStatus: FetchStatus = signalStatus === 'ready' && !signal?.news.data ? 'error' : signalStatus;

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            XAU/USD Market Signal
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Gold price, an experimental ML direction signal, live gold/forex news sentiment, and
            macro fundamentals — all in one place.
          </p>
        </div>
        {signal?.price ? <StatTile label="Spot Price (XAU/USD)" value={formatUsd(signal.price.close)} variant="hero" /> : null}
      </div>

      <div className="rounded-xl border-2 p-4 text-sm" style={{ borderColor: 'var(--red)', background: 'var(--card)' }}>
        <p className="font-bold" style={{ color: 'var(--red)' }}>
          Not financial advice.
        </p>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Everything on this page — the direction signal, news sentiment, and fundamentals — is
          for informational and educational purposes only, not a recommendation to buy, sell, or
          hold any asset. The direction model's real backtested accuracy on its 5-day horizon
          (51.7% mean across 2020-2024) is below a 55.6% naive baseline — it does not demonstrate
          an edge over simply guessing the more common outcome. See "How this signal works"
          below for the full picture. Always do your own research.
        </p>
      </div>

      {historyStatus === 'loading' ? (
        <div className="h-72 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
      ) : historyStatus === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <p style={{ color: 'var(--red)' }}>{historyError}</p>
          <PillButton onClick={retry} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <PriceChart data={chartData} />
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Direction Signal
        </h2>
        <DirectionSignal
          status={directionStatus}
          direction={signal?.direction.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.direction.error}
          onRetry={retry}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Macro Fundamentals
        </h2>
        <FundamentalsPanel
          status={fundamentalsStatus}
          fundamentals={signal?.fundamentals.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.fundamentals.error}
          onRetry={retry}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Gold &amp; Forex News
        </h2>
        <MarketNewsList
          status={newsStatus}
          posts={signal?.news.data ?? []}
          errorMessage={signalStatus === 'error' ? signalError : signal?.news.error}
          onRetry={retry}
        />
      </div>

      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text)' }}>
          How this signal works
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>Direction signal:</strong> a
            self-trained classifier (four technical indicators — RSI, moving-average crossover,
            momentum, volatility — computed from 22 years of daily XAU/USD prices), predicting
            whether the price will be higher 5 trading days out. Walk-forward evaluated on 5
            yearly folds (2020-2024): mean accuracy 51.7%, versus a 55.6% naive "always guess the
            more common outcome" baseline. It does not currently demonstrate a real edge — this
            is the honest, real result of the evaluation, not a placeholder.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>News sentiment:</strong> each
            headline's sentiment tag is generated by FinBERT (a model pretrained specifically on
            financial text), run against the headline only — not the full article.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Fundamentals:</strong> the Fed funds
            rate, 10-year real yield, CPI, and a broad dollar index, sourced from the Federal
            Reserve's FRED database — commonly cited drivers of gold's price, shown for context,
            not as a combined score.
          </p>
          <p>
            This page covers XAU/USD only. See the disclaimer above — none of this is investment
            advice.
          </p>
        </div>
      </details>
    </div>
  );
}
