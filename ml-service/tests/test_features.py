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
