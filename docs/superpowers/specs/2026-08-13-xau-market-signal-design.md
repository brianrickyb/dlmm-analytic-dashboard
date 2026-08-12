# XAU/USD Market Signal Page — Design

## Context

The dashboard currently covers Solana DLMM pools only: News (RSS aggregation), Screener
(on-chain pump detection + market positioning), and wallet-liquidity. This spec adds an
unrelated asset class — traditional gold (XAU/USD) — as a self-contained new page: a
self-trained ML direction signal, FinBERT news sentiment, and FRED macro fundamentals, behind
a permanent "not financial advice" disclaimer. This is explicitly scoped to XAU/USD only for
this phase; the code is structured so a second instrument (NASDAQ/S&P500) could be added later
without a rewrite, but no second instrument's data plumbing is built now.

This is the first Python component in an otherwise all-TypeScript/Node monorepo. It lives in
its own isolated branch (`feat/xau-market-signal`), separate from any other in-flight work.

**Everything below was verified against real sources during this design's research phase — not
assumed.** Where verification wasn't possible, that's stated explicitly rather than guessed.

### Confirmed: project integration

- Root `package.json` is a thin `concurrently` wrapper (`npm run dev` → backend + frontend).
  No npm workspaces. Adding a third `ml-service` leg to this script is straightforward but
  requires a working Python environment on whoever runs it — `npm install` can't bootstrap
  Python dependencies.
- Zero existing Python in the repo today.
- Existing backend conventions to extend exactly: `create<X>Service(deps: { fetchImpl?, now?,
  cacheTtlMs? })` factories, `<X>UnavailableError` classes, `register<X>Routes(app, deps = {})`
  DI route registration, flat `SCREAMING_SNAKE_CASE` vars in `backend/.env.example`.
- This session's dev environment has no Python interpreter on `PATH` (`python`/`pip` resolve to
  Windows Store stubs) — but `uv` (a Python package/project manager) is installed and can fetch
  its own standalone CPython build with no system installer. Verified working: `uv venv`, `uv
  pip install`, and running a real script against the resulting venv, all succeeded. Python 3.12
  is the target version (not the newest 3.14 available) since heavy ML packages like `torch`
  more reliably have prebuilt wheels for 3.12.

### Confirmed: XAU/USD dataset (Kaggle)

The user provided the dataset zip directly (`novandraanugrah/xauusd-gold-price-historical-data-2004-2024`,
downloaded via Kaggle's web UI, no API token needed for that). It was unzipped and inspected
with real pandas — not guessed:

- **9 CSV files**, one per granularity: `1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1Month`. All share
  the identical schema: `Date;Open;High;Low;Close;Volume` — **semicolon-delimited**, date
  format `YYYY.MM.DD HH:MM`.
- **`XAU_1d_data.csv`** (the file this spec's model trains on): **5,531 rows, 2004-06-11 through
  2026-01-30**. The dataset is kept close to current despite its Kaggle slug saying
  "2004-2024" — its actual title has since been updated to "2004-2026."
- **Data quality, verified**: zero duplicate dates, zero rows where `High < Low`, zero rows
  where `Close` falls outside `[Low, High]`, zero zero-volume rows. Row count per weekday is
  evenly distributed Monday–Friday with no weekend rows, as expected for a gold/forex-style
  market.
- **Two real gaps** (checked via date-diff analysis, not assumed away): a 33-day gap ending
  2025-10-15, and a 9-day gap ending 2026-01-22. Both must be handled explicitly — rolling-
  window features (moving averages, RSI) must not silently compute across a gap as if it were
  a normal trading-day step.
- **Reproducibility**: the training pipeline documents `kagglehub.dataset_download(...)` (the
  exact snippet the user confirmed from Kaggle's own UI) as the canonical way to re-fetch this
  dataset, with a note that the dataset is actively updated by its author and a specific
  download date should be recorded for reproducibility. The actual training run for this
  feature uses the manually-provided copy directly (no Kaggle API token needed for that), placed
  in a gitignored cache directory.
- **The ~6-month gap to "now"**: since the dataset ends 2026-01-30 and live development is
  happening around 2026-08-13, there's a real gap that plain "live" data can't backfill —
  closing it requires pulling Alpha Vantage's own historical daily series
  (`GOLD_HISTORY`), not just going-forward snapshots.

### Confirmed: live/recent price data — Alpha Vantage, not Twelve Data

The brief's original assumption (Twelve Data free tier) does not hold: Twelve Data's own
pricing page and exchange listing classify XAU/USD as a **Commodity**, gated behind the paid
**Grow tier ($29/mo)** — the free **Basic** tier's documented scope is forex + crypto + equities,
not commodities. This wasn't 100% confirmable with a live test call (no free API key was
obtained during research), but the public pricing page and exchange badge are consistent and
this is the stronger signal.

**Chosen instead: Alpha Vantage**, `GOLD_SPOT` (current) and `GOLD_HISTORY` (daily historical)
functions, confirmed to exist on Alpha Vantage's free tier. The free tier is **25 requests/day**
— materially more restrictive than Twelve Data would have been, which drives the caching design
below (a daily snapshot, not a live-refreshing price).

### Confirmed: FRED series IDs for the fundamentals summary

All verified as real, currently-active FRED series (via search-indexed confirmation of FRED's
own `/series/<ID>` pages — direct WebFetch to fred.stlouisfed.org returned HTTP 403 during
research, so this is search-snippet-level confirmation, noted here rather than overstated):

| Concept | Series ID | Frequency | Notes |
|---|---|---|---|
| Fed funds rate (current) | `DFF` | Daily | Effective Federal Funds Rate |
| Fed funds rate (trend) | `FEDFUNDS` | Monthly | Monthly average of DFF — not used in v1, noted for later |
| 10-year real yield | `DFII10` | Daily | Classic inverse gold driver (TIPS yield) |
| CPI (headline) | `CPIAUCSL` | Monthly | Seasonally adjusted, ~2-3 week reporting lag |
| Broad dollar index | `DTWEXBGS` | Daily | FRED's DXY-equivalent, optional bonus driver |

FRED's API requires a free, self-service API key (no cost, no approval wait,
`fredaccount.stlouisfed.org/apikeys`), with a generous rate limit (commonly cited ~120 req/min)
— no caching pressure like Alpha Vantage's.

### Confirmed: news sources

- **Kitco: dropped.** No working public RSS feed exists — every plausible URL pattern
  (`/rss/`, `/rss/KitcoNews.xml`, category `/feed` variants) returned 404, and the homepage has
  no `<link rel="alternate" type="application/rss+xml">` tag pointing anywhere real.
- **ForexLive → use `https://investinglive.com/feed/news` directly.** ForexLive has rebranded
  to InvestingLive; the old `forexlive.com/feed/news` URL 301-redirects there. Confirmed live,
  valid RSS 2.0, current headlines, genuinely macro/forex-focused (CPI, Fed policy, Treasury
  auctions, geopolitics-driven FX moves).
- **FXStreet: `https://www.fxstreet.com/rss/news`**, confirmed live and working with no access
  friction, strongly gold/forex-relevant sample headlines (including live gold-price coverage
  in the sample pulled during research).

## Goal

A new page at `/markets/xau` showing: a historical + recent price chart, a bullish/bearish
direction signal with a confidence score from a self-trained model, a list of recent gold/forex
news headlines each tagged with FinBERT sentiment, a small fundamentals summary (Fed funds
rate, real yield, CPI, dollar index), and a permanent, always-visible disclaimer that this is an
educational/portfolio demo, not financial advice. The model's real evaluation metrics — good or
mediocre — are reported plainly, never oversold.

## Architecture

### `ml-service/` (Python, FastAPI) — new, isolated from the Node backend

```
ml-service/
  app/
    main.py              # FastAPI app, wires the two route modules below
    routes/
      direction.py        # POST /predict/direction
      sentiment.py         # POST /predict/sentiment
    schemas.py            # pydantic request/response models, shared by both routes
    model_store.py        # loads the trained model artifact + feature-engineering fn at startup
  training/
    download_dataset.py    # kagglehub snippet; downloads into gitignored training/data/
    inspect_schema.py       # prints df.info()/df.head()/date-range/gap-check — the confirmation step
    features.py             # RSI, MA crossover, momentum, volatility — schema documented below
    train.py                 # walk-forward split, trains the classifier, writes model + REPORT.md
    REPORT.md                 # committed: real metrics from the actual training run, limitations stated
  tests/
    test_features.py          # feature-engineering unit tests, small fixture data
    test_api.py                 # FastAPI TestClient contract tests, fake model injected (no real inference)
  pyproject.toml
  README.md                     # env setup (uv), how to reproduce training, how to run the service
  .gitignore                     # training/data/, model artifact binary (documented separately below)
```

**Feature engineering** (`training/features.py`), computed per row on the daily OHLCV series,
gaps handled by treating any row whose date-diff from the previous row exceeds 5 calendar days
as the start of a fresh rolling-window segment (matching the two real gaps found in inspection —
rolling indicators reset rather than spanning the gap):

- `rsi_14`: 14-day Relative Strength Index (Wilder's smoothing) on `Close`.
- `ma_10`, `ma_50`, `ma_crossover`: 10-day and 50-day simple moving averages of `Close`; the
  crossover feature is `ma_10 - ma_50` (sign and magnitude both carry signal, so the raw
  difference is kept rather than binarized).
- `momentum_10`: `Close[t] - Close[t-10]`.
- `volatility_14`: rolling 14-day standard deviation of daily log returns.

**Target**: direction of `Close[t+N]` vs `Close[t]`, binary (`bullish` if the future close is
higher, `bearish` otherwise — no dead-zone/flat class in v1, noted as a possible refinement).
`train.py` trains and evaluates N ∈ {1, 3, 5} separately and reports metrics for all three in
`REPORT.md`; the serving code (`model_store.py`) loads whichever N the report identifies as most
useful (documented, not hardcoded blindly) — if none clearly beats a naive baseline, `REPORT.md`
says so plainly rather than shipping an overclaimed model.

**Split**: walk-forward, not random shuffle. Concretely: expanding-window folds — each fold
trains on all rows up to a cutoff date and evaluates on the following block, then the cutoff
rolls forward. With 5,531 rows spanning ~22 years and a ~60-row warmup for the longest indicator
(`ma_50`), there's ample data for several folds; `train.py` uses 5 folds with roughly yearly
evaluation blocks from ~2019 onward, and reports per-fold metrics, not just an aggregate, so a
single lucky fold can't hide inconsistent performance.

**Classifier**: `sklearn.ensemble.HistGradientBoostingClassifier` — built into scikit-learn, no
extra heavy dependency (XGBoost/LightGBM stay an easy swap noted in `README.md` if performance
warrants it, not pulled in speculatively).

**Model artifact**: saved via `joblib` alongside a small JSON sidecar recording the chosen N,
the feature list (order matters — the exact same feature-computation code path serves live
requests), and the training-data date range. The artifact binary itself is committed to the repo
(it's small — a gradient-boosting model on 4 features is not a multi-hundred-MB file) rather than
gitignored, so the service can start without re-running training; `training/train.py` regenerates
it on demand.

**Serving** (`app/routes/direction.py`, `POST /predict/direction`):
- Input: a recent price window (the backend sends however many trailing daily OHLCV rows are
  needed to compute the warmup-dependent features — `ma_50` needs 50 prior rows — using the same
  `training/features.py` functions imported directly, not reimplemented, so training and serving
  can never drift apart).
- Output: `{ "direction": "bullish" | "bearish", "confidence": number }` — `confidence` is the
  classifier's predicted-class probability.

**Serving** (`app/routes/sentiment.py`, `POST /predict/sentiment`):
- Input: `{ "text": string }` (a news headline).
- Output: `{ "sentiment": "positive" | "negative" | "neutral", "score": number }` via a
  pretrained FinBERT model (`ProsusAI/finbert` via `transformers`) — pretrained only, no
  fine-tuning in this phase.
- The model loads once at service startup (`model_store.py`), not per-request.

### Backend (Fastify) — extends existing patterns exactly

- `services/mlService.ts` — `createMlService(deps: { fetchImpl?, now?, baseUrl? })`, thin HTTP
  client for the two ml-service endpoints, `MlServiceUnavailableError` on network failure or
  non-2xx, matching every existing `*UnavailableError` in this codebase. `baseUrl` defaults from
  a new `ML_SERVICE_URL` env var (`backend/.env.example` gains this alongside the existing
  entries).
- `services/alphaVantage.ts` — `createAlphaVantageService(deps)`, `AlphaVantageUnavailableError`.
  Given the 25-req/day ceiling, caching is aggressive: one daily snapshot fetched and cached for
  the rest of that calendar day (UTC), not a short TTL like the crypto-oriented services in this
  codebase use.
- `services/fred.ts` — `createFredService(deps)`, `FredUnavailableError`, fetches the four
  confirmed series, cached with a multi-hour TTL (matches the series' own daily/monthly update
  cadence — no value in polling more often).
- `services/rss.ts` — extended with FXStreet and InvestingLive as two more entries in
  `FEED_SOURCES` (matches the existing four-source shape exactly); Kitco is not added.
- `routes/markets.ts` — new file:
  - `GET /api/markets/:symbol/signal` — for `symbol === 'xau'`: calls `alphaVantage` (current
    price), `mlService` (direction, fed the recent price window), `rss` + `mlService` (news
    headlines, each individually sentiment-scored), and `fred` (fundamentals), assembling one
    response. Any single upstream failing degrades that section of the response rather than
    failing the whole request (same resilience pattern as the Screener page's independent
    panels) — the route returns `200` with a partial payload plus a per-section `error` field
    where something failed, not a blanket `503` for one degraded piece.
  - `GET /api/markets/:symbol/history` — daily OHLCV series for the chart, backed by the
    Kaggle-derived historical data (packaged as a static asset — see Data packaging below) plus
    Alpha Vantage's `GOLD_HISTORY` for the gap between the dataset's end and today.
  - Any `symbol` other than `xau` returns `404` — the param exists for future extensibility, not
    because a second instrument is implemented now.

**Data packaging for `/history`**: the 5,531-row daily CSV is small (~300KB) — it's copied into
`backend/src/data/xau-daily-history.csv` (committed, not gitignored — this is derived/curated
data the backend serves directly, distinct from the raw multi-file Kaggle download that
`ml-service/training/` works with) and loaded once at service startup, merged with whatever
Alpha Vantage `GOLD_HISTORY` returns for dates after the CSV's last row.

### Frontend

- `frontend/src/pages/MarketSignalPage.tsx` — generic name, reads `symbol` from the route
  (`/markets/:symbol`), but only `xau` is linked from the nav; any other value shows a
  "not available yet" state rather than a broken page.
- `frontend/src/components/SignalBadge.tsx` — bullish/bearish pill (reusing the `Badge`
  component's `good`/`critical` variants — the same green/red vocabulary already used for
  sentiment badges) plus a confidence readout.
- Reuses `HistoryChart.tsx` for the price chart, `NewsList.tsx`'s row-card pattern (extended with
  a sentiment `Badge`, same shape as the existing News page sentiment tags) for the headline
  list, and a new small `FundamentalsSummary.tsx` card for the four FRED values.
- A permanent, non-dismissible disclaimer banner (not a one-time toast) — visible above the fold
  every time the page loads, styled distinctly (e.g. `--status-warning` background tint) so it
  can't be missed or scrolled past unnoticed.
- `frontend/src/lib/api/markets.ts` — `fetchMarketSignal(symbol)`, `fetchMarketHistory(symbol)`,
  same fetch-wrapper shape as `lib/api/news.ts`.

### Dev workflow

- Root `package.json`'s `dev` script gains a third `concurrently` leg:
  `"npm run dev --prefix ml-service"` (itself invoking `uv run uvicorn app.main:app --reload`).
- `ml-service/README.md` documents the exact `uv` setup commands (`uv venv`, `uv pip install -e
  .` or `uv sync` depending on final `pyproject.toml` shape) — running this service requires a
  working Python/uv setup; `npm install` at the root does not and cannot bootstrap it.

## Out of scope

- Any second instrument (NASDAQ, S&P500) — the `symbol` param exists structurally, nothing more.
- Fine-tuning FinBERT — pretrained only.
- A three-class (bullish/bearish/neutral) direction target — binary only in v1, noted as a
  possible refinement once the binary model's real metrics are in.
- `FEDFUNDS` (monthly-average Fed funds) — `DFF` (daily) covers the "current rate" need; the
  monthly series isn't used unless a future trend chart wants it.
- Automated model retraining — `training/train.py` is run manually when needed, not scheduled.
- Any change to the existing News, Screener, or wallet-liquidity pages/routes.

## Testing

- **Python** (`ml-service/tests/`): `test_features.py` — unit tests for RSI/MA/momentum/
  volatility against small hand-computable fixture series (including a fixture that spans a
  simulated gap, to test the reset-on-gap logic). `test_api.py` — FastAPI `TestClient` contract
  tests for both endpoints with a fake/stub model injected (via dependency override), so no real
  training or real FinBERT inference runs in the test suite. Run with `uv run pytest`.
- **Fastify** (`backend/src/routes/markets.test.ts` and one test file per new service): `app
  .inject()` + fake injected `deps`, matching every existing route test in this codebase exactly
  — no test ever hits the real `ml-service`, Alpha Vantage, or FRED.
- **Frontend**: no new component tests, matching this project's established convention.
- **Manual, cross-cutting**: once the ml-service is running locally (`uv run uvicorn ...`), a
  real end-to-end check hitting `/api/markets/xau/signal` and `/history` with the real
  (rate-limited) Alpha Vantage/FRED keys, to confirm the whole chain works — this is the one
  piece that can't be meaningfully faked in an automated test.
