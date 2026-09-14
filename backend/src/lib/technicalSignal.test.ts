import { describe, expect, it } from 'vitest';
import { computeTechnicalSignal } from './technicalSignal.js';
import type { TechnicalReadout } from './technicals.js';

function readout(overrides: Partial<TechnicalReadout>): TechnicalReadout {
  return {
    rsi14: null,
    maCrossover: null,
    momentum10Pct: null,
    volatility14Pct: null,
    ...overrides,
  };
}

describe('computeTechnicalSignal — warmup guards', () => {
  it('returns null when rsi14 is still null (warmup)', () => {
    const result = computeTechnicalSignal(readout({ rsi14: null, maCrossover: 1 }), 100);
    expect(result).toBeNull();
  });

  it('returns null when maCrossover is still null (warmup)', () => {
    const result = computeTechnicalSignal(readout({ rsi14: 60, maCrossover: null }), 100);
    expect(result).toBeNull();
  });
});

describe('computeTechnicalSignal — unanimous composites', () => {
  it('is bullish with full confidence when RSI, MA crossover, and momentum all agree bullish', () => {
    // RSI 20 <= 30 -> oversold/bullish. Crossover 1 on price 100 -> +1.00% -> bullish (>0.5%).
    // Momentum 2 > 1.5 -> "strong upward move"/bullish. Volatility 1 -> moderate (0.5-1.5).
    const result = computeTechnicalSignal(
      readout({ rsi14: 20, maCrossover: 1, momentum10Pct: 2, volatility14Pct: 1 }),
      100,
    );

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('bullish');
    // bullScore = 2(rsi) + 2(ma) + 1(momentum) = 5; totalWeight = 5 -> confidence 1.
    expect(result!.confidence).toBe(1);
    expect(result!.reasons).toEqual([
      'RSI(14) at 20.0 — oversold territory (below 30)',
      'SMA(10) above SMA(50) by 1.00% — short-term trend is bullish',
      '10-day momentum at +2.00% — strong upward move',
      'Moderate volatility at 1.00% — normal trading conditions',
    ]);
  });

  it('is bearish with full confidence when RSI, MA crossover, and momentum all agree bearish', () => {
    // RSI 80 >= 70 -> overbought/bearish. Crossover -1 on price 100 -> -1.00% -> bearish.
    // Momentum -2 < -1.5 -> "strong downward move"/bearish. Volatility 2 -> elevated (>1.5).
    const result = computeTechnicalSignal(
      readout({ rsi14: 80, maCrossover: -1, momentum10Pct: -2, volatility14Pct: 2 }),
      100,
    );

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('bearish');
    expect(result!.confidence).toBe(1);
    expect(result!.reasons).toEqual([
      'RSI(14) at 80.0 — overbought territory (above 70)',
      'SMA(10) below SMA(50) by 1.00% — short-term trend is bearish',
      '10-day momentum at -2.00% — strong downward move',
      'Elevated volatility at 2.00% — wider price swings expected',
    ]);
  });
});

describe('computeTechnicalSignal — disagreement and weighting', () => {
  it('is neutral with 0.5 confidence on an exact tie between RSI and MA crossover', () => {
    // RSI 25 <= 30 -> bullish (weight 2). Crossover -1 -> bearish (weight 2). No momentum (null, excluded).
    const result = computeTechnicalSignal(readout({ rsi14: 25, maCrossover: -1, momentum10Pct: null }), 100);

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('neutral');
    // bullScore = bearScore = 2; totalWeight = 4 (momentum excluded) -> confidence 2/4 = 0.5.
    expect(result!.confidence).toBe(0.5);
    // No momentum reason (excluded) and no volatility reason (null).
    expect(result!.reasons).toEqual([
      'RSI(14) at 25.0 — oversold territory (below 30)',
      'SMA(10) below SMA(50) by 1.00% — short-term trend is bearish',
    ]);
  });

  it('still weighs a neutral component into totalWeight, lowering confidence without flipping direction', () => {
    // RSI 60 >= 55 -> bullish (weight 2). Crossover exactly at the neutral threshold -> neutral (weight 2,
    // contributes to neither score but still counts toward totalWeight). Momentum 2 -> bullish (weight 1).
    const result = computeTechnicalSignal(readout({ rsi14: 60, maCrossover: 0, momentum10Pct: 2 }), 100);

    expect(result).not.toBeNull();
    expect(result!.direction).toBe('bullish');
    // bullScore = 2(rsi) + 1(momentum) = 3; bearScore = 0; totalWeight = 2+2+1 = 5 -> confidence 3/5 = 0.6.
    expect(result!.confidence).toBe(0.6);
    expect(result!.reasons).toEqual([
      'RSI(14) at 60.0 — bullish momentum (above 55)',
      'SMA(10) and SMA(50) nearly converged (+0.00%) — no clear trend',
      '10-day momentum at +2.00% — strong upward move',
    ]);
  });

  it('excludes momentum from both the signal set and totalWeight when momentum10Pct is null', () => {
    const result = computeTechnicalSignal(readout({ rsi14: 60, maCrossover: 1, momentum10Pct: null }), 100);

    expect(result).not.toBeNull();
    // Only 2 reasons (rsi, ma) — momentum's reason is never generated.
    expect(result!.reasons).toHaveLength(2);
    // bullScore = 2+2 = 4; totalWeight = 4 (not 5) -> confidence 1, not 4/5.
    expect(result!.confidence).toBe(1);
  });
});
