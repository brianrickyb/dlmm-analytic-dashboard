# Meridian

One dark terminal for on-chain liquidity, crypto momentum, and macro/FX signals — a Solana DeFi
analytics dashboard (Meteora DLMM pools) plus news sentiment, a perp screener, and a multi-market
gold & forex signal page. Three services run concurrently from the repo root:

```
npm install          # once at the root (concurrently) and in backend/ + frontend/
npm run dev          # starts all three: backend :4000, frontend :5173, ml-service :8000
```

## Architecture

| Service | Stack | Role |
|---|---|---|
| `frontend/` | React 19, Vite, Tailwind v4, Vitest (+ jsdom/@testing-library) | Dark-terminal dashboard: pools, screener, news, positions, auth pages, `/markets/:symbol` gold + FX signal pages |
| `backend/` | Fastify 5, TypeScript (Node 22), Vitest | REST API. Reads Meteora/DLMM SDK on-chain data, RSS news, FRED fundamentals, Yahoo Finance OHLCV; proxies ML inference to ml-service; Supabase admin for persistence |
| `ml-service/` | Python 3.14, FastAPI, uv | Serves the self-trained XAU direction model (`/predict/direction`) and FinBERT sentiment (`/predict/sentiment`) |
| `db/` | Postgres (Supabase) | `schema.sql` is the LIVE schema — `pool_tvl_daily` and `position_cost_basis`. The partitioned time-series design lives in `schema.aspirational.sql` (archived, never applied) |

Data flow highlights:

- Pool list/detail/history endpoints read **Meteora's API directly**; the DB only stores daily TVL snapshots.
- `GET /api/markets/:symbol/signal` serves **nine markets** — XAU/USD, DXY, EUR/USD, GBP/USD,
  USD/JPY, USD/CHF, USD/CAD, AUD/USD, NZD/USD — degrading section-by-section (`Promise.allSettled`):
  prices/technicals, ML direction (gold only), news sentiment, and fundamentals fail independently.
- **Live market data comes from Yahoo Finance's keyless chart API** (`backend/src/services/yahooFinance.ts`),
  returning REAL daily OHLCV with exchange-timezone date handling, holiday-bar skipping, sanity
  checks (high >= low, positive prices) and dedup. Gold merges the static spot CSV below with a
  live COMEX futures tail (`GC=F`) because Yahoo delisted the `XAUUSD=X` spot cross; FX pairs pull
  their full series directly.
- XAU price history = static real-OHLCV CSV (`backend/src/data/xau-daily-history.csv`, 2004→2026)
  + the Yahoo tail. Alpha Vantage's value-only GOLD feed remains only as a close-only *fallback*
  (`estimatedFrom` flags synthesized flat rows); every ML feature consumes Close only.
- A deterministic **technical readout** (`backend/src/lib/technicals.ts` — RSI-14 Wilder,
  SMA10/50 crossover, 10-day momentum, 14-day volatility, mirroring ml-service feature
  definitions) is computed backend-side for **every** market; the honest-accuracy ML direction
  model is shown only for gold, where it was actually trained.
- The frontend renders price staleness explicitly ("As of …" / amber STALE badge, >7 days) instead
  of silently showing old data.

## Environment variables

Copy each service's `.env.example` to `.env`.

**backend/**
| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | for worker/account routes | service-role client |
| `SOLANA_RPC_URL` | no | defaults to devnet endpoint |
| `ML_SERVICE_URL` | no | defaults to `http://localhost:8000` |
| `CRYPTOPANIC_API_KEY`, `FRED_API_KEY`, `ALPHA_VANTAGE_API_KEY` | optional | CryptoPanic/FRED power those features; Alpha Vantage is now only the degraded XAU fallback — Yahoo Finance needs no key |
| `CORS_ALLOWED_ORIGINS` | production | comma-separated allowlist; unset = reflect any origin (dev only) |

**frontend/** — `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SOLANA_RPC_URL`

**ml-service/** — none required to serve; Kaggle creds needed for dataset refresh scripts.

## Scheduled jobs (deploy checklist)

Before first deploy, apply `db/schema.sql` to the Supabase project — it creates both `pool_tvl_daily` and `position_cost_basis`. If `position_cost_basis` is missing in a fresh environment, the position P&L feature degrades gracefully (every cost-basis request just re-derives from chain and logs an error instead of crashing), but it's worth creating up front rather than relying on that fallback.

Both jobs are idempotent one-off commands meant for external schedulers (Railway Cron, Render Cron) — never in-process timers:

1. **Daily TVL snapshot** — `npm run snapshot:tvl` (in `backend/`). Without it, `pool_tvl_daily` stays empty and pool history charts show "not enough recorded history". Missed days are permanent gaps (Meteora has no historical TVL); the worker warns loudly when yesterday is missing.
2. **XAU history refresh** — `uv run python -m training.refresh_backend_csv` (in `ml-service/`). Re-downloads the Kaggle dataset and regenerates the backend's static CSV so most gold rows stay *real spot* OHLCV instead of futures-tail rows.
3. **Model retrain (as needed)** — `uv run python -m training.train` (in `ml-service/`). Regenerates `app/artifacts/*` and `training/REPORT.md`. The served response reports `model_data_through` so stale artifacts are visible in the UI.

## Testing & checks

```bash
cd backend  && npx tsc --noEmit && npm test     # vitest, 210+ unit tests incl. live-provider parsing
cd frontend && npm run lint && npm test         # oxlint + vitest (jsdom component tests)
cd frontend && npm run build                    # type-checks + verifies chunk splitting
cd ml-service && uv run python -m compileall app training   # syntax check
```

CI runs all of the above via `.github/workflows/ci.yml` on push/PR.

## Known limitations / roadmap

- **Gold tail is COMEX futures**, not spot: Yahoo delisted `XAUUSD=X` (404 verified 2026-08-24),
  so the live tail uses `GC=F`. Futures track spot within a small basis (~0.1–1%); all model
  features are close-ratio based so the level offset mostly cancels. Swap point if a keyless spot
  source appears: `XAU_YAHOO_SYMBOL` in `marketHistory.ts`.
- The Alpha Vantage GOLD fallback remains unverified against a real key (possibly premium-only);
  it only matters when Yahoo is down, and its failure path degrades cleanly to static-only history.
- The direction model's honest walk-forward accuracy (51.7%) is below the naive baseline (55.6%) — shipped as pipeline demonstration with permanent disclaimers, not as actionable signal. More promising direction: predict range/volatility (directly actionable for bin positioning) rather than up/down.
- News filtering per market is coarse keyword matching over RSS titles (no structured tags).
- Error tracking (e.g. Sentry) and SSE push for pump-watch/live data are planned but need account setup / feature scoping respectively.
- Frontend page-level test coverage is growing from the AuthContext + MarketSignalPage suites; most pages still untested.
