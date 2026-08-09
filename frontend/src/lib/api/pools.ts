import type { PoolSnapshot, PoolWithStats } from '../../types/pool';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class PoolNotFoundError extends Error {}

export async function fetchPools(): Promise<PoolWithStats[]> {
  const response = await fetch(new URL('/api/pools', API_BASE_URL).toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pools.');
  }

  return body.pools as PoolWithStats[];
}

export async function fetchPool(poolAddress: string): Promise<PoolWithStats> {
  const response = await fetch(new URL(`/api/pools/${poolAddress}`, API_BASE_URL).toString());
  const body = await response.json();

  if (response.status === 404) {
    throw new PoolNotFoundError(typeof body?.error === 'string' ? body.error : 'Pool not found.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pool.');
  }

  return body.pool as PoolWithStats;
}

export async function fetchPoolHistory(poolAddress: string, days = 90): Promise<PoolSnapshot[]> {
  const url = new URL(`/api/pools/${poolAddress}/history`, API_BASE_URL);
  url.searchParams.set('days', String(days));
  const response = await fetch(url.toString());
  const body = await response.json();

  if (response.status === 404) {
    throw new PoolNotFoundError(typeof body?.error === 'string' ? body.error : 'Pool not found.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load pool history.');
  }

  return body.snapshots as PoolSnapshot[];
}
