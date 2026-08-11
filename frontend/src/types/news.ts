export interface NewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export type NewsSource = 'coindesk' | 'cointelegraph' | 'theblock' | 'decrypt';
