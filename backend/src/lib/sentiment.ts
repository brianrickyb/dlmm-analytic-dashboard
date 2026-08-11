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
