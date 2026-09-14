import type { Position, PositionCostBasis } from '../../types/liquidity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function fetchPositions(wallet: string): Promise<Position[]> {
  const url = new URL('/api/positions', API_BASE_URL);
  url.searchParams.set('wallet', wallet);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load positions.');
  }
  return body.positions as Position[];
}

export interface CostBasisResponse {
  available: boolean;
  costBasis?: PositionCostBasis;
}

export async function fetchPositionCostBasis(positionAddress: string, poolAddress: string): Promise<CostBasisResponse> {
  const url = new URL(`/api/positions/${positionAddress}/cost-basis`, API_BASE_URL);
  url.searchParams.set('pool', poolAddress);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load position P&L.');
  }
  return body as CostBasisResponse;
}
