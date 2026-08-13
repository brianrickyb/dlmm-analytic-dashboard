"""Prints schema, date range, and gap analysis for training/data/XAU_1d_data.csv.

Run this after any re-download to confirm the schema hasn't changed and to
re-check for gaps before touching training.py.
"""
from pathlib import Path

import pandas as pd

from training.features import GAP_THRESHOLD_DAYS

DATA_PATH = Path(__file__).parent / "data" / "XAU_1d_data.csv"


def main() -> None:
    df = pd.read_csv(DATA_PATH, sep=";")
    print("columns:", list(df.columns))
    print("shape:", df.shape)
    print(df.head())
    print(df.dtypes)

    df["Date"] = pd.to_datetime(df["Date"], format="%Y.%m.%d %H:%M")
    df = df.sort_values("Date").reset_index(drop=True)
    print("min date:", df["Date"].min())
    print("max date:", df["Date"].max())
    print("duplicate dates:", df["Date"].duplicated().sum())
    print("rows where High < Low:", (df["High"] < df["Low"]).sum())

    gaps = df["Date"].diff().dt.days
    big_gaps = df[gaps > GAP_THRESHOLD_DAYS][["Date"]].copy()
    big_gaps["gap_days"] = gaps[gaps > GAP_THRESHOLD_DAYS].values
    print(f"gaps > {GAP_THRESHOLD_DAYS} days:")
    print(big_gaps.to_string())


if __name__ == "__main__":
    main()
