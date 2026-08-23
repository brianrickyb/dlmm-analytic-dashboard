-- ============================================================
-- ARCHIVED DESIGN — NOT APPLIED TO THE DATABASE. DO NOT RUN.
-- ============================================================
-- This is the earlier revision of db/schema.sql (tokens / pools /
-- pool_snapshots / pool_latest_stats). No code in the app ever wrote to
-- these tables: the pool endpoints read Meteora's API directly and the only
-- persisted analytics live in pool_tvl_daily (see the live schema.sql).
-- Preserved because the partitioning + BRIN + hot-path reasoning below is
-- solid groundwork if this project ever needs server-side time-series.
-- ============================================================

-- =========================================================
-- tokens: token metadata normalized (reused across pools,
-- e.g. USDC appears in dozens of pools — avoid duplicating symbol/decimals)
-- =========================================================
CREATE TABLE tokens (
  mint_address  TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  name          TEXT,
  decimals      SMALLINT NOT NULL,
  logo_uri      TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- pools: rarely-changing pool configuration (one row per pool address)
-- =========================================================
CREATE TABLE pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_address    TEXT NOT NULL UNIQUE,
  token_x_mint    TEXT NOT NULL REFERENCES tokens(mint_address),
  token_y_mint    TEXT NOT NULL REFERENCES tokens(mint_address),
  bin_step        INTEGER NOT NULL,       -- basis points per bin -> price granularity
  base_fee_bps    NUMERIC(10, 4) NOT NULL,
  name            TEXT NOT NULL,          -- e.g. "SOL-USDC"
  is_active       BOOLEAN NOT NULL DEFAULT true, -- soft-delete if a pool disappears from the API
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pools_token_x ON pools (token_x_mint);
CREATE INDEX idx_pools_token_y ON pools (token_y_mint);
CREATE INDEX idx_pools_active  ON pools (is_active) WHERE is_active;

-- =========================================================
-- pool_snapshots: core time-series, partitioned per month.
-- Only stores numbers needed for the trend chart + hypothetical IL
-- calculator (entry price vs current price + range width).
-- Bin liquidity distribution is intentionally NOT stored here.
-- =========================================================
CREATE TABLE pool_snapshots (
  pool_id         UUID NOT NULL REFERENCES pools(id),
  snapshot_at     TIMESTAMPTZ NOT NULL,
  tvl_usd         NUMERIC(24, 6) NOT NULL,
  volume_24h_usd  NUMERIC(24, 6) NOT NULL,
  fees_24h_usd    NUMERIC(24, 6) NOT NULL,
  fee_apr_24h     NUMERIC(10, 4),          -- (fees_24h/tvl)*365*100, precomputed on insert
  active_bin_id   INTEGER NOT NULL,
  current_price   NUMERIC(36, 18) NOT NULL,
  PRIMARY KEY (pool_id, snapshot_at)
) PARTITION BY RANGE (snapshot_at);

-- default partition: safety net if the worker forgets to create the current
-- month's partition (inserts still succeed, never fail with "no partition")
CREATE TABLE pool_snapshots_default PARTITION OF pool_snapshots DEFAULT;

-- example monthly partition (created by the worker, idempotent):
-- CREATE TABLE pool_snapshots_2026_07 PARTITION OF pool_snapshots
--   FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- BRIN index: cheap, effective for data naturally ordered by insert time.
-- Useful for cross-pool by-time-range queries ("market state at hour X yesterday").
CREATE INDEX idx_pool_snapshots_time_brin ON pool_snapshots USING BRIN (snapshot_at);
-- NOTE: PRIMARY KEY (pool_id, snapshot_at) already acts as the composite index
-- for the most common query ("fetch N days of history for pool X"), so no
-- duplicate (pool_id, snapshot_at DESC) index is needed.

-- =========================================================
-- pool_latest_stats: "current" state upserted every snapshot job run.
-- The pool-list endpoint (sortable by TVL/volume/fee APR) reads from here,
-- NOT from pool_snapshots — so the hot path never scans a growing,
-- partitioned history table.
-- =========================================================
CREATE TABLE pool_latest_stats (
  pool_id         UUID PRIMARY KEY REFERENCES pools(id),
  snapshot_at     TIMESTAMPTZ NOT NULL,
  tvl_usd         NUMERIC(24, 6) NOT NULL,
  volume_24h_usd  NUMERIC(24, 6) NOT NULL,
  fees_24h_usd    NUMERIC(24, 6) NOT NULL,
  fee_apr_24h     NUMERIC(10, 4),
  active_bin_id   INTEGER NOT NULL,
  current_price   NUMERIC(36, 18) NOT NULL
);

CREATE INDEX idx_pool_latest_tvl    ON pool_latest_stats (tvl_usd DESC);
CREATE INDEX idx_pool_latest_volume ON pool_latest_stats (volume_24h_usd DESC);
CREATE INDEX idx_pool_latest_apr    ON pool_latest_stats (fee_apr_24h DESC);

-- NOTE: an earlier revision also had a `positions` table caching each wallet's
-- add-liquidity history off-chain. That's redundant — the DLMM SDK's
-- getAllLbPairPositionsByUser() answers "what positions does this wallet hold"
-- directly from on-chain state, which is also the source of truth.
