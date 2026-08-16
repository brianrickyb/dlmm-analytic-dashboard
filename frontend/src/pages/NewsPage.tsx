import { useEffect, useState } from 'react';
import { NewsFilters } from '../components/NewsFilters';
import { NewsList } from '../components/NewsList';
import { fetchNews } from '../lib/api/news';
import type { NewsPost, NewsSource } from '../types/news';

export function NewsPage() {
  const [currencies, setCurrencies] = useState('');
  const [source, setSource] = useState<NewsSource | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchNews({ currencies: currencies || undefined, source })
      .then((result) => {
        if (cancelled) return;
        setPosts(result);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load news.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [currencies, source, requestId]);

  return (
    <div className="page-enter space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        Crypto News
      </h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Live headlines aggregated from CoinDesk, Cointelegraph, The Block, and Decrypt. New to
        reading crypto news? See "How to read crypto news" below.
      </p>
      <details className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text)' }}>
          How to read crypto news
        </summary>
        <div className="mt-3 space-y-2" style={{ color: 'var(--muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>Bullish</strong> means sentiment that
            price will rise; <strong style={{ color: 'var(--text)' }}>bearish</strong> means
            sentiment it will fall.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>FUD</strong> (Fear, Uncertainty, Doubt)
            is news that spreads fear and can trigger panic selling.{' '}
            <strong style={{ color: 'var(--text)' }}>FOMO</strong> (Fear Of Missing Out) is
            the urge to buy quickly so you don't miss a rally — it often leads people to buy right
            at the peak.
          </p>
          <p>
            Crypto markets are heavily sentiment-driven: regulation news, institutional adoption,
            hacks, and similar events can shift perceived risk fast, triggering mass buying or
            selling.
          </p>
          <p>
            This page aggregates several outlets (CoinDesk, Cointelegraph, The Block, Decrypt) so
            you're not relying on one outlet's bias or blind spots.
          </p>
          <p>
            The sentiment tag (Positive/Negative/Neutral) on each headline is a simple keyword
            match against the title only — not the full article, and not AI analysis. Treat it
            as a rough scan aid, not a signal.
          </p>
        </div>
      </details>
      <NewsFilters currencies={currencies} onCurrenciesChange={setCurrencies} source={source} onSourceChange={setSource} />
      <NewsList status={status} posts={posts} errorMessage={errorMessage} onRetry={() => setRequestId((n) => n + 1)} />
    </div>
  );
}
