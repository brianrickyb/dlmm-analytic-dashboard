import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TradingViewChart } from '../components/TradingViewChart';
import { DirectionSignal } from '../components/DirectionSignal';
import { FundamentalsPanel } from '../components/FundamentalsPanel';
import { MarketNewsList } from '../components/MarketNewsList';
import { TechnicalPanel } from '../components/TechnicalPanel';
import { StatTile } from '../components/StatTile';
import { fetchMarketSignal } from '../lib/api/markets';
import { formatPairPrice } from '../lib/format';
import { DEFAULT_MARKET_KEY, MARKET_OPTIONS, getMarketOption, type MarketOption } from '../lib/markets';
import type { MarketSignalResponse } from '../types/market';

type FetchStatus = 'loading' | 'error' | 'ready';

export function MarketSignalPage() {
  const params = useParams<{ symbol?: string }>();
  const market: MarketOption | null = getMarketOption(params.symbol);

  const [signalStatus, setSignalStatus] = useState<FetchStatus>('loading');
  const [signal, setSignal] = useState<MarketSignalResponse | null>(null);
  const [signalError, setSignalError] = useState<string | undefined>(undefined);

  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    if (!market) return undefined;
    let cancelled = false;
    setSignalStatus('loading');

    fetchMarketSignal(market.key)
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
  }, [market, requestId]);

  if (!market) {
    return <Navigate to={`/markets/${DEFAULT_MARKET_KEY}`} replace />;
  }

  const retry = () => setRequestId((n) => n + 1);
  const key = market.key;

  const technicalStatus: FetchStatus = signalStatus === 'ready' && !signal?.technical.data ? 'error' : signalStatus;
  const technicalSignalStatus: FetchStatus = signalStatus === 'ready' && !signal?.technicalSignal.data ? 'error' : signalStatus;
  const directionStatus: FetchStatus = signalStatus === 'ready' && !signal?.direction.data ? 'error' : signalStatus;
  const fundamentalsStatus: FetchStatus = signalStatus === 'ready' && !signal?.fundamentals.data ? 'error' : signalStatus;
  const newsStatus: FetchStatus = signalStatus === 'ready' && !signal?.news.data ? 'error' : signalStatus;

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            {market.pair} Market Signal
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            {market.label} price, a technical readout with directional signal, live news sentiment,
            {key === 'xau' ? ' an experimental ML direction signal,' : ''}
            {' '}and macro fundamentals — all in one place.
          </p>
        </div>
        {signal?.price ? (
          <div className="shrink-0">
            <StatTile label={`Spot (${market.pair})`} value={formatPairPrice(signal.price.close, market.quoteCurrency)} variant="hero" />
            <p className="mt-1 text-right text-xs" style={{ color: 'var(--muted)' }}>
              As of {signal.freshness.asOf}
              {signal.freshness.stale ? (
                <span
                  className="ml-2 rounded px-1.5 py-0.5 font-bold uppercase"
                  style={{ color: 'var(--amber)', background: 'var(--amber-muted)' }}
                >
                  stale
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      <nav aria-label="Markets" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {MARKET_OPTIONS.map((option) => {
          const active = option.key === key;
          return (
            <Link
              key={option.key}
              to={`/markets/${option.key}`}
              aria-current={active ? 'page' : undefined}
              className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                borderColor: active ? 'transparent' : 'var(--border)',
                background: active ? 'var(--green-subtle)' : 'transparent',
                color: active ? 'var(--green)' : 'var(--muted)',
              }}
            >
              {option.pair}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-xl border-2 p-4 text-sm" style={{ borderColor: 'var(--red)', background: 'var(--card)' }}>
        <p className="font-bold" style={{ color: 'var(--red)' }}>
          Not financial advice.
        </p>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Everything on this page — prices, technicals, sentiment, and fundamentals — is for
          informational and educational purposes only, not a recommendation to buy, sell, or hold
          any asset.
          {key === 'xau'
            ? ` The ML direction model's real backtested accuracy on its 5-day horizon (51.7% mean across 2020-2024) is below a 55.6% naive baseline — it does not demonstrate an edge over simply guessing the more common outcome.`
            : ' The directional signals are descriptive, not predictive.'}{' '}
          Always do your own research.
        </p>
      </div>

      <TradingViewChart key={key} symbol={market.tvSymbol} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Technical Readout
        </h2>
        <TechnicalPanel
          status={technicalStatus}
          technical={signal?.technical.data ?? null}
          errorMessage={signalStatus === 'error' ? signalError : signal?.technical.error}
          onRetry={retry}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Directional Signal
        </h2>
        <DirectionSignal
          status={key === 'xau' ? directionStatus : 'ready'}
          direction={key === 'xau' ? (signal?.direction.data ?? null) : null}
          errorMessage={key === 'xau' ? (signalStatus === 'error' ? signalError : signal?.direction.error) : undefined}
          technicalSignalStatus={technicalSignalStatus}
          technicalSignal={signal?.technicalSignal.data ?? null}
          technicalSignalError={signalStatus === 'error' ? signalError : signal?.technicalSignal.error}
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
          How this page works
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>Prices:</strong> daily OHLCV bars merged by
            the backend — gold combines a multi-decade spot dataset with a live COMEX futures tail,
            while FX pairs and the dollar index come straight from Yahoo Finance's public chart API.
            The newest bar updates intraday during each market's trading session; anything older
            than a week is flagged STALE rather than silently shown as current.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Technical readout:</strong> four standard
            indicators computed from daily closes with the exact definitions the ML model uses —
            RSI(14) with Wilder smoothing, SMA(10)/SMA(50) crossover, 10-day momentum, and 14-day
            return volatility. Descriptive only.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Directional signal (all markets):</strong> a
            deterministic composite of RSI, MA crossover, and momentum — transparent and identical
            for every market. RSI contributes a signal when overbought (&gt;70) or oversold (&lt;30),
            the MA crossover confirms the trend direction, and momentum adds short-term confirmation.
            The confidence score reflects how many indicators agree. This is descriptive, not predictive.
          </p>
          {key === 'xau' && (
            <p>
              <strong style={{ color: 'var(--text)' }}>ML direction signal (gold only):</strong> a
              self-trained classifier predicting whether XAU/USD will be higher 5 trading days out,
              using 22 years of daily closes. Walk-forward evaluated on 5 yearly folds (2020-2024):
              mean accuracy 51.7%, versus a 55.6% naive baseline. It does not currently demonstrate a
              real edge — this is the honest, real result of the evaluation, not a placeholder.
            </p>
          )}
          <p>
            <strong style={{ color: 'var(--text)' }}>News sentiment:</strong> each headline's
            sentiment tag is generated by FinBERT (a model pretrained specifically on financial
            text), run against the headline only — not the full article.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Fundamentals:</strong> the Fed funds rate,
            10-year real yield, CPI, and a broad dollar index, sourced from the Federal Reserve's
            FRED database — commonly cited drivers across gold and FX, shown for context.
          </p>
          <p>See the disclaimer above — none of this is investment advice.</p>
        </div>
      </details>
    </div>
  );
}
