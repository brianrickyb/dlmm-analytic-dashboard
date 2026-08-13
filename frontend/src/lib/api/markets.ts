import type { MarketSignalResponse, PriceRow } from '../../types/market';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function fetchMarketSignal(symbol: string): Promise<MarketSignalResponse> {
  const url = new URL(`/api/markets/${symbol}/signal`, API_BASE_URL);
  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load market signal.');
  }

  return body as MarketSignalResponse;
}

export async function fetchMarketHistory(symbol: string): Promise<PriceRow[]> {
  const url = new URL(`/api/markets/${symbol}/history`, API_BASE_URL);
  const response = await fetch(url.toString());
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load price history.');
  }

  return (body.history ?? []) as PriceRow[];
}
