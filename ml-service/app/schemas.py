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
        description="Trailing daily OHLCV rows, ascending by date. Send the ENTIRE current "
        "segment (every row since the most recent gap of more than GAP_THRESHOLD_DAYS days "
        "in the source data) -- clipping to exactly the 50-row warmup minimum produces a "
        "different RSI than training-time computation, since RSI is a recursive calculation "
        "seeded at the start of its input window, not a fixed-window statistic.",
    )


class DirectionResponse(BaseModel):
    direction: Literal["bullish", "bearish"]
    confidence: float


class SentimentRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    score: float
