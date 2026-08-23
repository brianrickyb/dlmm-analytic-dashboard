"""Feature engineering for the XAU/USD daily direction model.

All rolling-window features reset at any gap of more than 10 calendar days
between consecutive rows (see `segment_ids`) — the 2004-2026 daily dataset
has two such gaps (33 days ending 2025-10-15, 9 days ending 2026-01-22; see
docs/superpowers/specs/2026-08-13-xau-market-signal-design.md). The
threshold is deliberately set above the dataset's 9-day gap (an ordinary
extended-holiday-scale gap) but below its 33-day gap (a genuinely severe
one), so the current live segment stays large enough for the model's
50-row warmup. A rolling indicator must not silently blend pre-gap and post-gap
prices as if they were consecutive trading days.

CLOSE-ONLY CONSTRAINT: the backend's merged history (backend/src/services/
xauHistory.ts) appends live rows synthesized as open=high=low=close with
volume=0 from Alpha Vantage's value-only GOLD endpoint — only their Close is
real data. Every feature below therefore MUST stay derived from Close; a
High/Low/Volume-based indicator would silently consume fabricated values on
recent rows unless it restricts itself to rows before the backend's
`estimatedFrom` boundary.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RSI_PERIOD = 14
MA_SHORT_PERIOD = 10
MA_LONG_PERIOD = 50
MOMENTUM_PERIOD = 10
VOLATILITY_PERIOD = 14
GAP_THRESHOLD_DAYS = 10


def segment_ids(dates: pd.Series, gap_days: int = GAP_THRESHOLD_DAYS) -> pd.Series:
    """Assigns an incrementing segment id, incrementing at every gap > gap_days."""
    gaps = dates.diff().dt.days
    return (gaps > gap_days).cumsum()


def compute_rsi(close: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    """Wilder's-smoothing RSI. Returns 50 (neutral) during warmup or when there's
    no price movement at all; returns 100 when every move in the window was a
    gain (zero losses), 0 when every move was a loss (zero gains)."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rsi = pd.Series(50.0, index=close.index)
    defined = avg_gain.notna() & avg_loss.notna()
    only_loss_zero = defined & (avg_loss == 0) & (avg_gain > 0)
    normal = defined & (avg_loss > 0)

    rsi[only_loss_zero] = 100.0
    rsi[normal] = 100 - (100 / (1 + avg_gain[normal] / avg_loss[normal]))
    return rsi


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
    ascending by Date. Rolling features reset at each gap > 10 days (see
    `segment_ids`) so they never blend pre-gap and post-gap prices.
    """
    seg = segment_ids(df["Date"])
    out = df.copy()
    out["rsi_14"] = out.groupby(seg)["Close"].transform(lambda s: compute_rsi(s))
    out["ma_crossover"] = out.groupby(seg)["Close"].transform(lambda s: compute_ma_crossover(s))
    out["momentum_10"] = out.groupby(seg)["Close"].transform(lambda s: compute_momentum(s))
    out["volatility_14"] = out.groupby(seg)["Close"].transform(lambda s: compute_volatility(s))
    return out
