import type { NewsPost } from '../types/news';
import { Badge } from './Badge';
import { PillButton } from './PillButton';

const SENTIMENT_BADGE: Record<NewsPost['sentiment'], { variant: 'good' | 'critical' | 'neutral'; label: string }> = {
  positive: { variant: 'good', label: 'Positive' },
  negative: { variant: 'critical', label: 'Negative' },
  neutral: { variant: 'neutral', label: 'Neutral' },
};

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
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
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
            <Badge variant={SENTIMENT_BADGE[post.sentiment].variant}>{SENTIMENT_BADGE[post.sentiment].label}</Badge>
            <span>{post.sourceTitle}</span>
            <span>&middot;</span>
            <span>{timeAgo(post.publishedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
