import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMeteoraService, type PoolWithStats } from '../services/meteora.js';
import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';

export interface SnapshotResult {
  succeeded: number;
  failed: number;
}

interface MeteoraServiceLike {
  getPools(): Promise<PoolWithStats[]>;
}

export async function runSnapshotPoolTvl(deps: {
  meteoraService: MeteoraServiceLike;
  supabaseAdmin: SupabaseClient;
  now?: () => number;
}): Promise<SnapshotResult> {
  const { meteoraService, supabaseAdmin, now = Date.now } = deps;
  const pools = await meteoraService.getPools();
  const today = new Date(now()).toISOString().slice(0, 10);

  let succeeded = 0;
  let failed = 0;

  for (const pool of pools) {
    const { error } = await supabaseAdmin
      .from('pool_tvl_daily')
      .upsert({ pool_address: pool.poolAddress, day: today, tvl_usd: pool.stats.tvlUsd }, { onConflict: 'pool_address,day' });

    if (error) {
      failed += 1;
      console.error(`Failed to snapshot TVL for ${pool.poolAddress}:`, error.message);
    } else {
      succeeded += 1;
    }
  }

  return { succeeded, failed };
}

// This worker is meant to run once per day (any time is fine, it upserts by
// UTC date so re-runs the same day are idempotent) via an external
// scheduler — Railway Cron or Render Cron Job calling
// `npm run snapshot:tvl` as a one-off command, NOT an in-process timer in
// the API server (see this project's original architecture notes on why:
// idempotency and horizontal-scaling safety). If this is never scheduled,
// `pool_tvl_daily` stays empty and every pool's history/IL calculator shows
// "not enough recorded history yet" forever.
async function main() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('Missing SUPABASE_URL/SUPABASE_SECRET_KEY — cannot run the TVL snapshot worker.');
    process.exit(1);
  }

  const result = await runSnapshotPoolTvl({
    meteoraService: createMeteoraService(),
    supabaseAdmin: createSupabaseAdmin(url, secretKey),
  });

  console.log(`TVL snapshot done: ${result.succeeded} succeeded, ${result.failed} failed.`);
  process.exit(result.failed > 0 && result.succeeded === 0 ? 1 : 0);
}

// Only run when this file is executed directly (`tsx src/worker/snapshotPoolTvl.ts`),
// never when imported — importing it for tests must not trigger process.exit().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
