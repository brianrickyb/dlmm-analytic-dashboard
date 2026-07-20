/**
 * Concentrated-liquidity impermanent loss, generalizing the classic constant-
 * product IL formula (2*sqrt(r)/(1+r) - 1) to a bounded price range [Pa, Pb] —
 * the shape of a DLMM bin range, not a full-range v2 pool.
 *
 * MVP derivation for the dashboard-first pass; will get a fuller written
 * derivation + unit tests in the dedicated IL/fee-APR testing stage.
 *
 * r  = P1/P0        current price relative to entry price
 * ra = Pa/P0, rb = Pb/P0   range bounds relative to entry price
 *
 * In range:  loss is the full-range loss amplified by 1/(1 - sqrt(ra/rb))
 *            (reduces to the classic formula as the range widens to [0, inf)).
 * Out of range: the position has fully converted to a single asset at the
 *            boundary it crossed, and its USD value is frozen/scales linearly
 *            with price from that point on.
 */

export interface IlRangeInput {
  entryPrice: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
}

export interface IlRangeResult {
  priceRatio: number;
  inRange: boolean;
  /** LP position value as a fraction of an equal-value HODL, at entry = 1. */
  lpValueRatio: number;
  hodlValueRatio: number;
  impermanentLossPct: number;
}

function fullRangeValueRatio(r: number): number {
  return (2 * Math.sqrt(r)) / (1 + r);
}

function hodlValueRatio(r: number): number {
  return (1 + r) / 2;
}

function concentratedValueRatio(r: number, ra: number, rb: number): number {
  const lossFull = 1 - fullRangeValueRatio(r);
  const amplifier = 1 - Math.sqrt(ra / rb);
  const lossConcentrated = amplifier > 1e-9 ? lossFull / amplifier : lossFull;
  return 1 - lossConcentrated;
}

export function calculateRangeIL({ entryPrice, currentPrice, lowerPrice, upperPrice }: IlRangeInput): IlRangeResult {
  const r = currentPrice / entryPrice;
  const ra = lowerPrice / entryPrice;
  const rb = upperPrice / entryPrice;

  let lpValue: number;
  let inRange: boolean;

  if (r >= ra && r <= rb) {
    inRange = true;
    lpValue = concentratedValueRatio(r, ra, rb) * hodlValueRatio(r);
  } else if (r > rb) {
    inRange = false;
    // fully converted to the quote asset at the upper boundary; frozen thereafter
    lpValue = concentratedValueRatio(rb, ra, rb) * hodlValueRatio(rb);
  } else {
    inRange = false;
    // fully converted to the base asset at the lower boundary; scales linearly with r
    const frozenAtRa = concentratedValueRatio(ra, ra, rb) * hodlValueRatio(ra);
    lpValue = frozenAtRa * (r / ra);
  }

  const hodl = hodlValueRatio(r);

  return {
    priceRatio: r,
    inRange,
    lpValueRatio: lpValue,
    hodlValueRatio: hodl,
    impermanentLossPct: (lpValue / hodl - 1) * 100,
  };
}
