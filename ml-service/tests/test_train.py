import pandas as pd

from training.train import compute_direction_target, generate_walk_forward_folds


def test_compute_direction_target_labels_future_close_higher_as_bullish():
    close = pd.Series([100.0, 105.0, 95.0, 110.0])
    target = compute_direction_target(close, horizon_days=1)
    # row0->row1: 100->105 (up=1), row1->row2: 105->95 (down=0), row2->row3: 95->110 (up=1)
    assert target.iloc[0] == 1
    assert target.iloc[1] == 0
    assert target.iloc[2] == 1
    assert pd.isna(target.iloc[3])  # no future row to compare against


def test_generate_walk_forward_folds_train_window_expands_and_never_sees_future():
    dates = pd.Series(pd.date_range("2018-01-01", "2024-12-31", freq="D"))
    folds = generate_walk_forward_folds(dates, eval_years=[2020, 2021, 2022, 2023, 2024])
    assert len(folds) == 5
    for train_idx, test_idx in folds:
        assert max(dates[train_idx]) < min(dates[test_idx])
    # fold N's train set must be a superset of fold N-1's train set (expanding window)
    for i in range(1, len(folds)):
        assert set(folds[i - 1][0]).issubset(set(folds[i][0]))


def test_generate_walk_forward_folds_embargo_drops_trailing_train_rows():
    dates = pd.Series(pd.date_range("2018-01-01", "2019-12-31", freq="D"))
    folds_no_embargo = generate_walk_forward_folds(dates, eval_years=[2019])
    folds_embargo = generate_walk_forward_folds(dates, eval_years=[2019], embargo_days=5)
    train_no_embargo, _ = folds_no_embargo[0]
    train_embargo, _ = folds_embargo[0]
    assert len(train_embargo) == len(train_no_embargo) - 5
    assert set(dates[train_embargo]).issubset(set(dates[train_no_embargo]))
