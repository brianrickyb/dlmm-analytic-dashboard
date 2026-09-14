import type { TechnicalReadout } from './technicals.js';

/**
 * Deterministic directional signal computed from the same technical readout
 * the UI already shows. Unlike the ML model (which is trained on gold only),
 * this is a transparent, rule-based composite of four standard indicators
 * that works for any market with enough price history.
 *
 * Each indicator contributes one bullish, bearish, or neutral sub-signal with
 * a human-readable reason. The composite merges them into a single
 * bullish/bearish direction with a confidence score (0-1) that reflects how
 * many indicators agree.
 *
 * This is descriptive, not predictive — it tells you what the indicators
 * say right now, not what will happen.
 */
export interface TechnicalSignalResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasons: string[];
}

function rsiSignal(rsi: number): { direction: 'bullish' | 'bearish' | 'neutral'; reason: string } {
  if (rsi >= 70) {
    return { direction: 'bearish', reason: `RSI(14) at ${rsi.toFixed(1)} — overbought territory (above 70)` };
  }
  if (rsi <= 30) {
    return { direction: 'bullish', reason: `RSI(14) at ${rsi.toFixed(1)} — oversold territory (below 30)` };
  }
  if (rsi >= 55) {
    return { direction: 'bullish', reason: `RSI(14) at ${rsi.toFixed(1)} — bullish momentum (above 55)` };
  }
  if (rsi <= 45) {
    return { direction: 'bearish', reason: `RSI(14) at ${rsi.toFixed(1)} — bearish momentum (below 45)` };
  }
  return { direction: 'neutral', reason: `RSI(14) at ${rsi.toFixed(1)} — neutral range` };
}

function maCrossoverSignal(crossover: number, lastClose: number): { direction: 'bullish' | 'bearish' | 'neutral'; reason: string } {
  // Crossover is SMA(10) - SMA(50). Express as % of price for cross-market comparability.
  const pctOfPrice = (crossover / lastClose) * 100;

  if (pctOfPrice > 0.5) {
    return { direction: 'bullish', reason: `SMA(10) above SMA(50) by ${pctOfPrice.toFixed(2)}% — short-term trend is bullish` };
  }
  if (pctOfPrice < -0.5) {
    return { direction: 'bearish', reason: `SMA(10) below SMA(50) by ${Math.abs(pctOfPrice).toFixed(2)}% — short-term trend is bearish` };
  }
  return { direction: 'neutral', reason: `SMA(10) and SMA(50) nearly converged (${pctOfPrice >= 0 ? '+' : ''}${pctOfPrice.toFixed(2)}%) — no clear trend` };
}

function momentumSignal(mom: number): { direction: 'bullish' | 'bearish' | 'neutral'; reason: string } {
  if (mom > 1.5) {
    return { direction: 'bullish', reason: `10-day momentum at +${mom.toFixed(2)}% — strong upward move` };
  }
  if (mom < -1.5) {
    return { direction: 'bearish', reason: `10-day momentum at ${mom.toFixed(2)}% — strong downward move` };
  }
  if (mom > 0.3) {
    return { direction: 'bullish', reason: `10-day momentum at +${mom.toFixed(2)}% — modest upward drift` };
  }
  if (mom < -0.3) {
    return { direction: 'bearish', reason: `10-day momentum at ${mom.toFixed(2)}% — modest downward drift` };
  }
  return { direction: 'neutral', reason: `10-day momentum at ${mom >= 0 ? '+' : ''}${mom.toFixed(2)}% — sideways` };
}

function volatilityContext(vol: number): string {
  if (vol > 1.5) return `Elevated volatility at ${vol.toFixed(2)}% — wider price swings expected`;
  if (vol < 0.5) return `Low volatility at ${vol.toFixed(2)}% — tight range, potential breakout ahead`;
  return `Moderate volatility at ${vol.toFixed(2)}% — normal trading conditions`;
}

/**
 * Compute a deterministic directional signal from a TechnicalReadout.
 * Returns null when the readout is too sparse to produce a meaningful signal
 * (e.g. during the warmup period of a freshly loaded series).
 */
export function computeTechnicalSignal(technical: TechnicalReadout, lastClose: number): TechnicalSignalResult | null {
  // Need at least RSI and MA crossover for a meaningful signal.
  if (technical.rsi14 === null || technical.maCrossover === null) {
    return null;
  }

  const signals: Array<{ direction: 'bullish' | 'bearish' | 'neutral'; reason: string; weight: number }> = [];

  // RSI — weight 2 (strongest standalone overbought/oversold signal)
  signals.push({ ...rsiSignal(technical.rsi14), weight: 2 });

  // MA crossover — weight 2 (primary trend indicator)
  signals.push({ ...maCrossoverSignal(technical.maCrossover, lastClose), weight: 2 });

  // Momentum — weight 1 (confirmation, shorter window)
  if (technical.momentum10Pct !== null) {
    signals.push({ ...momentumSignal(technical.momentum10Pct), weight: 1 });
  }

  // Composite direction
  let bullScore = 0;
  let bearScore = 0;
  for (const s of signals) {
    if (s.direction === 'bullish') bullScore += s.weight;
    else if (s.direction === 'bearish') bearScore += s.weight;
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);

  let direction: 'bullish' | 'bearish' | 'neutral';
  if (bullScore > bearScore) {
    direction = 'bullish';
  } else if (bearScore > bullScore) {
    direction = 'bearish';
  } else {
    direction = 'neutral';
  }

  // Confidence = how much the winning side dominates (0.5 = tie, 1.0 = unanimous)
  const winningScore = Math.max(bullScore, bearScore);
  const confidence = totalWeight > 0 ? winningScore / totalWeight : 0.5;

  const reasons = signals.map((s) => s.reason);
  if (technical.volatility14Pct !== null) {
    reasons.push(volatilityContext(technical.volatility14Pct));
  }

  return { direction, confidence: Math.round(confidence * 1000) / 1000, reasons };
}
