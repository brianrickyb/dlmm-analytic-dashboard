# ml-service — Expose Raw Direction Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /predict/direction` returns the real RSI, MA-crossover, momentum, and volatility
feature values the model already computes internally, alongside the existing direction/confidence,
so a later frontend plan can show real Trend/Momentum/Volatility/Reversal-Risk values instead of
inventing them.

**Architecture:** `DirectionModel.predict()` already computes a one-row feature DataFrame
(`rsi_14`, `ma_crossover`, `momentum_10`, `volatility_14`) to feed the classifier, then discards
it. This plan makes it return those four values alongside direction/confidence, and threads them
through the route's response schema. No new files, no new endpoints, no training changes.

**Tech Stack:** Python 3.12, FastAPI, pandas, uv-managed venv, pytest.

**Spec:** `docs/superpowers/specs/2026-08-13-dark-terminal-redesign-design.md` (the "Real,
requires a small ml-service addition" section)

## Global Constraints

- No test may load the real static dataset from disk or train a real model — inference against
  the real, already-trained artifact (`app/artifacts/direction_model.joblib`) is fine and
  encouraged where it adds real coverage; training a new model in a test is not.
- Feature values in the response must be the exact four columns the model's `feature_columns`
  meta lists, in the field names `rsi_14`, `ma_crossover`, `momentum_10`, `volatility_14` — not
  renamed, not relabeled into qualitative buckets. Qualitative labeling ("Uptrend"/"Strong"/etc.)
  is explicitly a later, frontend-side concern — this plan only exposes the raw numbers.
- The existing `ValueError` → `422` behavior for insufficient price history must not change.

---

### Task 1: Return and expose the four raw feature values from `/predict/direction`

**Files:**
- Modify: `ml-service/app/model_store.py`
- Modify: `ml-service/app/schemas.py`
- Modify: `ml-service/app/routes/direction.py`
- Modify: `ml-service/tests/test_direction_route.py`
- Create: `ml-service/tests/test_model_store.py`

**Interfaces:**
- Consumes: `training.features.compute_features` (existing, unmodified — already computes
  `rsi_14`, `ma_crossover`, `momentum_10`, `volatility_14` columns).
- Produces: `DirectionModel.predict(prices: list[dict]) -> tuple[str, float, dict[str, float]]`
  (direction, confidence, `{"rsi_14": ..., "ma_crossover": ..., "momentum_10": ...,
  "volatility_14": ...}`); `DirectionResponse` gains four new required float fields matching
  those keys. This is the contract a later frontend plan's API client will parse.

- [ ] **Step 1: Write the failing tests**

`ml-service/tests/test_model_store.py` (new file — tests `DirectionModel.predict()` directly
against the real trained artifact, since no unit test currently covers it in isolation from the
route layer; this is real inference against the real committed model, not training):

```python
from datetime import date, timedelta

from app.model_store import DirectionModel


def _synthetic_prices(n: int = 60) -> list[dict]:
    """n days of a mildly-trending synthetic OHLCV series, ascending by date.

    Large enough (>= MA_LONG_PERIOD=50) that every rolling feature is fully
    warmed up by the last row, so predict() never hits its insufficient-history
    branch here.
    """
    start = date(2026, 1, 1)
    prices = []
    close = 4000.0
    for i in range(n):
        close += 3.0 + (i % 5) - 2  # mild upward drift with some noise
        d = start + timedelta(days=i)
        prices.append(
            {
                "date": d.isoformat(),
                "open": close - 1,
                "high": close + 2,
                "low": close - 2,
                "close": close,
                "volume": 1000 + i,
            }
        )
    return prices


def test_predict_returns_direction_confidence_and_raw_features():
    model = DirectionModel()
    direction, confidence, features = model.predict(_synthetic_prices())

    assert direction in ("bullish", "bearish")
    assert 0.5 <= confidence <= 1.0
    assert set(features.keys()) == {"rsi_14", "ma_crossover", "momentum_10", "volatility_14"}
    for value in features.values():
        assert isinstance(value, float)


def test_predict_raises_valueerror_on_insufficient_history_without_features():
    model = DirectionModel()
    try:
        model.predict(_synthetic_prices(n=3))
        assert False, "expected ValueError"
    except ValueError as e:
        assert "Not enough price history" in str(e)
```

Update `ml-service/tests/test_direction_route.py`'s `FakeDirectionModel` and assertions for the
new 3-tuple return shape and the four new response fields:

```python
from fastapi.testclient import TestClient

from app.main import app
from app.model_store import get_direction_model


class FakeDirectionModel:
    feature_columns = ["rsi_14", "ma_crossover", "momentum_10", "volatility_14"]

    def predict(self, prices: list[dict]) -> tuple[str, float, dict[str, float]]:
        if len(prices) < 3:
            raise ValueError("not enough history")
        return (
            "bullish",
            0.73,
            {"rsi_14": 61.2, "ma_crossover": 12.5, "momentum_10": 8.4, "volatility_14": 0.021},
        )


client = TestClient(app)


def test_predict_direction_returns_bullish_with_confidence_and_features():
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
        assert response.json() == {
            "direction": "bullish",
            "confidence": 0.73,
            "rsi_14": 61.2,
            "ma_crossover": 12.5,
            "momentum_10": 8.4,
            "volatility_14": 0.021,
        }
    finally:
        app.dependency_overrides.clear()


def test_predict_direction_returns_422_on_insufficient_history():
    app.dependency_overrides[get_direction_model] = lambda: FakeDirectionModel()
    try:
        payload = {
            "prices": [
                {"date": "2026-01-01", "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 1000},
                {"date": "2026-01-02", "open": 100.5, "high": 102, "low": 100, "close": 101.5, "volume": 1100},
            ]
        }
        response = client.post("/predict/direction", json=payload)
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_predict_direction_rejects_empty_prices_via_schema_validation():
    app.dependency_overrides[get_direction_model] = lambda: FakeDirectionModel()
    try:
        response = client.post("/predict/direction", json={"prices": []})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ml-service && uv run pytest tests/test_model_store.py tests/test_direction_route.py -v`
Expected: `test_model_store.py`'s tests FAIL with `TypeError` (predict still returns a 2-tuple, so
unpacking into `direction, confidence, features` fails). `test_direction_route.py`'s updated test
FAILS on the response-body assertion (missing the four new fields; `FakeDirectionModel.predict`
now returns 3 values but the route only unpacks 2, so this will actually fail earlier with a
`ValueError: too many values to unpack` from the route itself — either way, a real failure, not a
pass).

- [ ] **Step 3: Update `model_store.py`**

In `ml-service/app/model_store.py`, replace the `predict` method:

```python
    def predict(self, prices: list[dict]) -> tuple[str, float, dict[str, float]]:
        df = pd.DataFrame(prices)
        df["Date"] = pd.to_datetime(df["date"])
        df = df.rename(
            columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"}
        )
        df = df.sort_values("Date").reset_index(drop=True)

        features_df = compute_features(df)
        latest = features_df.iloc[[-1]][self.feature_columns]
        if latest.isnull().any(axis=1).iloc[0]:
            seg = segment_ids(df["Date"])
            current_segment_size = int((seg == seg.iloc[-1]).sum())
            raise ValueError(
                f"Not enough price history in the current segment to compute all features "
                f"(only {current_segment_size} rows since the most recent gap of more than "
                f"{GAP_THRESHOLD_DAYS} days; need at least {MA_LONG_PERIOD})."
            )

        features = {col: float(latest.iloc[0][col]) for col in self.feature_columns}

        proba = self.model.predict_proba(latest)[0]
        classes = list(self.model.classes_)
        bullish_idx = classes.index(1.0)
        bullish_proba = float(proba[bullish_idx])

        if bullish_proba >= 0.5:
            return "bullish", bullish_proba, features
        return "bearish", 1 - bullish_proba, features
```

(Only the method body changes — imports, `get_direction_model`, the sentiment-pipeline section
below it, and everything else in the file stay exactly as they are.)

- [ ] **Step 4: Update `schemas.py`**

In `ml-service/app/schemas.py`, replace `DirectionResponse`:

```python
class DirectionResponse(BaseModel):
    direction: Literal["bullish", "bearish"]
    confidence: float
    rsi_14: float
    ma_crossover: float
    momentum_10: float
    volatility_14: float
```

- [ ] **Step 5: Update `direction.py`**

In `ml-service/app/routes/direction.py`, replace the handler body:

```python
@router.post("/predict/direction", response_model=DirectionResponse)
def predict_direction(
    req: DirectionRequest, model: DirectionModel = Depends(get_direction_model)
) -> DirectionResponse:
    try:
        direction, confidence, features = model.predict([p.model_dump() for p in req.prices])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return DirectionResponse(direction=direction, confidence=confidence, **features)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd ml-service && uv run pytest tests/test_model_store.py tests/test_direction_route.py -v`
Expected: PASS, all 5 tests (2 in `test_model_store.py`, 3 in `test_direction_route.py`).

- [ ] **Step 7: Run the full ml-service suite**

Run: `cd ml-service && uv run pytest -v`
Expected: PASS, all tests (previously 19 — now 21 with the 2 new `test_model_store.py` tests).

- [ ] **Step 8: Manual verification against the real running service**

Start the real service (`cd ml-service && uv run uvicorn app.main:app --port 8000`) and send a
real request with enough real trailing history to exercise the real model (reuse a tail slice of
`ml-service/training/data/XAU_1d_data.csv` if present locally, or the same synthetic-series
technique as Step 1's test, sent as real JSON):

```bash
curl -s -X POST http://localhost:8000/predict/direction \
  -H "Content-Type: application/json" \
  -d '{"prices": [ ...60+ rows... ]}'
```

Expected: a real `200` response containing `direction`, `confidence`, and all four of `rsi_14`,
`ma_crossover`, `momentum_10`, `volatility_14` as real numbers (not `null`, not placeholders) —
confirming the real trained model's `predict_proba` and the real feature extraction both work
together through the actual HTTP layer, not just in the unit tests.

- [ ] **Step 9: Commit**

```bash
git add ml-service/app/model_store.py ml-service/app/schemas.py ml-service/app/routes/direction.py ml-service/tests/test_model_store.py ml-service/tests/test_direction_route.py
git commit -m "feat(ml-service): expose raw RSI/MA-crossover/momentum/volatility in /predict/direction"
```

## Verification

1. `cd ml-service && uv run pytest -v` — full suite green, including the 2 new tests.
2. Manual verification per Task 1 Step 8 — real HTTP round-trip against the real model returns
   real, non-null feature values.
