import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { createConnection } from '../lib/solanaConnection.js';

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export type VerifySignatureFn = (signature: string) => Promise<boolean>;

async function defaultVerifySignature(signature: string): Promise<boolean> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) return false;
  const connection = createConnection(rpcUrl);
  try {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (!status || status.err) return false;
    return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
  } catch {
    return false;
  }
}

interface SupabaseClientLike {
  from(table: string): {
    insert(
      row: Record<string, unknown>,
    ): Promise<{ error: { code: string; message: string } | null }> | { error: { code: string; message: string } | null };
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts: { ascending: boolean }): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

export function registerPositionsRoutes(
  app: FastifyInstance,
  deps: { supabase?: SupabaseClientLike; verifySignature?: VerifySignatureFn } = {},
): void {
  function getSupabase(): SupabaseClientLike | undefined {
    if (deps.supabase) return deps.supabase;
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) return undefined;
    return createSupabaseAdmin(url, secretKey) as unknown as SupabaseClientLike;
  }
  const verifySignature = deps.verifySignature ?? defaultVerifySignature;

  app.post('/api/positions', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { walletAddress, poolAddress, txSignature } = body;

    if (!isValidPubkey(walletAddress) || !isValidPubkey(poolAddress) || typeof txSignature !== 'string' || txSignature.length < 64) {
      reply.code(400);
      return { error: 'Invalid walletAddress, poolAddress, or txSignature.' };
    }

    const supabase = getSupabase();
    if (!supabase) {
      reply.code(500);
      return { error: 'Server is missing Supabase configuration.' };
    }

    let verified: boolean;
    try {
      verified = await verifySignature(txSignature);
    } catch {
      reply.code(503);
      return { error: 'Solana RPC is unavailable right now.' };
    }

    if (!verified) {
      reply.code(422);
      return { error: 'Transaction is not confirmed on-chain.' };
    }

    const { error } = await supabase
      .from('positions')
      .insert({ wallet_address: walletAddress, pool_address: poolAddress, tx_signature: txSignature });

    if (error) {
      if (error.code === '23505') {
        return { ok: true, alreadyRecorded: true };
      }
      reply.code(503);
      return { error: 'Failed to save the position.' };
    }

    return { ok: true };
  });

  app.get('/api/positions', async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!isValidPubkey(wallet)) {
      reply.code(400);
      return { error: 'A valid wallet query parameter is required.' };
    }

    const supabase = getSupabase();
    if (!supabase) {
      reply.code(500);
      return { error: 'Server is missing Supabase configuration.' };
    }

    const { data, error } = await supabase
      .from('positions')
      .select('id, wallet_address, pool_address, tx_signature, created_at')
      .eq('wallet_address', wallet)
      .order('created_at', { ascending: false });

    if (error) {
      reply.code(503);
      return { error: 'Failed to load positions.' };
    }

    return { positions: data ?? [] };
  });
}
