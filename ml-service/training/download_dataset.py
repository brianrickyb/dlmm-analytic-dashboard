"""Re-downloads the XAU/USD historical dataset from Kaggle.

Requires Kaggle API credentials (`kaggle.json` or `KAGGLE_USERNAME`+`KAGGLE_KEY` env vars).
The dataset's author keeps it updated past its slug's stated "2004-2024" — re-running this
will likely pull more recent rows than whatever copy is currently in training/data/.
"""
import shutil
from pathlib import Path

import kagglehub

DATA_DIR = Path(__file__).parent / "data"


def main() -> None:
    path = kagglehub.dataset_download("novandraanugrah/xauusd-gold-price-historical-data-2004-2024")
    print("Downloaded to:", path)
    DATA_DIR.mkdir(exist_ok=True)
    src = Path(path) / "XAU_1d_data.csv"
    dest = DATA_DIR / "XAU_1d_data.csv"
    shutil.copy(src, dest)
    print("Copied daily data to:", dest)


if __name__ == "__main__":
    main()
