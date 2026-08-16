import { Badge } from './Badge';
import { PillButton } from './PillButton';
import type { MarketNewsPost } from '../types/market';

const SENTIMENT_BADGE: Record<'positive' | 'negative' | 'neutral', { variant: 'good' | 'critical' | 'neutral'; label: string }> = {
  positive: { variant: 'good', label: 'Positive' },
  negative: { variant: 'critical', label: 'Negative' },
  neutral: { variant: 'neutral', label: 'Neutral' },
};

interface MarketNewsListProps {
  status: 'loading' | 'error' | 'ready';
  posts: MarketNewsPost[];
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

export function MarketNewsList({ status, posts, errorMessage, onRetry }: MarketNewsListProps) {
  if (status === 'loading') {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <p style={{ color: 'var(--red)' }}>{errorMessage ?? 'News is unavailable right now.'}</p>
        <PillButton onClick={onRetry} className="mt-2 text-xs">
          Retry
        </PillButton>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}>
        No gold or forex news found right now.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {posts.map((post) => {
        const badge = post.mlSentiment ? SENTIMENT_BADGE[post.mlSentiment.sentiment] : null;
        return (
          <li key={post.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <a href={post.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: 'var(--text)' }}>
              {post.title}
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Badge variant="neutral">Sentiment unavailable</Badge>}
              <span>{post.sourceTitle}</span>
              <span>&middot;</span>
              <span>{timeAgo(post.publishedAt)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
