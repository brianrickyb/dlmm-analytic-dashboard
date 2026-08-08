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
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
        <p style={{ color: 'var(--status-critical)' }}>{errorMessage ?? 'Failed to load news.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        No news matches the current filter.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {posts.map((post) => (
        <li key={post.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
          <a href={post.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>
            {post.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{post.sourceTitle}</span>
            <span>&middot;</span>
            <span>{timeAgo(post.publishedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
