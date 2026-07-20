import { useEffect, useState } from 'react';
import { NewsFilters } from '../components/NewsFilters';
import { NewsList } from '../components/NewsList';
import { fetchNews } from '../lib/api/news';
import type { NewsFilter, NewsPost } from '../types/news';

export function NewsPage() {
  const [currencies, setCurrencies] = useState('');
  const [filter, setFilter] = useState<NewsFilter | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchNews({ currencies: currencies || undefined, filter })
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
  }, [currencies, filter, requestId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Crypto News
      </h1>
      <NewsFilters currencies={currencies} onCurrenciesChange={setCurrencies} filter={filter} onFilterChange={setFilter} />
      <NewsList status={status} posts={posts} errorMessage={errorMessage} onRetry={() => setRequestId((n) => n + 1)} />
    </div>
  );
}
