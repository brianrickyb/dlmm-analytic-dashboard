import type { PriceRow } from '../services/mlService.js';

/**
 * Deterministic technical readout computed from daily closes.
 *
 * Definitions intentionally mirror ml-service training/features.py (the XAU
 * direction model's four inputs) so the UI's plain-technicals panel and the
 * model's feature vector describe the same indicators:
 *   - RSI(14) with Wilder smoothing (ewm alpha=1/14, min_periods=14)
 *   - MA crossover = SMA(10) - SMA(50)
 *   - momentum over 10 rows (shown as % for cross-market comparability)
 *   - volatility = rolling std (ddof=1) of 14 daily log returns
 *
 * Unlike features.py there is no >10-calendar-day gap segmentation: these are
 * display-only readouts on live provider data whose largest routine gap is a
 * weekend (<4 days). If a market ever goes dark longer than that, values are
 * still computed but the panel's window sizes make it visually obvious.
 */
export interface TechnicalReadout {
  /** RSI(14), Wilder smoothing; null while the series is shorter than the warmup. */
  rsi14: number | null;
  /** SMA(10) - SMA(50); sign encodes the crossover state. Null during warmup. */
  maCrossover: number | null;
  /** (close_now / close_10_rows_ago - 1) * 100. Null during warmup. */
  momentum10Pct: number | null;
  /** Std-dev of the last 14 daily log returns, in percent. Null during warmup. */
  volatility14Pct: number | null;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

/** Wilder-smoothing RSI at the newest row; mirrors pandas ewm(alpha=1/period, min_periods=period). */
export function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  // Seed with the simple mean of the first `period` changes (Wilder's original
  // construction -- equivalent to ewm's min_periods=period first output).
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;

  // Continue Wilder smoothing to the end of the series.
  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function computeTechnicals(rows: PriceRow[]): TechnicalReadout {
  const closes = rows.map((row) => row.close);
  const n = closes.length;

  const rsi14 = computeRsi(closes);
  const shortMa = sma(closes, 10);
  const longMa = sma(closes, 50);
  const maCrossover = shortMa !== null && longMa !== null ? shortMa - longMa : null;

  let momentum10Pct: number | null = null;
  if (n >= 11 && closes[n - 11] > 0) {
    momentum10Pct = (closes[n - 1] / closes[n - 11] - 1) * 100;
  }

  let volatility14Pct: number | null = null;
  if (n >= 15) {
    const logReturns: number[] = [];
    for (let i = n - 14; i < n; i += 1) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = logReturns.reduce((sum, v) => sum + v, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (logReturns.length - 1);
    volatility14Pct = Math.sqrt(variance) * 100;
  }

  return { rsi14, maCrossover, momentum10Pct, volatility14Pct };
}
