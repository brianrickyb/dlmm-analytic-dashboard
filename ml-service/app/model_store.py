import json
from pathlib import Path

import joblib
import pandas as pd

from training.features import GAP_THRESHOLD_DAYS, MA_LONG_PERIOD, compute_features, segment_ids

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "direction_model.joblib"
META_PATH = ARTIFACT_DIR / "direction_model.meta.json"


class DirectionModel:
    def __init__(self, model_path: Path = MODEL_PATH, meta_path: Path = META_PATH):
        self.model = joblib.load(model_path)
        self.meta = json.loads(meta_path.read_text())
        self.feature_columns: list[str] = self.meta["feature_columns"]

    def predict(self, prices: list[dict]) -> tuple[str, float, dict[str, float]]:
        df = pd.DataFrame(prices)
        df["Date"] = pd.to_datetime(df["date"])
        df = df.rename(
            columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"}
        )
        df = df.sort_values("Date").reset_index(drop=True)

        features_df = compute_features(df)
        latest = features_df.iloc[[-1]][self.feature_columns]
        if latest.isnull().any(axis=1).iloc[0]:
            seg = segment_ids(df["Date"])
            current_segment_size = int((seg == seg.iloc[-1]).sum())
            raise ValueError(
                f"Not enough price history in the current segment to compute all features "
                f"(only {current_segment_size} rows since the most recent gap of more than "
                f"{GAP_THRESHOLD_DAYS} days; need at least {MA_LONG_PERIOD})."
            )

        features = {col: float(latest.iloc[0][col]) for col in self.feature_columns}

        proba = self.model.predict_proba(latest)[0]
        classes = list(self.model.classes_)
        bullish_idx = classes.index(1.0)
        bullish_proba = float(proba[bullish_idx])

        if bullish_proba >= 0.5:
            return "bullish", bullish_proba, features
        return "bearish", 1 - bullish_proba, features


_direction_model: DirectionModel | None = None


def get_direction_model() -> DirectionModel:
    global _direction_model
    if _direction_model is None:
        _direction_model = DirectionModel()
    return _direction_model


from transformers import Pipeline, pipeline as hf_pipeline

_sentiment_pipeline: Pipeline | None = None


def get_sentiment_pipeline() -> Pipeline:
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        _sentiment_pipeline = hf_pipeline("text-classification", model="ProsusAI/finbert")
    return _sentiment_pipeline
