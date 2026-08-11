# News Sentiment Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Positive/Negative/Neutral sentiment badge on every News page post, classified
from the headline text only, via a deterministic keyword lexicon.

**Architecture:** A new pure backend module (`classifySentiment`) scores a title against two
hardcoded keyword lists and is wired into `rss.ts`'s existing post-building step so every
`NewsPost` carries a `sentiment` field for free. The frontend adds a `neutral` Badge variant and
renders the right badge per post in the existing `NewsList` component.

**Tech Stack:** Fastify 5 (backend), React 19 + TypeScript (frontend), Vitest (both).

## Global Constraints

- Classification is a pure, deterministic keyword-lexicon function operating on the headline
  title only — no LLM/external API call, no per-request cost, no network I/O.
- Keyword matching is whole-word/whole-phrase (regex `\b` boundaries) and case-insensitive.
- Scoring: positive keyword count vs negative keyword count; higher count wins; a tie —
  including 0 vs 0 (no keyword matched at all) — resolves to `'neutral'`.
- No sentiment filtering UI in this pass — badge display only (explicitly out of scope).
- Scope is `NewsPost`/`rss.ts`/the News page only. Do NOT touch `NewsMatch`
  (`backend/src/services/cryptopanic.ts`, `frontend/src/types/screener.ts`), Pump Watch, or
  Pool Detail's `RelatedNews` — those are a different type from a different data source.
- The new `neutral` Badge variant must reuse existing CSS tokens
  (`background: 'var(--border)'`, `color: 'var(--text-muted)'`) — do not invent a new CSS
  variable.
- No new frontend component tests — matches this project's established zero-frontend-
  component-test convention.

---

### Task 1: `classifySentiment` module

**Files:**
- Create: `backend/src/lib/sentiment.ts`
- Test: `backend/src/lib/sentiment.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type Sentiment = 'positive' | 'negative' | 'neutral';` and
  `export function classifySentiment(title: string): Sentiment;`. Task 2 imports both.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/lib/sentiment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifySentiment } from './sentiment.js';

describe('classifySentiment', () => {
  it('classifies a title with only positive keywords as positive', () => {
    expect(classifySentiment('Bitcoin surges to new record high')).toBe('positive');
  });

  it('classifies a title with only negative keywords as negative', () => {
    expect(classifySentiment('Exchange hacked, millions in crypto stolen')).toBe('negative');
  });

  it('classifies a title with no matching keywords as neutral', () => {
    expect(classifySentiment('Weekly roundup of Solana ecosystem updates')).toBe('neutral');
  });

  it('classifies a title with equal positive and negative matches as neutral', () => {
    expect(classifySentiment('Token rallies after hack, then crashes on adoption news')).toBe('neutral');
  });

  it('matches keywords case-insensitively', () => {
    expect(classifySentiment('BITCOIN SURGES PAST ALL-TIME HIGH')).toBe('positive');
  });

  it('does not match a keyword inside an unrelated word', () => {
    expect(classifySentiment('Urban development fund backs banana-themed NFT project')).toBe('neutral');
  });

  it('matches a multi-word phrase keyword', () => {
    expect(classifySentiment('Ethereum sets a new record high against the dollar')).toBe('positive');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/lib/sentiment.test.ts`
Expected: FAIL — `Cannot find module './sentiment.js'`

- [ ] **Step 3: Implement `classifySentiment`**

Create `backend/src/lib/sentiment.ts`:

```ts
export type Sentiment = 'positive' | 'negative' | 'neutral';

const POSITIVE_KEYWORDS = [
  'surge', 'surges', 'surging', 'rally', 'rallies', 'rallying', 'soar', 'soars', 'soaring',
  'jump', 'jumps', 'gain', 'gains', 'bullish', 'adoption', 'approve', 'approves', 'approval',
  'approved', 'partnership', 'launch', 'launches', 'launched', 'breakthrough', 'upgrade',
  'record high', 'all-time high', 'milestone', 'recover', 'recovers', 'recovery', 'rebound',
  'rebounds', 'outperform', 'outperforms',
];

const NEGATIVE_KEYWORDS = [
  'crash', 'crashes', 'crashing', 'plunge', 'plunges', 'plunging', 'slump', 'slumps',
  'tumble', 'tumbles', 'hack', 'hacked', 'hacker', 'exploit', 'exploited', 'exploits',
  'bearish', 'lawsuit', 'sues', 'sued', 'ban', 'bans', 'banned', 'crackdown', 'fraud',
  'scam', 'collapse', 'collapses', 'delist', 'delists', 'delisted', 'plummet', 'plummets',
  'sell-off', 'selloff', 'liquidation', 'liquidations', 'investigation', 'probe', 'fine',
  'fined', 'penalty',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(title: string, keywords: string[]): number {
  const pattern = new RegExp(`\\b(${keywords.map(escapeRegExp).join('|')})\\b`, 'gi');
  return (title.match(pattern) ?? []).length;
}

export function classifySentiment(title: string): Sentiment {
  const positiveCount = countMatches(title, POSITIVE_KEYWORDS);
  const negativeCount = countMatches(title, NEGATIVE_KEYWORDS);

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/lib/sentiment.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/sentiment.ts backend/src/lib/sentiment.test.ts
git commit -m "feat(backend): add classifySentiment keyword-lexicon classifier"
```

---

### Task 2: Wire `classifySentiment` into `rss.ts`

**Files:**
- Modify: `backend/src/services/rss.ts`
- Test: `backend/src/services/rss.test.ts`

**Interfaces:**
- Consumes: `classifySentiment(title: string): Sentiment` from Task 1
  (`backend/src/lib/sentiment.ts`).
- Produces: `NewsPost` now includes `sentiment: 'positive' | 'negative' | 'neutral'`. Task 3's
  frontend type mirrors this exactly.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/rss.test.ts` (the file already has `fakeParser` and
`[coindesk, cointelegraph, theblock, decrypt]` destructured from `FEED_SOURCES` at the top —
reuse them):

```ts
describe('createNewsService — sentiment', () => {
  it('includes a sentiment classification computed from the title', async () => {
    const parser = fakeParser({
      [coindesk.url]: {
        items: [{ title: 'Bitcoin surges to new record high', link: 'https://a.example', pubDate: '2026-07-20T00:00:00Z' }],
      },
      [cointelegraph.url]: { items: [] },
      [theblock.url]: { items: [] },
      [decrypt.url]: { items: [] },
    });
    const service = createNewsService({ parser });

    const posts = await service.fetchNews({});

    expect(posts).toEqual([expect.objectContaining({ sentiment: 'positive' })]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/rss.test.ts`
Expected: FAIL — `expect(received).toEqual(expected)`, actual post has no `sentiment` field (or
`undefined`).

- [ ] **Step 3: Wire in the classifier**

In `backend/src/services/rss.ts`, add an import at the top of the file, after the existing
`import Parser from 'rss-parser';` line:

```ts
import { classifySentiment } from '../lib/sentiment.js';
```

Update the `NewsPost` interface:

```ts
export interface NewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}
```

Update `fetchOneFeed`'s body from:

```ts
  async function fetchOneFeed(feed: FeedSource): Promise<NewsPost[]> {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items ?? []).map((item, index) => ({
      id: item.guid ?? item.link ?? `${feed.key}-${index}`,
      title: item.title ?? '(untitled)',
      url: item.link ?? feed.url,
      sourceTitle: feed.title,
      publishedAt: item.pubDate ?? item.isoDate ?? new Date(0).toISOString(),
    }));
  }
```

to:

```ts
  async function fetchOneFeed(feed: FeedSource): Promise<NewsPost[]> {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items ?? []).map((item, index) => {
      const title = item.title ?? '(untitled)';
      return {
        id: item.guid ?? item.link ?? `${feed.key}-${index}`,
        title,
        url: item.link ?? feed.url,
        sourceTitle: feed.title,
        publishedAt: item.pubDate ?? item.isoDate ?? new Date(0).toISOString(),
        sentiment: classifySentiment(title),
      };
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/services/rss.test.ts`
Expected: PASS, all tests (the new one plus every pre-existing test in the file — the existing
tests use `expect.objectContaining(...)`, which ignores the new `sentiment` field, so none of
them should break).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/rss.ts backend/src/services/rss.test.ts
git commit -m "feat(backend): compute sentiment for each news post"
```

---

### Task 3: Frontend type + `Badge` neutral variant

**Files:**
- Modify: `frontend/src/types/news.ts`
- Modify: `frontend/src/components/Badge.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NewsPost.sentiment: 'positive' | 'negative' | 'neutral'` (frontend type, mirrors
  Task 2's backend type); `Badge`'s `variant` prop now accepts `'neutral'` in addition to the
  existing `'accent' | 'good' | 'critical' | 'warning'`. Tasks 4 and 5 consume both.

- [ ] **Step 1: Update the `NewsPost` type**

In `frontend/src/types/news.ts`, change:

```ts
export interface NewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
}
```

to:

```ts
export interface NewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}
```

- [ ] **Step 2: Add the `neutral` Badge variant**

In `frontend/src/components/Badge.tsx`, change:

```ts
type BadgeVariant = 'accent' | 'good' | 'critical' | 'warning';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  good: { bg: 'rgba(12, 163, 12, 0.12)', color: 'var(--status-good)' },
  critical: { bg: 'rgba(208, 59, 59, 0.12)', color: 'var(--status-critical)' },
  warning: { bg: 'rgba(250, 178, 25, 0.12)', color: 'var(--status-warning)' },
};
```

to:

```ts
type BadgeVariant = 'accent' | 'good' | 'critical' | 'warning' | 'neutral';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  good: { bg: 'rgba(12, 163, 12, 0.12)', color: 'var(--status-good)' },
  critical: { bg: 'rgba(208, 59, 59, 0.12)', color: 'var(--status-critical)' },
  warning: { bg: 'rgba(250, 178, 25, 0.12)', color: 'var(--status-warning)' },
  neutral: { bg: 'var(--border)', color: 'var(--text-muted)' },
};
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/news.ts frontend/src/components/Badge.tsx
git commit -m "feat(frontend): add sentiment field to NewsPost type and neutral Badge variant"
```

---

### Task 4: Render the sentiment badge in `NewsList`

**Files:**
- Modify: `frontend/src/components/NewsList.tsx`

**Interfaces:**
- Consumes: `NewsPost.sentiment` and `Badge`'s `'neutral'` variant from Task 3.
- Produces: nothing further downstream.

- [ ] **Step 1: Add the `Badge` import and sentiment-to-badge mapping**

In `frontend/src/components/NewsList.tsx`, change the top of the file from:

```tsx
import type { NewsPost } from '../types/news';
import { PillButton } from './PillButton';
```

to:

```tsx
import type { NewsPost } from '../types/news';
import { Badge } from './Badge';
import { PillButton } from './PillButton';

const SENTIMENT_BADGE: Record<NewsPost['sentiment'], { variant: 'good' | 'critical' | 'neutral'; label: string }> = {
  positive: { variant: 'good', label: 'Positive' },
  negative: { variant: 'critical', label: 'Negative' },
  neutral: { variant: 'neutral', label: 'Neutral' },
};
```

- [ ] **Step 2: Render the badge per post**

Change the row-rendering block from:

```tsx
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
```

to:

```tsx
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
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `cd backend && npm run dev` (one terminal) and `cd frontend && npm run dev` (another).
Open the News page. Confirm each post row shows a small Positive (green), Negative (red), or
Neutral (gray) badge next to the source/time-ago text, in both light and dark mode.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NewsList.tsx
git commit -m "feat(frontend): render sentiment badge on each news post"
```

---

### Task 5: Disclosure copy on the News page

**Files:**
- Modify: `frontend/src/pages/NewsPage.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing further downstream — this is the final task.

- [ ] **Step 1: Add the disclosure paragraph**

In `frontend/src/pages/NewsPage.tsx`, inside the existing "How to read crypto news" `<details>`
block, change:

```tsx
          <p>
            This page aggregates several outlets (CoinDesk, Cointelegraph, The Block, Decrypt) so
            you're not relying on one outlet's bias or blind spots.
          </p>
        </div>
      </details>
```

to:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With both dev servers running (from Task 4), open the News page, expand "How to read crypto
news", and confirm the new paragraph reads correctly after the "aggregates several outlets"
paragraph.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/NewsPage.tsx
git commit -m "docs(frontend): explain sentiment badges in How to read crypto news"
```

## Verification

1. `cd backend && npm test` and `npx tsc --noEmit` — all tests pass (existing suite plus the
   new `sentiment.test.ts` cases and the `rss.test.ts` addition), no type errors.
2. `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — no type errors.
3. Manual verification per Task 4 Step 4 and Task 5 Step 3, in both light and dark mode.
