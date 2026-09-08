import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { createConnection } from '../lib/solanaConnection.js';
import { loadDlmmSdk } from '../lib/dlmmSdk.js';
import { SolanaUnavailableError } from '../lib/dlmmError.js';
import { computePositionSummary } from '../lib/positionMath.js';

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
  lowerBinId: number;
  upperBinId: number;
  activeBinId: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  liquidity: { xAmount: number; yAmount: number; valueInQuote: number };
  fees: { xAmount: number; yAmount: number; valueInQuote: number };
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
    const decimalsX = info.tokenX.mint.decimals;
    const decimalsY = info.tokenY.mint.decimals;
    for (const position of info.lbPairPositionsData) {
      const summary = computePositionSummary({
        lowerBinId: position.positionData.lowerBinId,
        upperBinId: position.positionData.upperBinId,
        activeId: info.lbPair.activeId,
        binStep: info.lbPair.binStep,
        decimalsX,
        decimalsY,
        totalXAmount: position.positionData.totalXAmount,
        totalYAmount: position.positionData.totalYAmount,
        feeX: position.positionData.feeX.toString(),
        feeY: position.positionData.feeY.toString(),
      });
      result.push({ poolAddress, positionAddress: position.publicKey.toBase58(), ...summary });
    }
  }
  return result;
}

export function registerPositionsRoutes(app: FastifyInstance, deps: { fetchPositions?: FetchPositionsFn } = {}): void {
  const fetchPositions = deps.fetchPositions ?? defaultFetchPositions;

  // GET /api/positions triggers a chunked getProgramAccounts scan against the
  // DLMM program (one of the most expensive calls an RPC serves) for any
  // caller-supplied wallet address, with no cache — bounded per-IP so an
  // anonymous caller can't turn this into a devnet RPC bill.
  const routeOptions = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/api/positions', routeOptions, async (request, reply) => {
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
