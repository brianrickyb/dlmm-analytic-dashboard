import { describe, expect, it } from 'vitest';
import { computeRsi, computeTechnicals } from './technicals.js';
import type { PriceRow } from '../services/mlService.js';

function rowsFromCloses(closes: number[]): PriceRow[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1000,
  }));
}

describe('computeRsi', () => {
  it('returns null before the warmup window is satisfied', () => {
    expect(computeRsi([1, 2, 3], 14)).toBeNull();
    // Exactly period+1 closes = the minimum (first output of pandas min_periods=14).
    expect(computeRsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14)).toBe(100);
  });

  it('matches hand-computed Wilder recursion', () => {
    // period=5; deltas: +1 +1 +1 +1 -1 -> avgGain .8 / avgLoss .2 -> RSI 80,
    // then one more -1 -> avgGain .64 / avgLoss .36 -> RSI 64.
    expect(computeRsi([10, 11, 12, 13, 14, 13], 5)).toBeCloseTo(80, 10);
    expect(computeRsi([10, 11, 12, 13, 14, 13, 12], 5)).toBeCloseTo(64, 10);
  });

  it('is neutral on a flat series and extreme on monotonic ones', () => {
    const flat = Array.from({ length: 30 }, () => 42);
    expect(computeRsi(flat)).toBe(50);

    const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(computeRsi(rising)).toBe(100);

    const falling = Array.from({ length: 40 }, (_, i) => 200 - i);
    expect(computeRsi(falling)).toBe(0);
  });
});

describe('computeTechnicals', () => {
  it('returns all-null readouts when the series is shorter than every window', () => {
    // 8 closes: below RSI's 15, momentum's 11, volatility's 15 and MA50's 51.
    const readout = computeTechnicals(rowsFromCloses(Array.from({ length: 8 }, (_, i) => 100 + i)));

    expect(readout).toEqual({ rsi14: null, maCrossover: null, momentum10Pct: null, volatility14Pct: null });
  });

  it('shows a bullish picture for a steady uptrend', () => {
    // 70 rising closes: MA10 fully above MA50, positive momentum, RSI elevated.
    const rising = Array.from({ length: 70 }, (_, i) => 100 * Math.pow(1.003, i));
    const readout = computeTechnicals(rowsFromCloses(rising));

    expect(readout.maCrossover!).toBeGreaterThan(0);
    expect(readout.momentum10Pct!).toBeGreaterThan(0);
    expect(readout.rsi14!).toBeGreaterThan(60);
    expect(readout.volatility14Pct!).toBeGreaterThanOrEqual(0);
  });

  it('shows a bearish picture for a steady downtrend', () => {
    const falling = Array.from({ length: 70 }, (_, i) => 200 * Math.pow(0.997, i));
    const readout = computeTechnicals(rowsFromCloses(falling));

    expect(readout.maCrossover!).toBeLessThan(0);
    expect(readout.momentum10Pct!).toBeLessThan(0);
    expect(readout.rsi14!).toBeLessThan(40);
  });

  it('reports zero volatility for a perfectly flat series', () => {
    const flat = Array.from({ length: 70 }, () => 123.45);
    const readout = computeTechnicals(rowsFromCloses(flat));

    expect(readout.rsi14).toBe(50);
    // SMA arithmetic accumulates float noise; assert against ~0.
    expect(readout.maCrossover).toBeCloseTo(0, 12);
    expect(readout.momentum10Pct).toBeCloseTo(0, 12);
    expect(readout.volatility14Pct).toBe(0);
  });
});
