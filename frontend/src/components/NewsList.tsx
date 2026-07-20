import type { NewsPost } from '../types/news';

interface NewsListProps {
  status: 'loading' | 'error' | 'ready';
  posts: NewsPost[];
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

export function NewsList({ status, posts, errorMessage, onRetry }: NewsListProps) {
  if (status === 'loading') {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load news.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded border px-3 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        No news matches the current filter.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <a href={post.url} target="_blank" rel="noreferrer" className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
            {post.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{post.sourceTitle}</span>
            <span>&middot;</span>
            <span>{timeAgo(post.publishedAt)}</span>
            {post.currencies.map((code) => (
              <span key={code} className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--border)' }}>
                {code}
              </span>
            ))}
            {post.votes.positive > post.votes.negative ? (
              <span style={{ color: 'var(--status-good)' }}>▲ {post.votes.positive}</span>
            ) : post.votes.negative > post.votes.positive ? (
              <span style={{ color: 'var(--status-critical)' }}>▼ {post.votes.negative}</span>
            ) : null}
            {post.votes.important > 0 ? <span style={{ color: 'var(--status-warning)' }}>★ important</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
