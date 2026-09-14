import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { createConnection } from '../lib/solanaConnection.js';
import { loadDlmmSdk } from '../lib/dlmmSdk.js';
import { SolanaUnavailableError } from '../lib/dlmmError.js';
import { computePositionSummary } from '../lib/positionMath.js';
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { createMeteoraService, MeteoraUnavailableError } from '../services/meteora.js';
import { deriveCostBasis, type CostBasisConnection } from '../lib/costBasis.js';
import type { SupabaseClient } from '@supabase/supabase-js';

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
        totalClaimedFeeXAmount: position.positionData.totalClaimedFeeXAmount.toString(),
        totalClaimedFeeYAmount: position.positionData.totalClaimedFeeYAmount.toString(),
      });
      result.push({ poolAddress, positionAddress: position.publicKey.toBase58(), ...summary });
    }
  }
  return result;
}

export interface PositionCostBasis {
  entryDate: string;
  entryPrice: number;
  depositXAmount: number;
  depositYAmount: number;
  txSignature: string;
}

export type FetchCostBasisFn = (positionAddress: string, poolAddress: string) => Promise<PositionCostBasis | null>;

export async function getCachedCostBasis(supabaseAdmin: SupabaseClient, positionAddress: string): Promise<PositionCostBasis | null> {
  const { data, error } = await supabaseAdmin
    .from('position_cost_basis')
    .select('entry_date, entry_price, deposit_x_amount, deposit_y_amount, tx_signature')
    .eq('position_address', positionAddress)
    .maybeSingle();
  if (error) {
    console.error('[positions] failed reading position_cost_basis cache', error);
  }
  if (!data) return null;
  return {
    entryDate: data.entry_date,
    entryPrice: Number(data.entry_price),
    depositXAmount: Number(data.deposit_x_amount),
    depositYAmount: Number(data.deposit_y_amount),
    txSignature: data.tx_signature,
  };
}

export async function saveCostBasis(
  supabaseAdmin: SupabaseClient,
  positionAddress: string,
  poolAddress: string,
  costBasis: PositionCostBasis,
): Promise<void> {
  const { error } = await supabaseAdmin.from('position_cost_basis').insert({
    position_address: positionAddress,
    pool_address: poolAddress,
    entry_date: costBasis.entryDate,
    entry_price: costBasis.entryPrice,
    deposit_x_amount: costBasis.depositXAmount,
    deposit_y_amount: costBasis.depositYAmount,
    tx_signature: costBasis.txSignature,
  });
  // Postgres 23505 = unique_violation on position_address (the primary key).
  // Under concurrency, two simultaneous first-requests for the same position
  // can both derive the same (correct) result and race on the insert — the
  // loser hitting this is benign and expected, not a real failure, so it's
  // not worth logging.
  if (error && error.code !== '23505') {
    console.error('[positions] failed to persist position_cost_basis', error);
  }
}

async function defaultFetchCostBasis(positionAddress: string, poolAddress: string): Promise<PositionCostBasis | null> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!rpcUrl || !supabaseUrl || !supabaseKey) {
    throw new SolanaUnavailableError('Server is missing Solana RPC or Supabase configuration.');
  }

  const supabaseAdmin = createSupabaseAdmin(supabaseUrl, supabaseKey);
  const cached = await getCachedCostBasis(supabaseAdmin, positionAddress);
  if (cached) return cached;

  const meteoraService = createMeteoraService({ supabaseAdmin });
  const pool = await meteoraService.getPoolByAddress(poolAddress);
  if (!pool) return null;

  const connection = createConnection(rpcUrl);
  const DLMM = loadDlmmSdk();

  let derived;
  try {
    derived = await deriveCostBasis(
      // web3.js's real Connection.getTransaction is overloaded (a legacy
      // config without maxSupportedTransactionVersion, and a versioned one
      // with it) in a way TS can't structurally match against
      // CostBasisConnection's single simplified signature, even though the
      // versioned overload accepts exactly the { maxSupportedTransactionVersion }
      // shape deriveCostBasis calls it with at runtime.
      { connection: connection as unknown as CostBasisConnection, getPoolHistory: meteoraService.getPoolHistory },
      {
        positionAddress,
        poolAddress,
        programId: DLMM.LBCLMM_PROGRAM_IDS.devnet,
        idl: DLMM.IDL,
        binStep: pool.binStep,
        decimalsX: pool.tokenX.decimals,
        decimalsY: pool.tokenY.decimals,
      },
    );
  } catch (err) {
    // deriveCostBasis's OHLCV fallback (meteoraService.getPoolHistory) can
    // throw MeteoraUnavailableError, not just a Solana RPC error — let it
    // propagate as-is so the route's outer catch maps it to 503 correctly
    // instead of misreporting a Meteora outage as a Solana one.
    if (err instanceof MeteoraUnavailableError) throw err;
    throw new SolanaUnavailableError('Failed to derive cost basis from Solana.', { cause: err });
  }
  if (!derived) return null;

  await saveCostBasis(supabaseAdmin, positionAddress, poolAddress, derived);
  return derived;
}

export function registerPositionsRoutes(
  app: FastifyInstance,
  deps: { fetchPositions?: FetchPositionsFn; fetchCostBasis?: FetchCostBasisFn } = {},
): void {
  const fetchPositions = deps.fetchPositions ?? defaultFetchPositions;
  const fetchCostBasis = deps.fetchCostBasis ?? defaultFetchCostBasis;

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

  // Unlike GET /api/positions, this route can trigger a Supabase read, a
  // Meteora API call, and up to two Solana RPC calls per request (signature
  // lookup + transaction fetch), for any caller-supplied position address,
  // unauthenticated — a lower per-IP cap keeps that from becoming a devnet
  // RPC/Supabase bill.
  const costBasisRouteOptions = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/positions/:positionAddress/cost-basis', costBasisRouteOptions, async (request, reply) => {
    const { positionAddress } = request.params as { positionAddress: string };
    const { pool } = request.query as { pool?: string };
    if (!isValidPubkey(positionAddress) || !isValidPubkey(pool)) {
      reply.code(400);
      return { error: 'A valid positionAddress path segment and pool query parameter are required.' };
    }

    try {
      const costBasis = await fetchCostBasis(positionAddress, pool);
      if (!costBasis) return { available: false };
      return { available: true, costBasis };
    } catch (err) {
      if (err instanceof SolanaUnavailableError || err instanceof MeteoraUnavailableError) {
        request.log.error({ err }, 'fetch cost basis failed');
        reply.code(503);
        return { error: err.message };
      }
      throw err;
    }
  });
}
