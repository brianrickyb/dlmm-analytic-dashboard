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
