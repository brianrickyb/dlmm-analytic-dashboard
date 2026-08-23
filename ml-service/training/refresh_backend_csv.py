"""Refreshes the backend's static XAU/USD daily history from Kaggle.

The backend (backend/src/services/xauHistory.ts) merges this CSV with any live
Alpha Vantage rows. The CSV is the source of REAL OHLCV — Alpha Vantage's GOLD
endpoint only provides one value per day, so every row this file contributes is
a row the app doesn't have to synthesize. Run it on a schedule (daily cron,
alongside the TVL snapshot worker) so `estimatedFrom`/stale states stay rare.

Uses the same proven kagglehub download as download_dataset.py, then writes:
  1. training/data/XAU_1d_data.csv          (training copy, same as download_dataset.py)
  2. backend/src/data/xau-daily-history.csv (backend static CSV)

Run with: uv run python -m training.refresh_backend_csv
"""
import csv
import shutil
from datetime import datetime, timezone
from pathlib import Path

import kagglehub

TRAINING_DATA_DEST = Path(__file__).parent / "data" / "XAU_1d_data.csv"
BACKEND_CSV_DEST = (
    Path(__file__).parent.parent.parent / "backend" / "src" / "data" / "xau-daily-history.csv"
)
# Must match what backend/src/services/xauHistory.ts parseStaticCsv expects.
HEADER = "Date;Open;High;Low;Close;Volume"
DATE_FORMAT = "%Y.%m.%d %H:%M"
NUMERIC_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]
STALE_WARNING_DAYS = 10


def write_backend_csv(source_csv: Path, dest: Path) -> tuple[int, str | None]:
    """Rewrites the Kaggle CSV into the exact dialect parseStaticCsv consumes:
    one header line, then `YYYY.MM.DD HH:MM;O;H;L;C;V` per row.

    Parsing uses csv.DictReader (safe against quoted fields); writing is plain
    text — csv.writer with ';' delimiter would quote every whole-line field and
    make Number(volumeStr) NaN back in TypeScript, silently dropping ALL rows.

    Empty lines are skipped; any non-empty malformed row raises, because a
    silently-truncated history is worse than a failed refresh (the app would
    keep serving stale data with nothing signalling why). Returns (row count,
    last date as YYYY-MM-DD).
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = [HEADER]
    last_date: str | None = None

    with source_csv.open(newline="", encoding="utf-8") as src:
        for line_no, row in enumerate(csv.DictReader(src, delimiter=";"), start=2):
            raw_date = (row.get("Date") or "").strip()
            if not raw_date:
                continue
            try:
                parsed_date = datetime.strptime(raw_date, DATE_FORMAT)
                values = [(col, row[col].strip()) for col in NUMERIC_COLUMNS]
                for col, text in values:
                    float(text)  # validates; original text is emitted to avoid 384 -> 384.0 churn
                    if not text:
                        raise ValueError(f"empty {col}")
            except (ValueError, KeyError, TypeError) as err:
                raise ValueError(f"{source_csv.name}:{line_no}: malformed row ({err})") from err

            lines.append(raw_date + ";" + ";".join(text for _, text in values))
            last_date = parsed_date.date().isoformat()

    dest.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    return len(lines) - 1, last_date


def main() -> None:
    path = kagglehub.dataset_download("novandraanugrah/xauusd-gold-price-historical-data-2004-2024")
    src = Path(path) / "XAU_1d_data.csv"

    TRAINING_DATA_DEST.parent.mkdir(exist_ok=True)
    shutil.copy(src, TRAINING_DATA_DEST)

    rows, last_date = write_backend_csv(src, BACKEND_CSV_DEST)
    print(f"Copied training data to {TRAINING_DATA_DEST}")
    print(f"Wrote {rows} rows to {BACKEND_CSV_DEST} (through {last_date})")

    if last_date:
        age_days = (datetime.now(timezone.utc).date() - datetime.fromisoformat(last_date)).days
        if age_days > STALE_WARNING_DAYS:
            print(
                f"WARNING: dataset ends {age_days} days ago (upstream lag?). Until it catches up, "
                "the Alpha Vantage tail and the UI staleness badge cover the gap."
            )


if __name__ == "__main__":
    main()
