import type { NewsFilter, NewsPost } from '../../types/news';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function fetchNews(params: { currencies?: string; filter?: NewsFilter }): Promise<NewsPost[]> {
  const url = new URL('/api/news', API_BASE_URL);
  if (params.currencies) url.searchParams.set('currencies', params.currencies);
  if (params.filter) url.searchParams.set('filter', params.filter);

  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load news.');
  }

  return body.posts as NewsPost[];
}
