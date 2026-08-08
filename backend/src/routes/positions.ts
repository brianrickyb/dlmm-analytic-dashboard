import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { createConnection } from '../lib/solanaConnection.js';
import { loadDlmmSdk } from '../lib/dlmmSdk.js';
import { SolanaUnavailableError } from '../lib/dlmmError.js';

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export interface OnChainPosition {
  poolAddress: string;
  positionAddress: string;
}

export type FetchPositionsFn = (wallet: string) => Promise<OnChainPosition[]>;

async function defaultFetchPositions(wallet: string): Promise<OnChainPosition[]> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new SolanaUnavailableError('Server is missing Solana RPC configuration.');
  }
  const connection = createConnection(rpcUrl);
  const DLMM = loadDlmmSdk();

  const userPubkey = new PublicKey(wallet);
  let positionsByPool: Awaited<ReturnType<typeof DLMM.getAllLbPairPositionsByUser>>;
  try {
    positionsByPool = await DLMM.getAllLbPairPositionsByUser(connection, userPubkey);
  } catch (err) {
    throw new SolanaUnavailableError('Failed to load positions from Solana.', { cause: err });
  }

  const result: OnChainPosition[] = [];
  for (const [poolAddress, info] of positionsByPool) {
    for (const position of info.lbPairPositionsData) {
      result.push({ poolAddress, positionAddress: position.publicKey.toBase58() });
    }
  }
  return result;
}

export function registerPositionsRoutes(app: FastifyInstance, deps: { fetchPositions?: FetchPositionsFn } = {}): void {
  const fetchPositions = deps.fetchPositions ?? defaultFetchPositions;

  app.get('/api/positions', async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!isValidPubkey(wallet)) {
      reply.code(400);
      return { error: 'A valid wallet query parameter is required.' };
    }

    try {
      const positions = await fetchPositions(wallet);
      return { positions };
    } catch (err) {
      if (err instanceof SolanaUnavailableError) {
        request.log.error({ err: err.cause ?? err }, 'fetch positions failed');
        reply.code(503);
        return { error: err.message };
      }
      throw err;
    }
  });
}
