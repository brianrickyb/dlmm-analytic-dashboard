"""Walk-forward evaluation and final training for the XAU/USD direction model.

Run with: uv run python training/train.py
Writes: app/artifacts/direction_model.joblib, app/artifacts/direction_model.meta.json,
training/REPORT.md
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

from training.features import compute_features

DATA_PATH = Path(__file__).parent / "data" / "XAU_1d_data.csv"
ARTIFACT_DIR = Path(__file__).parent.parent / "app" / "artifacts"
REPORT_PATH = Path(__file__).parent / "REPORT.md"
FEATURE_COLUMNS = ["rsi_14", "ma_crossover", "momentum_10", "volatility_14"]
HORIZONS = [1, 3, 5]
EVAL_YEARS = [2020, 2021, 2022, 2023, 2024]


def load_daily_prices() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, sep=";")
    df["Date"] = pd.to_datetime(df["Date"], format="%Y.%m.%d %H:%M")
    return df.sort_values("Date").reset_index(drop=True)


def compute_direction_target(close: pd.Series, horizon_days: int) -> pd.Series:
    """1 (bullish) if Close[t+horizon] > Close[t], else 0. NaN for trailing rows with no future value."""
    future_close = close.shift(-horizon_days)
    target = (future_close > close).astype("float64")
    target[future_close.isna()] = float("nan")
    return target


def generate_walk_forward_folds(dates: pd.Series, eval_years: list[int]) -> list[tuple[list[int], list[int]]]:
    """Expanding-window folds: fold i trains on everything before eval_years[i], tests on that year."""
    folds = []
    for year in eval_years:
        train_idx = dates[dates < pd.Timestamp(year=year, month=1, day=1)].index.tolist()
        test_idx = dates[
            (dates >= pd.Timestamp(year=year, month=1, day=1)) & (dates < pd.Timestamp(year=year + 1, month=1, day=1))
        ].index.tolist()
        folds.append((train_idx, test_idx))
    return folds


def evaluate_horizon(df: pd.DataFrame, horizon_days: int) -> dict:
    df = df.copy()
    df["target"] = compute_direction_target(df["Close"], horizon_days)
    usable = df.dropna(subset=FEATURE_COLUMNS + ["target"]).reset_index(drop=True)

    folds = generate_walk_forward_folds(usable["Date"], EVAL_YEARS)
    fold_reports = []
    for year, (train_idx, test_idx) in zip(EVAL_YEARS, folds):
        if len(train_idx) == 0 or len(test_idx) == 0:
            continue
        X_train = usable.loc[train_idx, FEATURE_COLUMNS]
        y_train = usable.loc[train_idx, "target"]
        X_test = usable.loc[test_idx, FEATURE_COLUMNS]
        y_test = usable.loc[test_idx, "target"]

        model = HistGradientBoostingClassifier(random_state=42)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)

        accuracy = accuracy_score(y_test, y_pred)
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_test, y_pred, labels=[0, 1], zero_division=0
        )
        fold_reports.append(
            {
                "year": year,
                "n_train": len(train_idx),
                "n_test": len(test_idx),
                "accuracy": accuracy,
                "precision_bearish": precision[0],
                "recall_bearish": recall[0],
                "precision_bullish": precision[1],
                "recall_bullish": recall[1],
            }
        )

    mean_accuracy = sum(r["accuracy"] for r in fold_reports) / len(fold_reports) if fold_reports else float("nan")
    return {"horizon_days": horizon_days, "folds": fold_reports, "mean_accuracy": mean_accuracy}


def format_report(results: list[dict]) -> str:
    lines = ["# XAU/USD Direction Model — Evaluation Report", ""]
    lines.append(
        "Walk-forward evaluation (expanding window, yearly test blocks 2020-2024). "
        "Binary target: does Close[t+N] end up higher than Close[t]? "
        "These are real results from the actual training run below — not illustrative."
    )
    lines.append("")
    for result in results:
        lines.append(f"## Horizon: {result['horizon_days']} day(s) ahead")
        lines.append(f"Mean accuracy across folds: {result['mean_accuracy']:.4f}")
        lines.append("")
        lines.append("| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for f in result["folds"]:
            lines.append(
                f"| {f['year']} | {f['n_train']} | {f['n_test']} | {f['accuracy']:.4f} | "
                f"{f['precision_bearish']:.4f} | {f['recall_bearish']:.4f} | "
                f"{f['precision_bullish']:.4f} | {f['recall_bullish']:.4f} |"
            )
        lines.append("")
    best = max(results, key=lambda r: r["mean_accuracy"])
    lines.append(
        f"## Chosen horizon for serving: {best['horizon_days']} day(s) "
        f"(highest mean accuracy at {best['mean_accuracy']:.4f})"
    )
    lines.append("")
    lines.append(
        "**Limitations:** trained on daily OHLCV technical features only (no macro/news "
        "features), a single asset, walk-forward-evaluated on 5 yearly folds (2020-2024). "
        "A mean accuracy modestly above 0.5 does not imply the model is tradable — see the "
        "app's permanent disclaimer. This report states the real numbers from the run above; "
        "if they are close to a coin flip, that is the honest result, not a bug."
    )
    return "\n".join(lines)


def main() -> None:
    df = load_daily_prices()
    df = compute_features(df)

    results = [evaluate_horizon(df, h) for h in HORIZONS]
    REPORT_PATH.write_text(format_report(results), encoding="utf-8")
    print(f"Wrote {REPORT_PATH}")

    best = max(results, key=lambda r: r["mean_accuracy"])
    best_horizon = best["horizon_days"]

    df["target"] = compute_direction_target(df["Close"], best_horizon)
    usable = df.dropna(subset=FEATURE_COLUMNS + ["target"]).reset_index(drop=True)
    final_model = HistGradientBoostingClassifier(random_state=42)
    final_model.fit(usable[FEATURE_COLUMNS], usable["target"])

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, ARTIFACT_DIR / "direction_model.joblib")
    meta = {
        "feature_columns": FEATURE_COLUMNS,
        "horizon_days": best_horizon,
        "trained_on_rows": len(usable),
        "training_data_max_date": str(df["Date"].max().date()),
    }
    (ARTIFACT_DIR / "direction_model.meta.json").write_text(json.dumps(meta, indent=2))
    print(f"Wrote {ARTIFACT_DIR / 'direction_model.joblib'} and direction_model.meta.json")
    print(f"Chosen horizon: {best_horizon} days, mean accuracy: {best['mean_accuracy']:.4f}")


if __name__ == "__main__":
    main()
