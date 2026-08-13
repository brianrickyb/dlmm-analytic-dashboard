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
