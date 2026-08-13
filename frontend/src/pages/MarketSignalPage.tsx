import { useEffect, useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { DirectionSignal } from '../components/DirectionSignal';
import { FundamentalsPanel } from '../components/FundamentalsPanel';
import { MarketNewsList } from '../components/MarketNewsList';
import { PillButton } from '../components/PillButton';
import { fetchMarketHistory, fetchMarketSignal } from '../lib/api/markets';
import type { MarketSignalResponse, PriceRow } from '../types/market';

const SYMBOL = 'xau';
// The committed static dataset spans 2004-2026 (5500+ daily rows). Rendering the full series
// on every mount is unnecessary weight for a chart whose purpose is recent trend context next
// to the direction signal -- slice to the most recent ~year client-side instead of adding
// backend query-param support for something only this one chart needs.
const CHART_WINDOW_DAYS = 365;

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
  const chartData = history.slice(-CHART_WINDOW_DAYS);

  // Fold the top-level /signal fetch's own loading/error state together with each section's
  // independent SectionResult failure, so DirectionSignal/FundamentalsPanel/MarketNewsList
  // only ever need the same simple 3-state status prop every other panel in this app uses.
  const directionStatus: FetchStatus = signalStatus === 'ready' && !signal?.direction.data ? 'error' : signalStatus;
  const fundamentalsStatus: FetchStatus = signalStatus === 'ready' && !signal?.fundamentals.data ? 'error' : signalStatus;
  const newsStatus: FetchStatus = signalStatus === 'ready' && !signal?.news.data ? 'error' : signalStatus;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          XAU/USD Market Signal
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Gold price, an experimental ML direction signal, live gold/forex news sentiment, and
          macro fundamentals — all in one place.
        </p>
      </div>

      <div className="rounded-xl border-2 p-4 text-sm" style={{ borderColor: 'var(--status-critical)', background: 'var(--surface-1)' }}>
        <p className="font-bold" style={{ color: 'var(--status-critical)' }}>
          Not financial advice.
        </p>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          Everything on this page — the direction signal, news sentiment, and fundamentals — is
          for informational and educational purposes only, not a recommendation to buy, sell, or
          hold any asset. The direction model's real backtested accuracy on its 5-day horizon
          (51.7% mean across 2020-2024) is below a 55.6% naive baseline — it does not demonstrate
          an edge over simply guessing the more common outcome. See "How this signal works"
          below for the full picture. Always do your own research.
        </p>
      </div>

      {historyStatus === 'loading' ? (
        <div className="h-72 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
      ) : historyStatus === 'error' ? (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <p style={{ color: 'var(--status-critical)' }}>{historyError}</p>
          <PillButton onClick={retry} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <PriceChart data={chartData} />
      )}

      <DirectionSignal
        status={directionStatus}
        direction={signal?.direction.data ?? null}
        errorMessage={signalStatus === 'error' ? signalError : signal?.direction.error}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Macro Fundamentals
        </h2>
        <FundamentalsPanel
          status={fundamentalsStatus}
          fundamentals={signal?.fundamentals.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.fundamentals.error}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Gold &amp; Forex News
        </h2>
        <MarketNewsList
          status={newsStatus}
          posts={signal?.news.data ?? []}
          errorMessage={signalStatus === 'error' ? signalError : signal?.news.error}
          onRetry={retry}
        />
      </div>

      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text-primary)' }}>
          How this signal works
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--text-secondary)' }}>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Direction signal:</strong> a
            self-trained classifier (four technical indicators — RSI, moving-average crossover,
            momentum, volatility — computed from 22 years of daily XAU/USD prices), predicting
            whether the price will be higher 5 trading days out. Walk-forward evaluated on 5
            yearly folds (2020-2024): mean accuracy 51.7%, versus a 55.6% naive "always guess the
            more common outcome" baseline. It does not currently demonstrate a real edge — this
            is the honest, real result of the evaluation, not a placeholder.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>News sentiment:</strong> each
            headline's sentiment tag is generated by FinBERT (a model pretrained specifically on
            financial text), run against the headline only — not the full article.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Fundamentals:</strong> the Fed funds
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
