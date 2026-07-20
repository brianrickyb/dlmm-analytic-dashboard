export interface NewsPost {
  id: string;
  title: string;
  url: string;
  sourceTitle: string;
  publishedAt: string;
}

export type NewsSource = 'coindesk' | 'cointelegraph' | 'theblock' | 'decrypt';
