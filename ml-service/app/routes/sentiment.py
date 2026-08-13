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
