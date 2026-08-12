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


def test_rsi_is_100_for_all_gains_zero_losses():
    all_up = pd.Series([100.0 + i for i in range(20)])
    rsi = compute_rsi(all_up, period=14)
    assert rsi.iloc[19] == pytest.approx(100.0)


def test_rsi_is_0_for_all_losses_zero_gains():
    all_down = pd.Series([120.0 - i for i in range(20)])
    rsi = compute_rsi(all_down, period=14)
    assert rsi.iloc[19] == pytest.approx(0.0)


def test_rsi_is_50_for_no_price_movement():
    flat = pd.Series([100.0] * 20)
    rsi = compute_rsi(flat, period=14)
    assert rsi.iloc[19] == pytest.approx(50.0)


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
    # 12 pre-gap rows, an 11-day gap, 12 post-gap rows.
    dates = pd.Series(
        list(pd.date_range("2024-01-01", periods=12, freq="D"))
        + list(pd.date_range("2024-01-23", periods=12, freq="D"))
    )
    pre_gap = [100.0, 101.0, 100.5, 102.0, 103.0, 102.5, 104.0, 105.0, 104.5, 106.0, 107.0, 106.5]
    post_gap = [500.0, 501.0, 499.5, 502.0, 503.0, 501.5, 504.0, 505.0, 503.5, 506.0, 507.0, 505.5]
    df = pd.DataFrame({"Date": dates, "Close": pd.Series(pre_gap + post_gap)})

    features = compute_features(df)

    # Row 12 is the FIRST post-gap row. A naive whole-series `close.shift(10)`
    # (no gap-reset) would compute this using row 2's pre-gap Close (100.5),
    # giving a spurious momentum_10 of 399.5. With correct gap-reset, there
    # aren't 10 rows in the new segment yet, so it must be NaN.
    assert pd.isna(features["momentum_10"].iloc[12])
    # Row 22 is the first post-gap row with a full 10-row window *within the
    # new segment* (rows 12-22) — its momentum_10 must be computed entirely
    # from post-gap prices: 507.0 - 500.0 = 7.0.
    assert features["momentum_10"].iloc[22] == pytest.approx(7.0, abs=0.001)
    assert "rsi_14" in features.columns
    assert "ma_crossover" in features.columns
    assert "volatility_14" in features.columns
