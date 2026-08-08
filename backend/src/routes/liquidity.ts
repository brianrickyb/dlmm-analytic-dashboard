import type { FastifyInstance } from 'fastify';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { parseBuildTxRequest, type BuildTxRequest } from '../lib/liquidityValidation.js';
import { createConnection } from '../lib/solanaConnection.js';
import { loadDlmmSdk, StrategyType } from '../lib/dlmmSdk.js';
import { SolanaUnavailableError, PoolNotFoundError } from '../lib/dlmmError.js';

export type BuildTxFn = (
  input: BuildTxRequest,
) => Promise<{ transaction: string; blockhash: string; lastValidBlockHeight: number }>;

async function defaultBuildTx(input: BuildTxRequest) {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new SolanaUnavailableError('Server is missing Solana RPC configuration.');
  }
  const connection = createConnection(rpcUrl);
  const DLMM = loadDlmmSdk();

  let pool;
  try {
    pool = await DLMM.create(connection, new PublicKey(input.poolAddress));
  } catch (err) {
    if (err instanceof Error && /not found|invalid/i.test(err.message)) {
      throw new PoolNotFoundError(input.poolAddress);
    }
    throw new SolanaUnavailableError();
  }

  const userPubkey = new PublicKey(input.userPublicKey);
  // A brand-new position account is created as part of this transaction, so
  // Solana requires that account's own signature alongside the fee payer's.
  // This is a disposable keypair the backend generates and signs with here
  // (not a user secret) — the user's wallet signs separately, client-side.
  const positionKeypair = Keypair.generate();

  let transaction;
  try {
    transaction = await pool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      totalXAmount: new BN(input.amountX),
      totalYAmount: new BN(input.amountY),
      strategy: {
        minBinId: input.minBinId,
        maxBinId: input.maxBinId,
        strategyType: StrategyType.Spot,
      },
      user: userPubkey,
      slippage: input.slippageBps,
    });
  } catch {
    throw new SolanaUnavailableError('Failed to build the add-liquidity transaction.');
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = userPubkey;
  transaction.partialSign(positionKeypair);

  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { transaction: serialized.toString('base64'), blockhash, lastValidBlockHeight };
}

export function registerLiquidityRoutes(app: FastifyInstance, deps: { buildTx?: BuildTxFn } = {}): void {
  const buildTx = deps.buildTx ?? defaultBuildTx;

  app.post('/api/liquidity/build-tx', async (request, reply) => {
    const parsed = parseBuildTxRequest(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error };
    }

    try {
      return await buildTx(parsed.data);
    } catch (err) {
      if (err instanceof PoolNotFoundError) {
        reply.code(404);
        return { error: err.message };
      }
      if (err instanceof SolanaUnavailableError) {
        reply.code(503);
        return { error: err.message };
      }
      throw err;
    }
  });
}
