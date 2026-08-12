# XAU/USD Direction Model — Evaluation Report

Walk-forward evaluation (expanding window, yearly test blocks 2020-2024). Binary target: does Close[t+N] end up higher than Close[t]? These are real results from the actual training run below — not illustrative.

## Horizon: 1 day(s) ahead
Mean accuracy across folds: 0.4996

| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |
|---|---|---|---|---|---|---|---|
| 2020 | 3940 | 259 | 0.5328 | 0.4412 | 0.4128 | 0.5924 | 0.6200 |
| 2021 | 4199 | 258 | 0.4961 | 0.4860 | 0.4094 | 0.5033 | 0.5802 |
| 2022 | 4457 | 258 | 0.5194 | 0.5000 | 0.3952 | 0.5312 | 0.6343 |
| 2023 | 4715 | 257 | 0.4825 | 0.4889 | 0.3359 | 0.4790 | 0.6349 |
| 2024 | 4972 | 259 | 0.4672 | 0.4155 | 0.5175 | 0.5299 | 0.4276 |

## Horizon: 3 day(s) ahead
Mean accuracy across folds: 0.5089

| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |
|---|---|---|---|---|---|---|---|
| 2020 | 3940 | 259 | 0.4865 | 0.3889 | 0.4667 | 0.5789 | 0.5000 |
| 2021 | 4199 | 258 | 0.5349 | 0.5529 | 0.3643 | 0.5260 | 0.7054 |
| 2022 | 4457 | 258 | 0.4884 | 0.4889 | 0.3385 | 0.4881 | 0.6406 |
| 2023 | 4715 | 257 | 0.4942 | 0.5208 | 0.3731 | 0.4783 | 0.6260 |
| 2024 | 4972 | 259 | 0.5405 | 0.4538 | 0.5000 | 0.6143 | 0.5695 |

## Horizon: 5 day(s) ahead
Mean accuracy across folds: 0.5104

| Year | Train rows | Test rows | Accuracy | Precision (bearish) | Recall (bearish) | Precision (bullish) | Recall (bullish) |
|---|---|---|---|---|---|---|---|
| 2020 | 3940 | 259 | 0.4903 | 0.3592 | 0.3592 | 0.5769 | 0.5769 |
| 2021 | 4199 | 258 | 0.5388 | 0.4900 | 0.4188 | 0.5696 | 0.6383 |
| 2022 | 4457 | 258 | 0.5388 | 0.5269 | 0.3952 | 0.5455 | 0.6716 |
| 2023 | 4715 | 257 | 0.4553 | 0.4538 | 0.4186 | 0.4565 | 0.4922 |
| 2024 | 4972 | 259 | 0.5290 | 0.4068 | 0.4800 | 0.6312 | 0.5597 |

## Chosen horizon for serving: 5 day(s) (highest mean accuracy at 0.5104)

**Limitations:** trained on daily OHLCV technical features only (no macro/news features), a single asset, walk-forward-evaluated on 5 yearly folds (2020-2024). A mean accuracy modestly above 0.5 does not imply the model is tradable — see the app's permanent disclaimer. This report states the real numbers from the run above; if they are close to a coin flip, that is the honest result, not a bug.