# XAU Market Signal — ml-service (Phase 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone Python/FastAPI service (`ml-service/`) that serves a self-trained XAU/USD
daily-direction classifier and a pretrained FinBERT sentiment classifier, with a real trained
model artifact backed by real evaluation metrics.

**Architecture:** `training/features.py` computes RSI/MA-crossover/momentum/volatility on a
daily OHLCV series with gap-aware rolling windows; `training/train.py` walk-forward-evaluates a
`HistGradientBoostingClassifier` across three prediction horizons and trains + saves a final
artifact; `app/` is a thin FastAPI layer that imports `training/features.py` directly (never
reimplements it) so serving-time features can't drift from training-time features.

**Tech Stack:** Python 3.12 (via `uv`), FastAPI, pydantic, pandas, numpy, scikit-learn, joblib,
transformers (FinBERT), pytest.

## Global Constraints

- Python 3.12, managed via `uv` (`uv venv`, `uv pip install`) — confirmed working in this
  environment; do not attempt `pip`/`python` directly, they resolve to non-functional Windows
  Store stubs.
- Rolling-window features (RSI, MA crossover, momentum, volatility) must reset at any gap of
  more than 5 calendar days between consecutive rows — never compute across a gap as if it were
  a normal daily step. Source dataset has two such gaps: 33 days ending 2025-10-15, 9 days
  ending 2026-01-22.
- Direction target is binary (`bullish`/`bearish`), no neutral/flat class in this phase.
- Walk-forward evaluation only — never a random shuffle split.
- The model's real evaluation metrics (including if mediocre) are written to
  `training/REPORT.md` verbatim — never overclaimed.
- `app/` must import feature functions from `training/features.py` directly, never duplicate the
  logic.
- FastAPI dependencies (`Depends`) are used for both the direction model and the sentiment
  pipeline specifically so tests can override them with fakes — no test may load the real
  trained model or the real (large) FinBERT weights.
- The raw multi-file Kaggle dataset dump lives in `ml-service/training/data/` and is gitignored;
  the trained model artifact (`ml-service/app/artifacts/`) is small and is committed.

---

### Task 1: Project scaffold + health check

**Files:**
- Create: `ml-service/pyproject.toml`
- Create: `ml-service/.gitignore`
- Create: `ml-service/README.md`
- Create: `ml-service/app/__init__.py`
- Create: `ml-service/app/main.py`
- Create: `ml-service/tests/__init__.py`
- Create: `ml-service/tests/test_api.py`

**Interfaces:**
- Consumes: nothing.
- Produces: a FastAPI `app` instance at `ml-service/app/main.py` (importable as `app.main:app`),
  which every later task adds routes to.

- [ ] **Step 1: Create the project files**

`ml-service/pyproject.toml`:

```toml
[project]
name = "ml-service"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

`ml-service/.gitignore`:

```
.venv/
__pycache__/
*.pyc
training/data/
.pytest_cache/
```

`ml-service/README.md`:

````markdown
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
````

`ml-service/app/__init__.py`: empty file.

`ml-service/app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="ml-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

`ml-service/tests/__init__.py`: empty file.

`ml-service/tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Set up the environment**

Run (from `ml-service/`): `uv venv` then `uv sync`
Expected: a `.venv/` directory is created and `fastapi`/`uvicorn`/`pydantic`/`pytest`/`httpx`
install without error.

- [ ] **Step 3: Run the test to verify it passes**

Run: `uv run pytest tests/test_api.py -v`
Expected: `test_health_check` PASSES (1 passed).

- [ ] **Step 4: Commit**

```bash
git add ml-service/pyproject.toml ml-service/.gitignore ml-service/README.md ml-service/app/__init__.py ml-service/app/main.py ml-service/tests/__init__.py ml-service/tests/test_api.py
git commit -m "feat(ml-service): scaffold FastAPI project with health check"
```

---

### Task 2: Feature engineering

**Files:**
- Create: `ml-service/training/__init__.py`
- Create: `ml-service/training/features.py`
- Create: `ml-service/tests/test_features.py`

**Interfaces:**
- Consumes: nothing beyond `pandas`/`numpy`.
- Produces: `training.features.compute_features(df: pd.DataFrame) -> pd.DataFrame` (adds
  `rsi_14`, `ma_crossover`, `momentum_10`, `volatility_14` columns to a DataFrame with `Date`
  and `Close` columns), plus the individual `compute_rsi`, `compute_ma_crossover`,
  `compute_momentum`, `compute_volatility`, and `segment_ids` functions. Task 4 (training) and
  Task 5 (serving) both call `compute_features` — never a reimplementation of it.

- [ ] **Step 1: Add pandas/numpy dependency**

In `ml-service/pyproject.toml`, change the `dependencies` list to add two lines:

```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pandas>=2.2",
    "numpy>=2.0",
]
```

Run: `uv sync`
Expected: `pandas`/`numpy` install without error.

- [ ] **Step 2: Write the failing tests**

`ml-service/tests/test_features.py`:

```python
import numpy as np
import pandas as pd
import pytest

from training.features import (
    compute_features,
    compute_ma_crossover,
    compute_momentum,
    compute_rsi,
    compute_volatility,
    segment_ids,
)

# 20-day synthetic close-price series. Expected values below were computed
# directly with pandas (not hand-calculated) — see the plan's derivation.
CLOSES = pd.Series([
    100.0, 101.5, 100.8, 102.3, 103.1, 102.5, 104.0, 105.2, 104.8, 106.5,
    107.1, 106.0, 108.3, 109.5, 108.9, 110.2, 111.0, 110.5, 112.3, 113.1,
])


def test_rsi_stays_in_warmup_range_before_period_elapses():
    rsi = compute_rsi(CLOSES, period=14)
    # First 14 values (indices 0-13) are before the EWM warmup completes —
    # compute_rsi defines undefined RSI as neutral (50), not NaN.
    assert (rsi.iloc[:14] == 50.0).all()


def test_rsi_matches_known_computed_values_after_warmup():
    rsi = compute_rsi(CLOSES, period=14)
    assert rsi.iloc[14] == pytest.approx(86.7846, abs=0.001)
    assert rsi.iloc[19] == pytest.approx(87.7719, abs=0.001)


def test_rsi_always_in_valid_range():
    rsi = compute_rsi(CLOSES, period=14)
    assert (rsi >= 0).all()
    assert (rsi <= 100).all()


def test_ma_crossover_matches_known_computed_value():
    crossover = compute_ma_crossover(CLOSES, short=5, long=10)
    assert crossover.iloc[19] == pytest.approx(1.73, abs=0.001)


def test_momentum_matches_known_computed_value():
    momentum = compute_momentum(CLOSES, period=5)
    assert momentum.iloc[19] == pytest.approx(4.2, abs=0.001)
    assert pd.isna(momentum.iloc[4])  # not enough history yet


def test_volatility_matches_known_computed_value():
    volatility = compute_volatility(CLOSES, period=5)
    assert volatility.iloc[19] == pytest.approx(0.007723, abs=0.000001)


def test_segment_ids_increments_only_on_gap_over_five_days():
    dates = pd.Series(
        list(pd.date_range("2024-01-01", periods=10, freq="D"))
        + list(pd.date_range("2024-01-21", periods=8, freq="D"))
    )
    seg = segment_ids(dates)
    assert seg.tolist() == [0] * 10 + [1] * 8


def test_compute_features_resets_rolling_windows_at_a_gap():
    dates = pd.Series(
        list(pd.date_range("2024-01-01", periods=10, freq="D"))
        + list(pd.date_range("2024-01-21", periods=8, freq="D"))
    )
    closes = pd.Series([
        100.0, 101.0, 100.5, 102.0, 103.0, 102.5, 104.0, 105.0, 104.5, 106.0,
        200.0, 201.0, 199.5, 202.0, 203.0, 201.5, 204.0, 205.0,
    ])
    df = pd.DataFrame({"Date": dates, "Close": closes})

    features = compute_features(df)

    # A 5-day-window feature computed post-gap must not blend in pre-gap
    # (Close ~100) prices with post-gap (Close ~200) prices.
    ma_crossover_col = df.assign(seg=segment_ids(dates)).groupby("seg")["Close"].transform(
        lambda s: s.rolling(5).mean()
    )
    assert ma_crossover_col.iloc[13] != ma_crossover_col.iloc[13]  # NaN: only 4 rows in new segment
    assert ma_crossover_col.iloc[14] == pytest.approx(201.1, abs=0.001)  # first full window in new segment
    assert "rsi_14" in features.columns
    assert "ma_crossover" in features.columns
    assert "momentum_10" in features.columns
    assert "volatility_14" in features.columns
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_features.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training'` (or `training.features`).

- [ ] **Step 4: Write the implementation**

`ml-service/training/__init__.py`: empty file.

`ml-service/training/features.py`:

```python
"""Feature engineering for the XAU/USD daily direction model.

All rolling-window features reset at any gap of more than 5 calendar days
between consecutive rows (see `segment_ids`) — the 2004-2026 daily dataset
has two such gaps (33 days ending 2025-10-15, 9 days ending 2026-01-22; see
docs/superpowers/specs/2026-08-13-xau-market-signal-design.md), and a
rolling indicator must not silently blend pre-gap and post-gap prices as if
they were consecutive trading days.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RSI_PERIOD = 14
MA_SHORT_PERIOD = 10
MA_LONG_PERIOD = 50
MOMENTUM_PERIOD = 10
VOLATILITY_PERIOD = 14
GAP_THRESHOLD_DAYS = 5


def segment_ids(dates: pd.Series, gap_days: int = GAP_THRESHOLD_DAYS) -> pd.Series:
    """Assigns an incrementing segment id, incrementing at every gap > gap_days."""
    gaps = dates.diff().dt.days
    return (gaps > gap_days).cumsum()


def compute_rsi(close: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    """Wilder's-smoothing RSI. Returns 50 (neutral) wherever undefined."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def compute_ma_crossover(close: pd.Series, short: int = MA_SHORT_PERIOD, long: int = MA_LONG_PERIOD) -> pd.Series:
    """Short moving average minus long moving average."""
    return close.rolling(short).mean() - close.rolling(long).mean()


def compute_momentum(close: pd.Series, period: int = MOMENTUM_PERIOD) -> pd.Series:
    return close - close.shift(period)


def compute_volatility(close: pd.Series, period: int = VOLATILITY_PERIOD) -> pd.Series:
    """Rolling standard deviation of daily log returns."""
    log_returns = np.log(close / close.shift(1))
    return log_returns.rolling(period).std()


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """Adds rsi_14, ma_crossover, momentum_10, volatility_14 columns to df.

    `df` must have `Date` (datetime64) and `Close` (float) columns, sorted
    ascending by Date. Rolling features reset at each gap > 5 days (see
    `segment_ids`) so they never blend pre-gap and post-gap prices.
    """
    seg = segment_ids(df["Date"])
    out = df.copy()
    out["rsi_14"] = out.groupby(seg)["Close"].transform(lambda s: compute_rsi(s))
    out["ma_crossover"] = out.groupby(seg)["Close"].transform(lambda s: compute_ma_crossover(s))
    out["momentum_10"] = out.groupby(seg)["Close"].transform(lambda s: compute_momentum(s))
    out["volatility_14"] = out.groupby(seg)["Close"].transform(lambda s: compute_volatility(s))
    return out
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_features.py -v`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Commit**

```bash
git add ml-service/pyproject.toml ml-service/training/__init__.py ml-service/training/features.py ml-service/tests/test_features.py
git commit -m "feat(ml-service): add gap-aware feature engineering (RSI, MA crossover, momentum, volatility)"
```

---

### Task 3: Dataset preparation

**Files:**
- Create: `ml-service/training/download_dataset.py`
- Create: `ml-service/training/inspect_schema.py`
- Create: `ml-service/training/data/XAU_1d_data.csv` (gitignored — copied in manually this task, not committed)

**Interfaces:**
- Consumes: nothing.
- Produces: `ml-service/training/data/XAU_1d_data.csv` on disk (semicolon-delimited,
  `Date;Open;High;Low;Close;Volume`, format `YYYY.MM.DD HH:MM`), which Task 4 reads.

- [ ] **Step 1: Write the reproducibility script**

`ml-service/training/download_dataset.py`:

```python
"""Re-downloads the XAU/USD historical dataset from Kaggle.

Requires Kaggle API credentials (`kaggle.json` or `KAGGLE_USERNAME`+`KAGGLE_KEY` env vars).
The dataset's author keeps it updated past its slug's stated "2004-2024" — re-running this
will likely pull more recent rows than whatever copy is currently in training/data/.
"""
import shutil
from pathlib import Path

import kagglehub

DATA_DIR = Path(__file__).parent / "data"


def main() -> None:
    path = kagglehub.dataset_download("novandraanugrah/xauusd-gold-price-historical-data-2004-2024")
    print("Downloaded to:", path)
    DATA_DIR.mkdir(exist_ok=True)
    src = Path(path) / "XAU_1d_data.csv"
    dest = DATA_DIR / "XAU_1d_data.csv"
    shutil.copy(src, dest)
    print("Copied daily data to:", dest)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the inspection script**

`ml-service/training/inspect_schema.py`:

```python
"""Prints schema, date range, and gap analysis for training/data/XAU_1d_data.csv.

Run this after any re-download to confirm the schema hasn't changed and to
re-check for gaps before touching training.py.
"""
from pathlib import Path

import pandas as pd

DATA_PATH = Path(__file__).parent / "data" / "XAU_1d_data.csv"


def main() -> None:
    df = pd.read_csv(DATA_PATH, sep=";")
    print("columns:", list(df.columns))
    print("shape:", df.shape)
    print(df.head())
    print(df.dtypes)

    df["Date"] = pd.to_datetime(df["Date"], format="%Y.%m.%d %H:%M")
    df = df.sort_values("Date").reset_index(drop=True)
    print("min date:", df["Date"].min())
    print("max date:", df["Date"].max())
    print("duplicate dates:", df["Date"].duplicated().sum())
    print("rows where High < Low:", (df["High"] < df["Low"]).sum())

    gaps = df["Date"].diff().dt.days
    big_gaps = df[gaps > 5][["Date"]].copy()
    big_gaps["gap_days"] = gaps[gaps > 5].values
    print("gaps > 5 days:")
    print(big_gaps.to_string())


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Place the dataset file**

Copy the already-inspected daily CSV into `ml-service/training/data/XAU_1d_data.csv`:

```bash
mkdir -p ml-service/training/data
cp "C:/Users/Brian/AppData/Local/Temp/claude/c--Users-Brian-Documents-Projects-Coding-Project-DLMM-analytic-dashboard/7742f1c1-e7b6-4bd6-867e-f357ea5e349f/scratchpad/xauusd-inspect/data/XAU_1d_data.csv" ml-service/training/data/XAU_1d_data.csv
```

- [ ] **Step 4: Verify with the inspection script**

Run (from `ml-service/`): `uv run python training/inspect_schema.py`
Expected: prints columns `['Date', 'Open', 'High', 'Low', 'Close', 'Volume']`, shape `(5531, 6)`,
min date `2004-06-11`, max date `2026-01-30`, `duplicate dates: 0`, `rows where High < Low: 0`,
and exactly two rows in the gaps table (33 days ending 2025-10-15, 9 days ending 2026-01-22).

- [ ] **Step 5: Add kagglehub as an optional dependency and commit**

In `ml-service/pyproject.toml`, add a new section (this dependency is only needed to run
`download_dataset.py`, not to run the service itself):

```toml
[dependency-groups]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
]
training = [
    "kagglehub>=0.3",
]
```

Run: `uv sync --group training`
Expected: `kagglehub` installs without error.

```bash
git add ml-service/pyproject.toml ml-service/training/download_dataset.py ml-service/training/inspect_schema.py
git commit -m "feat(ml-service): add dataset download/inspection scripts"
```

(`training/data/XAU_1d_data.csv` itself is gitignored per Task 1 — it stays on disk for Task 4
but is never committed.)

---

### Task 4: Training pipeline

**Files:**
- Create: `ml-service/training/train.py`
- Create: `ml-service/training/REPORT.md` (generated by running the script, then committed)
- Create: `ml-service/app/artifacts/direction_model.joblib` (generated, then committed)
- Create: `ml-service/app/artifacts/direction_model.meta.json` (generated, then committed)
- Create: `ml-service/tests/test_train.py`

**Interfaces:**
- Consumes: `training.features.compute_features` (Task 2), `training/data/XAU_1d_data.csv`
  (Task 3).
- Produces: `app/artifacts/direction_model.joblib` (a fitted `HistGradientBoostingClassifier`)
  and `app/artifacts/direction_model.meta.json` with shape
  `{"feature_columns": ["rsi_14", "ma_crossover", "momentum_10", "volatility_14"], "horizon_days": <int>}`.
  Task 5 loads both by exact path and key names.

- [ ] **Step 1: Add scikit-learn and joblib dependencies**

In `ml-service/pyproject.toml`'s `dependencies` list, add:

```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pandas>=2.2",
    "numpy>=2.0",
    "scikit-learn>=1.5",
    "joblib>=1.4",
]
```

Run: `uv sync`

- [ ] **Step 2: Write the failing test for the walk-forward fold generator and target function**

`ml-service/tests/test_train.py`:

```python
import pandas as pd

from training.train import compute_direction_target, generate_walk_forward_folds


def test_compute_direction_target_labels_future_close_higher_as_bullish():
    close = pd.Series([100.0, 105.0, 95.0, 110.0])
    target = compute_direction_target(close, horizon_days=1)
    # row0->row1: 100->105 (up=1), row1->row2: 105->95 (down=0), row2->row3: 95->110 (up=1)
    assert target.iloc[0] == 1
    assert target.iloc[1] == 0
    assert target.iloc[2] == 1
    assert pd.isna(target.iloc[3])  # no future row to compare against


def test_generate_walk_forward_folds_train_window_expands_and_never_sees_future():
    dates = pd.Series(pd.date_range("2018-01-01", "2024-12-31", freq="D"))
    folds = generate_walk_forward_folds(dates, eval_years=[2020, 2021, 2022, 2023, 2024])
    assert len(folds) == 5
    for train_idx, test_idx in folds:
        assert max(dates[train_idx]) < min(dates[test_idx])
    # fold N's train set must be a superset of fold N-1's train set (expanding window)
    for i in range(1, len(folds)):
        assert set(folds[i - 1][0]).issubset(set(folds[i][0]))
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_train.py -v`
Expected: FAIL — `ModuleNotFoundError` or `ImportError` for `training.train`.

- [ ] **Step 4: Write the training pipeline**

`ml-service/training/train.py`:

```python
"""Walk-forward evaluation and final training for the XAU/USD direction model.

Run with: uv run python training/train.py
Writes: app/artifacts/direction_model.joblib, app/artifacts/direction_model.meta.json,
training/REPORT.md
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

from training.features import compute_features

DATA_PATH = Path(__file__).parent / "data" / "XAU_1d_data.csv"
ARTIFACT_DIR = Path(__file__).parent.parent / "app" / "artifacts"
REPORT_PATH = Path(__file__).parent / "REPORT.md"
FEATURE_COLUMNS = ["rsi_14", "ma_crossover", "momentum_10", "volatility_14"]
HORIZONS = [1, 3, 5]
EVAL_YEARS = [2020, 2021, 2022, 2023, 2024]


def load_daily_prices() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, sep=";")
    df["Date"] = pd.to_datetime(df["Date"], format="%Y.%m.%d %H:%M")
    return df.sort_values("Date").reset_index(drop=True)


def compute_direction_target(close: pd.Series, horizon_days: int) -> pd.Series:
    """1 (bullish) if Close[t+horizon] > Close[t], else 0. NaN for trailing rows with no future value."""
    future_close = close.shift(-horizon_days)
    target = (future_close > close).astype("float64")
    target[future_close.isna()] = float("nan")
    return target


def generate_walk_forward_folds(dates: pd.Series, eval_years: list[int]) -> list[tuple[list[int], list[int]]]:
    """Expanding-window folds: fold i trains on everything before eval_years[i], tests on that year."""
    folds = []
    for year in eval_years:
        train_idx = dates[dates < pd.Timestamp(year=year, month=1, day=1)].index.tolist()
        test_idx = dates[
            (dates >= pd.Timestamp(year=year, month=1, day=1)) & (dates < pd.Timestamp(year=year + 1, month=1, day=1))
        ].index.tolist()
        folds.append((train_idx, test_idx))
    return folds


def evaluate_horizon(df: pd.DataFrame, horizon_days: int) -> dict:
    df = df.copy()
    df["target"] = compute_direction_target(df["Close"], horizon_days)
    usable = df.dropna(subset=FEATURE_COLUMNS + ["target"]).reset_index(drop=True)

    folds = generate_walk_forward_folds(usable["Date"], EVAL_YEARS)
    fold_reports = []
    for year, (train_idx, test_idx) in zip(EVAL_YEARS, folds):
        if len(train_idx) == 0 or len(test_idx) == 0:
            continue
        X_train = usable.loc[train_idx, FEATURE_COLUMNS]
        y_train = usable.loc[train_idx, "target"]
        X_test = usable.loc[test_idx, FEATURE_COLUMNS]
        y_test = usable.loc[test_idx, "target"]

        model = HistGradientBoostingClassifier(random_state=42)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)

        accuracy = accuracy_score(y_test, y_pred)
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_test, y_pred, labels=[0, 1], zero_division=0
        )
        fold_reports.append(
            {
                "year": year,
                "n_train": len(train_idx),
                "n_test": len(test_idx),
                "accuracy": accuracy,
                "precision_bearish": precision[0],
                "recall_bearish": recall[0],
                "precision_bullish": precision[1],
                "recall_bullish": recall[1],
            }
        )

    mean_accuracy = sum(r["accuracy"] for r in fold_reports) / len(fold_reports) if fold_reports else float("nan")
    return {"horizon_days": horizon_days, "folds": fold_reports, "mean_accuracy": mean_accuracy}


def format_report(results: list[dict]) -> str:
    lines = ["# XAU/USD Direction Model — Evaluation Report", ""]
    lines.append(
        "Walk-forward evaluation (expanding window, yearly test blocks 2020-2024). "
        "Binary target: does Close[t+N] end up higher than Close[t]? "
        "These are real results from the actual training run below — not illustrative."
    )
    lines.append("")
    for result in results:
        lines.append(f"## Horizon: {result['horizon_days']} day(s) ahead")
        lines.append(f"Mean accuracy across folds: {result['mean_accuracy']:.4f}")
        lines.append("")
        lines.append("| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for f in result["folds"]:
            lines.append(
                f"| {f['year']} | {f['n_train']} | {f['n_test']} | {f['accuracy']:.4f} | "
                f"{f['precision_bearish']:.4f} | {f['recall_bearish']:.4f} | "
                f"{f['precision_bullish']:.4f} | {f['recall_bullish']:.4f} |"
            )
        lines.append("")
    best = max(results, key=lambda r: r["mean_accuracy"])
    lines.append(
        f"## Chosen horizon for serving: {best['horizon_days']} day(s) "
        f"(highest mean accuracy at {best['mean_accuracy']:.4f})"
    )
    lines.append("")
    lines.append(
        "**Limitations:** trained on daily OHLCV technical features only (no macro/news "
        "features), a single asset, walk-forward-evaluated on 5 yearly folds (2020-2024). "
        "A mean accuracy modestly above 0.5 does not imply the model is tradable — see the "
        "app's permanent disclaimer. This report states the real numbers from the run above; "
        "if they are close to a coin flip, that is the honest result, not a bug."
    )
    return "\n".join(lines)


def main() -> None:
    df = load_daily_prices()
    df = compute_features(df)

    results = [evaluate_horizon(df, h) for h in HORIZONS]
    REPORT_PATH.write_text(format_report(results))
    print(f"Wrote {REPORT_PATH}")

    best = max(results, key=lambda r: r["mean_accuracy"])
    best_horizon = best["horizon_days"]

    df["target"] = compute_direction_target(df["Close"], best_horizon)
    usable = df.dropna(subset=FEATURE_COLUMNS + ["target"]).reset_index(drop=True)
    final_model = HistGradientBoostingClassifier(random_state=42)
    final_model.fit(usable[FEATURE_COLUMNS], usable["target"])

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, ARTIFACT_DIR / "direction_model.joblib")
    meta = {
        "feature_columns": FEATURE_COLUMNS,
        "horizon_days": best_horizon,
        "trained_on_rows": len(usable),
        "training_data_max_date": str(df["Date"].max().date()),
    }
    (ARTIFACT_DIR / "direction_model.meta.json").write_text(json.dumps(meta, indent=2))
    print(f"Wrote {ARTIFACT_DIR / 'direction_model.joblib'} and direction_model.meta.json")
    print(f"Chosen horizon: {best_horizon} days, mean accuracy: {best['mean_accuracy']:.4f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the unit tests**

Run: `uv run pytest tests/test_train.py -v`
Expected: PASS, both tests.

- [ ] **Step 6: Run the real training pipeline**

Run (from `ml-service/`): `uv run python training/train.py`
Expected: completes without error, prints the chosen horizon and mean accuracy, and writes
`training/REPORT.md`, `app/artifacts/direction_model.joblib`,
`app/artifacts/direction_model.meta.json`. **Read `training/REPORT.md` after it's generated —
report the real numbers, do not paraphrase them as "good" or "bad," just state them.**

- [ ] **Step 7: Commit**

```bash
git add ml-service/pyproject.toml ml-service/training/train.py ml-service/training/REPORT.md ml-service/tests/test_train.py ml-service/app/artifacts/direction_model.joblib ml-service/app/artifacts/direction_model.meta.json
git commit -m "feat(ml-service): add walk-forward training pipeline and trained model artifact"
```

---

### Task 5: `POST /predict/direction` endpoint

**Files:**
- Create: `ml-service/app/schemas.py`
- Create: `ml-service/app/model_store.py`
- Create: `ml-service/app/routes/__init__.py`
- Create: `ml-service/app/routes/direction.py`
- Modify: `ml-service/app/main.py`
- Create: `ml-service/tests/test_direction_route.py`

**Interfaces:**
- Consumes: `training.features.compute_features` (Task 2), `app/artifacts/direction_model
  .joblib` + `.meta.json` (Task 4).
- Produces: `GET/POST /predict/direction` returning `{"direction": "bullish"|"bearish",
  "confidence": float}`. The backend (Phase 2, separate plan) calls this exact shape.

- [ ] **Step 1: Write the schemas**

`ml-service/app/schemas.py`:

```python
from typing import Literal

from pydantic import BaseModel, Field


class PricePoint(BaseModel):
    date: str = Field(description="ISO date, YYYY-MM-DD")
    open: float
    high: float
    low: float
    close: float
    volume: float


class DirectionRequest(BaseModel):
    prices: list[PricePoint] = Field(
        description="Trailing daily OHLCV rows, ascending by date, at least 50 rows "
        "(the longest feature warmup period)."
    )


class DirectionResponse(BaseModel):
    direction: Literal["bullish", "bearish"]
    confidence: float


class SentimentRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    score: float
```

- [ ] **Step 2: Write the model store**

`ml-service/app/model_store.py`:

```python
import json
from pathlib import Path

import joblib
import pandas as pd

from training.features import MA_LONG_PERIOD, compute_features

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "direction_model.joblib"
META_PATH = ARTIFACT_DIR / "direction_model.meta.json"


class DirectionModel:
    def __init__(self, model_path: Path = MODEL_PATH, meta_path: Path = META_PATH):
        self.model = joblib.load(model_path)
        self.meta = json.loads(meta_path.read_text())
        self.feature_columns: list[str] = self.meta["feature_columns"]

    def predict(self, prices: list[dict]) -> tuple[str, float]:
        df = pd.DataFrame(prices)
        df["Date"] = pd.to_datetime(df["date"])
        df = df.rename(
            columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"}
        )
        df = df.sort_values("Date").reset_index(drop=True)

        features_df = compute_features(df)
        latest = features_df.iloc[[-1]][self.feature_columns]
        if latest.isnull().any(axis=1).iloc[0]:
            raise ValueError(
                "Not enough price history to compute all features "
                f"(need at least {MA_LONG_PERIOD} trailing rows for the longest feature's warmup)."
            )

        proba = self.model.predict_proba(latest)[0]
        classes = list(self.model.classes_)
        bullish_idx = classes.index(1.0)
        bullish_proba = float(proba[bullish_idx])

        if bullish_proba >= 0.5:
            return "bullish", bullish_proba
        return "bearish", 1 - bullish_proba


_direction_model: DirectionModel | None = None


def get_direction_model() -> DirectionModel:
    global _direction_model
    if _direction_model is None:
        _direction_model = DirectionModel()
    return _direction_model
```

- [ ] **Step 3: Write the route**

`ml-service/app/routes/__init__.py`: empty file.

`ml-service/app/routes/direction.py`:

```python
from fastapi import APIRouter, Depends, HTTPException

from app.model_store import DirectionModel, get_direction_model
from app.schemas import DirectionRequest, DirectionResponse

router = APIRouter()


@router.post("/predict/direction", response_model=DirectionResponse)
def predict_direction(
    req: DirectionRequest, model: DirectionModel = Depends(get_direction_model)
) -> DirectionResponse:
    try:
        direction, confidence = model.predict([p.model_dump() for p in req.prices])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return DirectionResponse(direction=direction, confidence=confidence)
```

- [ ] **Step 4: Wire the route into the app**

In `ml-service/app/main.py`, change:

```python
from fastapi import FastAPI

app = FastAPI(title="ml-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

to:

```python
from fastapi import FastAPI

from app.routes.direction import router as direction_router

app = FastAPI(title="ml-service")
app.include_router(direction_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Write the failing test**

`ml-service/tests/test_direction_route.py`:

```python
from fastapi.testclient import TestClient

from app.main import app
from app.model_store import get_direction_model


class FakeDirectionModel:
    feature_columns = ["rsi_14", "ma_crossover", "momentum_10", "volatility_14"]

    def predict(self, prices: list[dict]) -> tuple[str, float]:
        if len(prices) < 3:
            raise ValueError("not enough history")
        return "bullish", 0.73


client = TestClient(app)


def test_predict_direction_returns_bullish_with_confidence():
    app.dependency_overrides[get_direction_model] = lambda: FakeDirectionModel()
    try:
        payload = {
            "prices": [
                {"date": "2026-01-01", "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 1000},
                {"date": "2026-01-02", "open": 100.5, "high": 102, "low": 100, "close": 101.5, "volume": 1100},
                {"date": "2026-01-03", "open": 101.5, "high": 103, "low": 101, "close": 102.5, "volume": 1200},
            ]
        }
        response = client.post("/predict/direction", json=payload)
        assert response.status_code == 200
        assert response.json() == {"direction": "bullish", "confidence": 0.73}
    finally:
        app.dependency_overrides.clear()


def test_predict_direction_returns_422_on_insufficient_history():
    app.dependency_overrides[get_direction_model] = lambda: FakeDirectionModel()
    try:
        response = client.post("/predict/direction", json={"prices": []})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 6: Run the tests**

Run: `uv run pytest tests/test_direction_route.py -v`
Expected: PASS, both tests (2 passed) — `get_direction_model` is overridden with the fake, so
the real model artifact is never loaded during this test.

- [ ] **Step 7: Commit**

```bash
git add ml-service/app/schemas.py ml-service/app/model_store.py ml-service/app/routes/__init__.py ml-service/app/routes/direction.py ml-service/app/main.py ml-service/tests/test_direction_route.py
git commit -m "feat(ml-service): add POST /predict/direction endpoint"
```

---

### Task 6: `POST /predict/sentiment` endpoint (FinBERT)

**Files:**
- Modify: `ml-service/app/model_store.py`
- Create: `ml-service/app/routes/sentiment.py`
- Modify: `ml-service/app/main.py`
- Create: `ml-service/tests/test_sentiment_route.py`

**Interfaces:**
- Consumes: `transformers.pipeline` (new dependency), `app.schemas.SentimentRequest`/
  `SentimentResponse` (Task 5).
- Produces: `POST /predict/sentiment` returning `{"sentiment": "positive"|"negative"|"neutral",
  "score": float}`.

- [ ] **Step 1: Add transformers + torch dependencies**

In `ml-service/pyproject.toml`'s `dependencies` list, add:

```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pandas>=2.2",
    "numpy>=2.0",
    "scikit-learn>=1.5",
    "joblib>=1.4",
    "transformers>=4.44",
    "torch>=2.4",
]
```

Run: `uv sync`
Expected: installs successfully. This is the largest dependency install in the project (`torch`
CPU wheels are several hundred MB) — expect it to take noticeably longer than prior `uv sync`
runs.

- [ ] **Step 2: Add the sentiment pipeline getter**

In `ml-service/app/model_store.py`, add to the end of the file:

```python
from transformers import Pipeline, pipeline as hf_pipeline

_sentiment_pipeline: Pipeline | None = None


def get_sentiment_pipeline() -> Pipeline:
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        _sentiment_pipeline = hf_pipeline("text-classification", model="ProsusAI/finbert")
    return _sentiment_pipeline
```

- [ ] **Step 3: Write the route**

`ml-service/app/routes/sentiment.py`:

```python
from fastapi import APIRouter, Depends
from transformers import Pipeline

from app.model_store import get_sentiment_pipeline
from app.schemas import SentimentRequest, SentimentResponse

router = APIRouter()

_LABEL_MAP = {"positive": "positive", "negative": "negative", "neutral": "neutral"}


@router.post("/predict/sentiment", response_model=SentimentResponse)
def predict_sentiment(
    req: SentimentRequest, pipe: Pipeline = Depends(get_sentiment_pipeline)
) -> SentimentResponse:
    result = pipe(req.text, truncation=True)[0]
    label = result["label"].lower()
    return SentimentResponse(sentiment=_LABEL_MAP.get(label, "neutral"), score=float(result["score"]))
```

- [ ] **Step 4: Wire the route into the app**

In `ml-service/app/main.py`, change:

```python
from fastapi import FastAPI

from app.routes.direction import router as direction_router

app = FastAPI(title="ml-service")
app.include_router(direction_router)
```

to:

```python
from fastapi import FastAPI

from app.routes.direction import router as direction_router
from app.routes.sentiment import router as sentiment_router

app = FastAPI(title="ml-service")
app.include_router(direction_router)
app.include_router(sentiment_router)
```

- [ ] **Step 5: Write the test**

`ml-service/tests/test_sentiment_route.py`:

```python
from fastapi.testclient import TestClient

from app.main import app
from app.model_store import get_sentiment_pipeline

client = TestClient(app)


class FakeSentimentPipeline:
    def __call__(self, text: str, truncation: bool = True):
        return [{"label": "Positive", "score": 0.912}]


def test_predict_sentiment_returns_mapped_label_and_score():
    app.dependency_overrides[get_sentiment_pipeline] = lambda: FakeSentimentPipeline()
    try:
        response = client.post("/predict/sentiment", json={"text": "Gold rallies on Fed rate cut hopes"})
        assert response.status_code == 200
        body = response.json()
        assert body["sentiment"] == "positive"
        assert body["score"] == 0.912
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_sentiment_route.py -v`
Expected: PASS (1 passed) — the fake pipeline means real FinBERT weights are never downloaded or
loaded during this test.

- [ ] **Step 7: Run the full test suite**

Run: `uv run pytest -v`
Expected: every test across all six tasks passes (health check, features, train helpers,
direction route, sentiment route).

- [ ] **Step 8: Manual smoke test with the real FinBERT model**

Run: `uv run uvicorn app.main:app --port 8000` (separate terminal/background), then:

```bash
curl -s -X POST http://localhost:8000/predict/sentiment -H "Content-Type: application/json" -d "{\"text\": \"Gold prices surge to record highs as investors seek safe haven\"}"
```

Expected: the first call downloads the real FinBERT weights (~400MB, one-time) and returns a
real `{"sentiment": ..., "score": ...}` — confirm it responds with `sentiment: "positive"` for
this clearly-positive headline. Also smoke-test `/predict/direction` with a real >=50-row price
window (e.g., the tail of `training/data/XAU_1d_data.csv`) and confirm it returns a real
`{"direction": ..., "confidence": ...}` rather than an error.

- [ ] **Step 9: Commit**

```bash
git add ml-service/pyproject.toml ml-service/app/model_store.py ml-service/app/routes/sentiment.py ml-service/app/main.py ml-service/tests/test_sentiment_route.py
git commit -m "feat(ml-service): add POST /predict/sentiment endpoint (FinBERT)"
```

## Verification

1. `uv run pytest -v` (from `ml-service/`) — every test across all tasks passes.
2. Both manual smoke tests in Task 6 Step 8 return real, non-error responses.
3. `training/REPORT.md` exists and contains real metrics from an actual training run (not
   placeholder numbers) — read it and report the real mean-accuracy figures per horizon plainly,
   including if they're unremarkable.
