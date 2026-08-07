-- DLMM Pool Analytics Dashboard — schema tahap 2
-- Plain PostgreSQL (Supabase), tanpa TimescaleDB.
-- Time-series ditangani dengan native RANGE partitioning + composite index.

-- SECURITY NOTE: this schema targets the same Supabase project used by the
-- auth module (frontend/src/lib/supabase.ts). The frontend's publishable key
-- is safe to expose client-side ONLY as long as no table here is queried
-- directly from the client without a Row Level Security policy. If any
-- future code queries these tables from the frontend via supabase-js (rather
-- than through the backend), add RLS policies first.

-- =========================================================
-- tokens: metadata token dinormalisasi (dipakai ulang lintas pool,
-- mis. USDC muncul di puluhan pool — hindari duplikasi symbol/decimals)
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
-- pools: konfigurasi pool yang jarang berubah (satu baris per pool address)
-- =========================================================
CREATE TABLE pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_address    TEXT NOT NULL UNIQUE,
  token_x_mint    TEXT NOT NULL REFERENCES tokens(mint_address),
  token_y_mint    TEXT NOT NULL REFERENCES tokens(mint_address),
  bin_step        INTEGER NOT NULL,       -- basis points per bin -> granularitas harga
  base_fee_bps    NUMERIC(10, 4) NOT NULL,
  name            TEXT NOT NULL,          -- e.g. "SOL-USDC"
  is_active       BOOLEAN NOT NULL DEFAULT true, -- soft-delete kalau pool hilang dari API
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pools_token_x ON pools (token_x_mint);
CREATE INDEX idx_pools_token_y ON pools (token_y_mint);
CREATE INDEX idx_pools_active  ON pools (is_active) WHERE is_active;

-- =========================================================
-- pool_snapshots: time-series inti, di-partition per bulan.
-- HANYA menyimpan angka yang dibutuhkan untuk trend chart + kalkulator
-- IL hipotetis (entry price vs current price + range width).
-- Bin liquidity distribution TIDAK disimpan di sini (lihat catatan di bawah).
-- =========================================================
CREATE TABLE pool_snapshots (
  pool_id         UUID NOT NULL REFERENCES pools(id),
  snapshot_at     TIMESTAMPTZ NOT NULL,
  tvl_usd         NUMERIC(24, 6) NOT NULL,
  volume_24h_usd  NUMERIC(24, 6) NOT NULL,
  fees_24h_usd    NUMERIC(24, 6) NOT NULL,
  fee_apr_24h     NUMERIC(10, 4),          -- (fees_24h/tvl)*365*100, precomputed saat insert
  active_bin_id   INTEGER NOT NULL,
  current_price   NUMERIC(36, 18) NOT NULL,
  PRIMARY KEY (pool_id, snapshot_at)
) PARTITION BY RANGE (snapshot_at);

-- partisi default: jaring pengaman kalau worker lupa buat partisi bulan berjalan
-- (insert tetap sukses, tidak pernah gagal karena "no partition")
CREATE TABLE pool_snapshots_default PARTITION OF pool_snapshots DEFAULT;

-- contoh partisi bulanan (dibuat otomatis oleh worker, idempotent, lihat catatan)
-- CREATE TABLE pool_snapshots_2026_07 PARTITION OF pool_snapshots
--   FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- BRIN index: murah, efektif untuk data yang secara alami terurut oleh waktu insert.
-- Berguna untuk query lintas-pool by time range (mis. "kondisi market jam X kemarin").
CREATE INDEX idx_pool_snapshots_time_brin ON pool_snapshots USING BRIN (snapshot_at);
-- Catatan: PRIMARY KEY (pool_id, snapshot_at) sudah otomatis jadi composite index
-- untuk query paling umum ("ambil histori N hari untuk pool X"), jadi tidak perlu
-- index tambahan (pool_id, snapshot_at DESC) yang duplikatif.

-- =========================================================
-- pool_latest_stats: state "saat ini" yang di-upsert setiap kali snapshot job
-- jalan. Endpoint list pool (sortable by TVL/volume/fee APR) baca dari sini,
-- BUKAN dari pool_snapshots — supaya hot path tidak perlu scan tabel history
-- yang terus bertambah dan ter-partisi.
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

-- =========================================================
-- subscriptions: Stripe subscription state per user, one row per user
-- (single premium plan). Upserted on checkout.session.completed, kept in
-- sync by customer.subscription.updated/.deleted and invoice.paid.
-- RLS enabled with NO policies for anon/authenticated: this table is only
-- ever read/written by the backend via the Supabase service-role client,
-- which bypasses RLS by design. The default-deny posture is defense-in-
-- depth, not the actual access path (same reasoning as the SECURITY NOTE
-- at the top of this file).
-- =========================================================
CREATE TABLE subscriptions (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id),
  stripe_customer_id      TEXT NOT NULL,
  stripe_subscription_id  TEXT NOT NULL UNIQUE,
  status                  TEXT NOT NULL, -- 'active' | 'past_due' | 'canceled'
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);
