# DLMM Analytic Dashboard

Analytics for Meteora DLMM pools plus an experimental XAU/USD market-signal page.
Three services run concurrently from the repo root:

```
npm install          # once at the root (concurrently) and in backend/ + frontend/
npm run dev          # starts all three: backend :4000, frontend :5173, ml-service :8000
```

## Architecture

| Service | Stack | Role |
|---|---|---|
| `frontend/` | React 19, Vite, Tailwind v4, Vitest (+ jsdom/@testing-library) | Dark-terminal dashboard: pools, screener, news, positions, auth pages, `/markets/xau` signal page |
| `backend/` | Fastify 5, TypeScript (Node 22), Vitest | REST API. Reads Meteora/DLMM SDK on-chain data, RSS news, FRED fundamentals, Alpha Vantage gold; proxies ML inference to ml-service; Supabase admin for persistence |
| `ml-service/` | Python 3.14, FastAPI, uv | Serves the self-trained XAU direction model (`/predict/direction`) and FinBERT sentiment (`/predict/sentiment`) |
| `db/` | Postgres (Supabase) | `schema.sql` is the LIVE schema — only `pool_tvl_daily`. The partitioned time-series design lives in `schema.aspirational.sql` (archived, never applied) |

Data flow highlights:

- Pool list/detail/history endpoints read **Meteora's API directly**; the DB only stores daily TVL snapshots.
- `GET /api/markets/xau/signal` degrades section-by-section (`Promise.allSettled`): direction, news sentiment, and fundamentals fail independently.
- XAU price history = static real-OHLCV CSV (`backend/src/data/xau-daily-history.csv`) + a close-only live tail from Alpha Vantage. Rows after `estimatedFrom` are synthesized OHLCV; every ML feature consumes Close only (enforced by convention, documented in both codebases).
- The frontend renders price staleness explicitly ("As of …" / amber STALE badge) instead of silently showing old data.

## Environment variables

Copy each service's `.env.example` to `.env`.

**backend/**
| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | for worker/account routes | service-role client |
| `SOLANA_RPC_URL` | no | defaults to devnet endpoint |
| `ML_SERVICE_URL` | no | defaults to `http://localhost:8000` |
| `CRYPTOPANIC_API_KEY`, `FRED_API_KEY`, `ALPHA_VANTAGE_API_KEY` | for those features | ALPHA_VANTAGE key is **UNVERIFIED** against the premium-only GOLD endpoint — see `alphaVantage.ts`; staleness badge contains the failure |
| `CORS_ALLOWED_ORIGINS` | production | comma-separated allowlist; unset = reflect any origin (dev only) |

**frontend/** — `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SOLANA_RPC_URL`

**ml-service/** — none required to serve; Kaggle creds needed for dataset refresh scripts.

## Scheduled jobs (deploy checklist)

Both jobs are idempotent one-off commands meant for external schedulers (Railway Cron, Render Cron) — never in-process timers:

1. **Daily TVL snapshot** — `npm run snapshot:tvl` (in `backend/`). Without it, `pool_tvl_daily` stays empty and pool history charts show "not enough recorded history". Missed days are permanent gaps (Meteora has no historical TVL); the worker warns loudly when yesterday is missing.
2. **XAU history refresh** — `uv run python -m training.refresh_backend_csv` (in `ml-service/`). Re-downloads the Kaggle dataset and regenerates the backend's static CSV so most rows stay *real* OHLCV instead of relying on the Alpha Vantage tail.
3. **Model retrain (as needed)** — `uv run python -m training.train` (in `ml-service/`). Regenerates `app/artifacts/*` and `training/REPORT.md`. The served response reports `model_data_through` so stale artifacts are visible in the UI.

## Testing & checks

```bash
cd backend  && npx tsc --noEmit && npm test     # vitest, 190+ unit tests
cd frontend && npm run lint && npm test         # oxlint + vitest (jsdom component tests)
cd frontend && npm run build                    # type-checks + verifies chunk splitting
cd ml-service && uv run python -m compileall app training   # syntax check
```

CI runs all of the above via `.github/workflows/ci.yml` on push/PR.

## Known limitations / roadmap

- **Alpha Vantage GOLD is unverified** (possibly premium-only). The Stooq idea was shelved after live testing showed a JS bot-wall. If a verified provider with real OHLCV appears, `xauHistory.ts` is the single swap point.
- The direction model's honest walk-forward accuracy (51.7%) is below the naive baseline (55.6%) — shipped as pipeline demonstration with permanent disclaimers, not as actionable signal. More promising direction: predict range/volatility (directly actionable for bin positioning) rather than up/down.
- Error tracking (e.g. Sentry) and SSE push for pump-watch/live data are planned but need account setup / feature scoping respectively.
- Frontend page-level test coverage is growing from the new AuthContext + MarketSignalPage suites; most pages still untested.
