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
        description="Trailing daily OHLCV rows, ascending by date, at least 50 rows "
        "(the longest feature warmup period).",
    )


class DirectionResponse(BaseModel):
    direction: Literal["bullish", "bearish"]
    confidence: float


class SentimentRequest(BaseModel):
    text: str


class SentimentResponse(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    score: float
