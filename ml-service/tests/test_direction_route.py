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
