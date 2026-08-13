# ml-service

Python/FastAPI service serving an XAU/USD direction model and FinBERT news sentiment.

## Setup

```bash
uv venv
uv sync
```

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000
```

## Test

```bash
uv run pytest
```

## API

### `POST /predict/direction`

Request:

```json
{
  "prices": [
    {"date": "2026-01-01", "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 1000},
    ...
  ]
}
```

`prices` must be trailing daily OHLCV rows, ascending by date. **Send the entire current
segment** — every row since the most recent gap of more than `GAP_THRESHOLD_DAYS` (10) calendar
days in your source data — not just the last 50 rows. RSI is a recursive (EWM) calculation
seeded at the start of whatever window it's given, so clipping to exactly the 50-row warmup
minimum produces a *different* RSI than training-time computation on the full segment (a real
discrepancy was measured: ~5.5 RSI points at 60 rows vs. the full ~63-row segment). If the
current segment has fewer than 50 rows (e.g. because of a recent data gap), the endpoint returns
`422` with a message reporting how many rows are actually available in the current segment and
the threshold that triggered the reset — sending more historical rows from *before* the gap does
not help, since they're in a different segment and don't count.

Response:

```json
{"direction": "bullish", "confidence": 0.73}
```

### `POST /predict/sentiment`

Request:

```json
{"text": "Gold prices surge to record highs as investors seek safe haven"}
```

Response:

```json
{"sentiment": "positive", "score": 0.91}
```

`sentiment` is one of `"positive"`, `"negative"`, `"neutral"` (FinBERT via `ProsusAI/finbert`).

## Reproducing the training dataset

The daily/intraday XAU/USD price history comes from the Kaggle dataset
`novandraanugrah/xauusd-gold-price-historical-data-2004-2024` (the author keeps it updated past
its slug's stated end year — record the exact download date when you pull it). To re-fetch it:

```python
import kagglehub
path = kagglehub.dataset_download("novandraanugrah/xauusd-gold-price-historical-data-2004-2024")
print("Path to dataset files:", path)
```

This requires a Kaggle account and API credentials (`kaggle.json` or `KAGGLE_USERNAME`+
`KAGGLE_KEY`). Copy `XAU_1d_data.csv` from the downloaded path into `training/data/` (gitignored)
before running `training/train.py`.

## Training the model

After placing the dataset (see above), run the walk-forward training pipeline from `ml-service/`:

```bash
uv run python -m training.train
```

(Not `uv run python training/train.py` directly — that fails with `ModuleNotFoundError: No
module named 'training'` because direct script execution doesn't add the project root to
`sys.path` the way `-m` module execution does.)
