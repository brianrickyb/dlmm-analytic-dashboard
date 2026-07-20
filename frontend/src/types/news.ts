export interface NewsPost {
  id: number;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
  currencies: string[];
  votes: {
    positive: number;
    negative: number;
    important: number;
  };
}

export type NewsFilter = 'rising' | 'hot' | 'bullish' | 'bearish' | 'important';
