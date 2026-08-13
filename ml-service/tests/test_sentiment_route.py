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
