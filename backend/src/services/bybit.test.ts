import { describe, expect, it, vi } from 'vitest';
import { createBybitService, PAIR_LIST, BybitUnavailableError } from './bybit.js';

function buildFakeFetch(opts: {
  tickers: { symbol: string; fundingRate: string; price24hPcnt: string }[] | 'fail' | 'http-error';
  ratios: Record<string, { buyRatio: string; sellRatio: string } | 'fail' | 'http-error'>;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/v5/market/tickers')) {
      if (opts.tickers === 'fail') throw new Error('network down');
      if (opts.tickers === 'http-error') {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ result: { list: opts.tickers } }) } as Response;
    }

    if (url.includes('/v5/market/account-ratio')) {
      const symbol = new URL(url).searchParams.get('symbol')!;
      const entry = opts.ratios[symbol];
      if (entry === 'fail') throw new Error('network down');
      if (entry === 'http-error' || !entry) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { list: [{ symbol, buyRatio: entry.buyRatio, sellRatio: entry.sellRatio }] } }),
      } as Response;
    }

    throw new Error(`unexpected URL in test: ${url}`);
  });
}

// buyRatio ascending with PAIR_LIST index: BTCUSDT (index 0) = 0.50 (lowest) ... NEARUSDT (index 14) = 0.64 (highest)
function buildRatios(): Record<string, { buyRatio: string; sellRatio: string } | 'fail' | 'http-error'> {
  const ratios: Record<string, { buyRatio: string; sellRatio: string } | 'fail' | 'http-error'> = {};
  PAIR_LIST.forEach((symbol, i) => {
    const buyRatio = (0.5 + i * 0.01).toFixed(2);
    const sellRatio = (1 - Number(buyRatio)).toFixed(2);
    ratios[symbol] = { buyRatio, sellRatio };
  });
  return ratios;
}

function buildTickers() {
  return PAIR_LIST.map((symbol) => ({ symbol, fundingRate: '0.0001', price24hPcnt: '0.02' }));
}

describe('createBybitService — merge and top-3 computation', () => {
  it('merges bulk ticker data with per-pair ratio data for every pair', async () => {
    const fetchImpl = buildFakeFetch({ tickers: buildTickers(), ratios: buildRatios() });
    const service = createBybitService({ fetchImpl });

    const result = await service.getMajors();

    expect(result.pairs).toHaveLength(PAIR_LIST.length);
    const btc = result.pairs.find((p) => p.symbol === 'BTCUSDT')!;
    expect(btc.buyRatio).toBeCloseTo(0.5, 5);
    expect(btc.sellRatio).toBeCloseTo(0.5, 5);
    expect(btc.fundingRate).toBeCloseTo(0.0001, 6);
    expect(btc.price24hPct).toBeCloseTo(2, 5); // 0.02 fraction -> 2%
  });

  it('computes the top 3 long-leaning and top 3 short-leaning symbols from buyRatio', async () => {
    const fetchImpl = buildFakeFetch({ tickers: buildTickers(), ratios: buildRatios() });
    const service = createBybitService({ fetchImpl });

    const result = await service.getMajors();

    // Highest buyRatio: NEARUSDT (0.64), TRXUSDT (0.63), LTCUSDT (0.62)
    expect(result.topLongSymbols).toEqual(['NEARUSDT', 'TRXUSDT', 'LTCUSDT']);
    // Lowest buyRatio: BTCUSDT (0.50), ETHUSDT (0.51), SOLUSDT (0.52)
    expect(result.topShortSymbols).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('keeps topLongSymbols and topShortSymbols disjoint when few pairs survive merging', async () => {
    // Only 4 of the 15 pairs have both ticker and ratio data; the rest are
    // dropped as if their account-ratio fetch failed (simulates the scenario
    // from Task 2's partial-failure tolerance, but exercised here since it's
    // this task's top-3 computation that must stay correct under it).
    const survivingSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    const tickers = survivingSymbols.map((symbol) => ({ symbol, fundingRate: '0.0001', price24hPcnt: '0.02' }));
    const ratios: Record<string, { buyRatio: string; sellRatio: string }> = {
      BTCUSDT: { buyRatio: '0.90', sellRatio: '0.10' },
      ETHUSDT: { buyRatio: '0.80', sellRatio: '0.20' },
      SOLUSDT: { buyRatio: '0.20', sellRatio: '0.80' },
      BNBUSDT: { buyRatio: '0.10', sellRatio: '0.90' },
    };
    const fetchImpl = buildFakeFetch({ tickers, ratios });
    const service = createBybitService({ fetchImpl });

    const result = await service.getMajors();

    expect(result.pairs).toHaveLength(4);
    expect(result.topLongSymbols).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    expect(result.topShortSymbols).toEqual(['BNBUSDT']);
    const overlap = result.topLongSymbols.filter((s) => result.topShortSymbols.includes(s));
    expect(overlap).toEqual([]);
  });
});

describe('createBybitService — partial failure tolerance', () => {
  it('omits a pair whose account-ratio call fails, keeping the rest', async () => {
    const ratios = buildRatios();
    ratios.BTCUSDT = 'fail';
    const fetchImpl = buildFakeFetch({ tickers: buildTickers(), ratios });
    const service = createBybitService({ fetchImpl });

    const result = await service.getMajors();

    expect(result.pairs).toHaveLength(PAIR_LIST.length - 1);
    expect(result.pairs.find((p) => p.symbol === 'BTCUSDT')).toBeUndefined();
  });

  it('omits a pair present in the ratio results but missing from the bulk ticker list', async () => {
    const tickers = buildTickers().filter((t) => t.symbol !== 'BTCUSDT');
    const fetchImpl = buildFakeFetch({ tickers, ratios: buildRatios() });
    const service = createBybitService({ fetchImpl });

    const result = await service.getMajors();

    expect(result.pairs).toHaveLength(PAIR_LIST.length - 1);
    expect(result.pairs.find((p) => p.symbol === 'BTCUSDT')).toBeUndefined();
  });
});

describe('createBybitService — total failure', () => {
  it('throws BybitUnavailableError when the bulk ticker call itself fails', async () => {
    const fetchImpl = buildFakeFetch({ tickers: 'fail', ratios: buildRatios() });
    const service = createBybitService({ fetchImpl });

    await expect(service.getMajors()).rejects.toBeInstanceOf(BybitUnavailableError);
  });

  it('throws BybitUnavailableError when the bulk ticker call returns an HTTP error', async () => {
    const fetchImpl = buildFakeFetch({ tickers: 'http-error', ratios: buildRatios() });
    const service = createBybitService({ fetchImpl });

    await expect(service.getMajors()).rejects.toBeInstanceOf(BybitUnavailableError);
  });
});

describe('createBybitService — caching', () => {
  it('reuses the cached result within the TTL (no re-fetch)', async () => {
    const fetchImpl = buildFakeFetch({ tickers: buildTickers(), ratios: buildRatios() });
    let currentTime = 1_000_000;
    const service = createBybitService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000 });

    await service.getMajors();
    const callsAfterFirst = fetchImpl.mock.calls.length;
    currentTime += 30_000;
    await service.getMajors();

    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });

  it('re-fetches once the TTL has expired', async () => {
    const fetchImpl = buildFakeFetch({ tickers: buildTickers(), ratios: buildRatios() });
    let currentTime = 1_000_000;
    const service = createBybitService({ fetchImpl, now: () => currentTime, cacheTtlMs: 60_000 });

    await service.getMajors();
    const callsAfterFirst = fetchImpl.mock.calls.length;
    currentTime += 60_001;
    await service.getMajors();

    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst * 2);
  });
});
