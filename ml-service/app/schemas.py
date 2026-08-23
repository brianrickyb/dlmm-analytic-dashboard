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
        min_length=1,
        description="Trailing daily OHLCV rows, ascending by date. The backend sends a 260-row "
        "window (see markets.ts DIRECTION_INPUT_ROWS): comfortably above the 50-row warmup, so "
        "fixed-window features are exact and Wilder-RSI's recursive seeding has decayed below "
        "1e-8 relative influence. Do NOT clip to exactly the 50-row minimum — that leaves ~2.5% "
        "of the RSI weight on the seeding, producing a different value than training-time "
        "computation over the full segment.",
    )


class DirectionResponse(BaseModel):
    direction: Literal["bullish", "bearish"]
    confidence: float
    rsi_14: float
    ma_crossover: float
    momentum_10: float
    volatility_14: float
    # Date (YYYY-MM-DD) of the newest row in the model's training data; null for artifacts
    # trained before this field existed.
    model_data_through: str | None = None


class SentimentRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    score: float
