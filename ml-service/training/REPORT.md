# XAU/USD Direction Model — Evaluation Report

Walk-forward evaluation (expanding window, yearly test blocks 2020-2024). Binary target: does Close[t+N] end up higher than Close[t]? These are real results from the actual training run below — not illustrative.

## Horizon: 1 day(s) ahead
Mean accuracy across folds: 0.5081

| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |
|---|---|---|---|---|---|---|---|
| 2020 | 3939 | 259 | 0.5058 | 0.4159 | 0.4312 | 0.5753 | 0.5600 |
| 2021 | 4198 | 258 | 0.4884 | 0.4757 | 0.3858 | 0.4968 | 0.5878 |
| 2022 | 4456 | 258 | 0.5426 | 0.5300 | 0.4274 | 0.5506 | 0.6493 |
| 2023 | 4714 | 257 | 0.4942 | 0.5067 | 0.2901 | 0.4890 | 0.7063 |
| 2024 | 4971 | 259 | 0.5097 | 0.4532 | 0.5526 | 0.5750 | 0.4759 |

## Horizon: 3 day(s) ahead
Mean accuracy across folds: 0.5058

| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |
|---|---|---|---|---|---|---|---|
| 2020 | 3937 | 259 | 0.5058 | 0.4000 | 0.4381 | 0.5903 | 0.5519 |
| 2021 | 4196 | 258 | 0.5155 | 0.5233 | 0.3488 | 0.5116 | 0.6822 |
| 2022 | 4454 | 258 | 0.5000 | 0.5057 | 0.3385 | 0.4971 | 0.6641 |
| 2023 | 4712 | 257 | 0.4864 | 0.5106 | 0.3582 | 0.4724 | 0.6260 |
| 2024 | 4969 | 259 | 0.5212 | 0.4298 | 0.4537 | 0.5931 | 0.5695 |

## Horizon: 5 day(s) ahead
Mean accuracy across folds: 0.5174

| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |
|---|---|---|---|---|---|---|---|
| 2020 | 3935 | 259 | 0.4981 | 0.3805 | 0.4175 | 0.5890 | 0.5513 |
| 2021 | 4194 | 258 | 0.5388 | 0.4906 | 0.4444 | 0.5724 | 0.6170 |
| 2022 | 4452 | 258 | 0.5310 | 0.5169 | 0.3710 | 0.5385 | 0.6791 |
| 2023 | 4710 | 257 | 0.4514 | 0.4500 | 0.4186 | 0.4526 | 0.4844 |
| 2024 | 4967 | 259 | 0.5676 | 0.4524 | 0.5700 | 0.6767 | 0.5660 |

## Chosen horizon for serving: 5 day(s) (highest mean accuracy at 0.5174)

**Limitations:** trained on daily OHLCV technical features only (no macro/news features), a single asset, walk-forward-evaluated on 5 yearly folds (2020-2024). A mean accuracy modestly above 0.5 does not imply the model is tradable — see the app's permanent disclaimer. This report states the real numbers from the run above; if they are close to a coin flip, that is the honest result, not a bug.