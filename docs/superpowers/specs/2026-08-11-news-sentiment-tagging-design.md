# News Sentiment Tagging — Design

## Context

The News page aggregates headlines from four RSS feeds (CoinDesk, Cointelegraph, The Block,
Decrypt) via `backend/src/services/rss.ts`. It already has a "How to read crypto news" panel
explaining bullish/bearish/FUD/FOMO, but nothing helps a user scan a long list of headlines for
which ones are positive or negative at a glance — they have to read every title.

This was one of three independent ideas from an earlier "improve News/Pools/Screener"
brainstorm (the other two — free-text search on the News page, and Pool Detail news
correlation — are separate, tracked elsewhere; Pool Detail correlation already shipped). This
spec covers sentiment tagging only.

**Hard constraint:** `NewsPost` (`backend/src/services/rss.ts`) has no article body or summary
— RSS feeds only give `title`/`url`/`sourceTitle`/`publishedAt`. Any classifier here can only
ever see the headline text, never the article itself.

## Goal

Every post on the News page shows a small sentiment badge — Positive, Negative, or Neutral —
computed from its headline, so a user can scan the list and spot which stories are bullish or
bearish news without reading each title. No filtering by sentiment in this pass (badge-only,
minimal scope — a filter can be a follow-up if it turns out to be wanted).

## Approach

### Backend: `backend/src/lib/sentiment.ts` (new)

A pure, deterministic, dependency-free module — no fetch, no cache, no external API. Exports:

```ts
export type Sentiment = 'positive' | 'negative' | 'neutral';

export function classifySentiment(title: string): Sentiment;
```

Two hardcoded, crypto-tuned keyword lists:

```ts
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
```

These are deliberately conservative — ambiguous words that show up in neutral analyst
commentary too (e.g. "risk", "drop", "warning") are excluded to keep false positives low, at
the cost of more headlines landing on "Neutral." The lists are isolated in this one file and
tunable later without touching classification logic, `rss.ts`, or any UI code.

**Matching:** whole-word/whole-phrase, case-insensitive (so "ban" doesn't match inside "urban"
or "Ban Ki-moon"-style proper nouns isn't fully preventable with word-boundary matching alone,
but it eliminates the much more common substring-inside-another-word false positive). Build one
case-insensitive regex per list with `\b(...)\b` alternation over the escaped keywords/phrases,
count matches via `(title.match(regex) ?? []).length`.

**Scoring:** `positiveCount` vs `negativeCount`. Higher count wins. Equal counts — including
0-vs-0 (no keyword matched at all) — resolve to `'neutral'`.

### Backend: wire into `rss.ts`

`NewsPost` gains one field:

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

Computed inside `fetchOneFeed`'s existing `.map(...)` over parsed RSS items, alongside the
other fields — `sentiment: classifySentiment(item.title ?? '(untitled)')`. It rides along in
the existing per-source merged-feed cache (`cacheTtlMs`, unchanged) — no new caching layer,
since classification is a pure function of the already-cached title.

No changes to `NewsQuery`, `fetchNews`, `matchesCurrencies`, `FEED_SOURCES`, or
`CURRENCY_ALIASES` — this is purely additive to the post-building step.

### Backend route

No changes needed to `backend/src/routes/news.ts` — `GET /api/news` already returns full
`NewsPost` objects via `{ posts }`, so `sentiment` rides along automatically once it's on the
type/object.

### Frontend

- `frontend/src/types/news.ts`: `NewsPost` gains `sentiment: 'positive' | 'negative' | 'neutral'`,
  mirroring the backend type exactly.
- `frontend/src/components/Badge.tsx`: add a fifth variant, `neutral`, styled with a muted gray
  rather than any of the existing brand/status colors — reusing tokens that already exist
  (`frontend/src/index.css` has no dedicated "surface-2"/muted-chip token, so don't invent one):
  `background: 'var(--border)'`, `color: 'var(--text-muted)'`.
- `frontend/src/components/NewsList.tsx`: render a `Badge` per post, next to the existing
  `sourceTitle · timeAgo` line, mapping `positive → <Badge variant="good">Positive</Badge>`,
  `negative → <Badge variant="critical">Negative</Badge>`,
  `neutral → <Badge variant="neutral">Neutral</Badge>`.
- `frontend/src/pages/NewsPage.tsx`: add one sentence to the existing "How to read crypto news"
  `<details>` block: *"The sentiment tag (Positive/Negative/Neutral) on each headline is a
  simple keyword match against the title only — not the full article, and not AI analysis.
  Treat it as a rough scan aid, not a signal."*

## Out of scope

- Filtering the News page by sentiment — badge-only for this pass.
- Sentiment on CryptoPanic-sourced articles (Pump Watch's `NewsMatch`, Pool Detail's
  `RelatedNews`) — those are a different type with no `sentiment` field and a different data
  source; not touched by this spec.
- Any ML/LLM-based classification — explicitly declined in favor of a deterministic keyword
  lexicon (no new API key, no per-request cost, no latency, fully testable).
- Tuning the exact keyword lists beyond the ones listed above — they're a real, complete
  starting set, not a placeholder, but refining them based on real observed headlines is a
  natural follow-up, not part of this implementation.

## Testing

- `backend/src/lib/sentiment.test.ts` (new): positive-keyword title → `'positive'`;
  negative-keyword title → `'negative'`; no matching keywords → `'neutral'`; equal positive and
  negative matches (mixed headline) → `'neutral'`; case-insensitivity (`'SURGE'` still matches);
  word-boundary correctness (a title containing "urban" or "banana" must NOT match `ban`); a
  multi-word phrase (`'record high'`) matches correctly.
- `backend/src/services/rss.test.ts`: extend the existing feed-parsing test(s) to assert the
  returned `NewsPost` objects include the correct `sentiment` value for a known title.
- No new frontend component tests — matches this project's established zero-frontend-
  component-test convention.
