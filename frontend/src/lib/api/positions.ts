import type { Position } from '../../types/liquidity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function createPosition(params: { walletAddress: string; poolAddress: string; txSignature: string }): Promise<void> {
  const response = await fetch(new URL('/api/positions', API_BASE_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to save the position.');
  }
}

export async function fetchPositions(wallet: string): Promise<Position[]> {
  const url = new URL('/api/positions', API_BASE_URL);
  url.searchParams.set('wallet', wallet);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load positions.');
  }
  return (body.positions as Array<Record<string, string>>).map((row) => ({
    id: row.id,
    walletAddress: row.wallet_address,
    poolAddress: row.pool_address,
    txSignature: row.tx_signature,
    createdAt: row.created_at,
  }));
}
