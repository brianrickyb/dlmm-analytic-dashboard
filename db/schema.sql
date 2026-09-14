-- Meridian — live schema (pool_tvl_daily only)
-- Plain PostgreSQL (Supabase).
--
-- SCOPE NOTE: an earlier revision of this file also defined tokens, pools,
-- pool_snapshots (partitioned time-series) and pool_latest_stats. Nothing in
-- the app ever wrote to those tables — the pool list/detail/history endpoints
-- read Meteora's API directly — so they were removed from the live schema.
-- The full design (partitioning, BRIN index and hot-path reasoning) is kept
-- verbatim in db/schema.aspirational.sql if a server-side time-series
-- pipeline is ever built. Keep this file limited to what's actually used.

-- SECURITY NOTE: this schema targets the same Supabase project used by the
-- auth module (frontend/src/lib/supabase.ts). The frontend's publishable key
-- is safe to expose client-side ONLY as long as no table here is queried
-- directly from the client without a Row Level Security policy. If any
-- future code queries these tables from the frontend via supabase-js (rather
-- than through the backend), add RLS policies first.

-- =========================================================
-- pool_tvl_daily: minimal daily TVL snapshot, filled by a scheduled worker
-- (backend/src/worker/snapshotPoolTvl.ts). Meteora's public API gives current
-- TVL only (no historical TVL endpoint) but DOES give historical price
-- (OHLCV) and volume/fees directly — this table exists solely to cover that
-- one remaining gap, so it's deliberately small (~50 curated pools x one
-- row/day). A missed cron day leaves a permanent hole: there is nothing to
-- backfill from.
-- =========================================================
CREATE TABLE pool_tvl_daily (
  pool_address  TEXT NOT NULL,
  day           DATE NOT NULL,
  tvl_usd       NUMERIC(24, 6) NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_address, day)
);

ALTER TABLE pool_tvl_daily ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- position_cost_basis: immutable, derived-once entry price/deposit for a
-- real wallet position, keyed by the position's own on-chain address. This
-- is NOT a cache of live position state (on-chain via
-- getAllLbPairPositionsByUser stays the source of truth for that) — it's an
-- expensive-to-derive historical fact (decoded from the position's own
-- deposit transaction) that cannot drift once written, so caching it does
-- not reopen the "no positions cache" decision documented above pool_tvl_daily.
-- =========================================================
CREATE TABLE position_cost_basis (
  position_address    TEXT PRIMARY KEY,
  pool_address        TEXT NOT NULL,
  entry_date          DATE NOT NULL,
  entry_price         NUMERIC(24, 6) NOT NULL,
  deposit_x_amount    NUMERIC(24, 6) NOT NULL,
  deposit_y_amount    NUMERIC(24, 6) NOT NULL,
  tx_signature        TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE position_cost_basis ENABLE ROW LEVEL SECURITY;
