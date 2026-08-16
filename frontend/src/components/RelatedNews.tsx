import type { PoolTokenNews } from '../types/pool';
import { PillButton } from './PillButton';

interface RelatedNewsProps {
  status: 'loading' | 'error' | 'ready';
  tokens: PoolTokenNews[];
  errorMessage?: string;
  onRetry: () => void;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RelatedNews({ status, tokens, errorMessage, onRetry }: RelatedNewsProps) {
  if (status === 'ready' && tokens.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        Related news
      </div>

      {status === 'loading' ? (
        <div className="h-16 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }} />
      ) : status === 'error' ? (
        <div>
          <p className="text-sm" style={{ color: 'var(--red)' }}>
            {errorMessage ?? 'Failed to load related news.'}
          </p>
          <PillButton onClick={onRetry} className="mt-2 text-xs">
            Retry
          </PillButton>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div key={token.symbol} className="space-y-1.5">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {token.symbol}
              </h3>
              {token.articles.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  No recent coverage.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {token.articles.map((article) => (
                    <li
                      key={article.url}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                    >
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold hover:underline"
                        style={{ color: 'var(--text)' }}
                      >
                        {article.title}
                      </a>
                      <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                        {timeAgo(article.publishedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
