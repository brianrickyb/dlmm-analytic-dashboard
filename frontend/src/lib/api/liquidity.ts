import type { BuildTxResponse } from '../../types/liquidity';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export async function buildAddLiquidityTx(params: {
  poolAddress: string;
  amountX: string;
  amountY: string;
  minBinId: number;
  maxBinId: number;
  userPublicKey: string;
}): Promise<BuildTxResponse> {
  const response = await fetch(new URL('/api/liquidity/build-tx', API_BASE_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to build the transaction.');
  }
  return body as BuildTxResponse;
}
