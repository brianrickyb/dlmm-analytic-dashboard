import type { MajorsResponse, TrendingCoin } from '../../types/screener';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function fetchMajors(): Promise<MajorsResponse> {
  const response = await fetch(new URL('/api/screener/majors', API_BASE_URL).toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load market positioning.');
  }

  return body as MajorsResponse;
}

export async function fetchTrending(): Promise<TrendingCoin[]> {
  const response = await fetch(new URL('/api/screener/trending', API_BASE_URL).toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load trending coins.');
  }

  return body.coins as TrendingCoin[];
}
