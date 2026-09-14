import { describe, expect, it, vi } from 'vitest';
import { createMarketHistoryService } from './marketHistory.js';

const FAKE_STATIC_CSV = `Date;Open;High;Low;Close;Volume
2026.01.28 00:00;5179.67;5419.08;5157.04;5414.46;1000
2026.01.29 00:00;5421.43;5597.60;5097.38;5377.00;1100
2026.01.30 00:00;5385.09;5450.62;4679.69;4889.48;1200
`;

describe('createMarketHistoryService — XAU merged history', () => {
  it('appends only real-OHLCV Yahoo rows newer than the CSV, with no estimation boundary', async () => {
    const yahooService = {
      getDailyHistory: vi.fn().mockResolvedValue([
        // Overlaps the static data -- must not duplicate.
        { date: '2026-01-30', open: 5380, high: 5455, low: 4670, close: 4889, volume: 900 },
        { date: '2026-02-02', open: 4890, high: 4930, low: 4880, close: 4915.25, volume: 20000 },
        { date: '2026-02-03', open: 4915, high: 5000, low: 4900, close: 4990.5, volume: 21000 },
      ]),
    };
    const service = createMarketHistoryService({ yahooService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getXauMergedHistory();

    expect(history.rows).toHaveLength(5); // 3 static + 2 genuinely new
    // The live tail is REAL OHLCV now -- nothing is synthesized.
    expect(history.rows[3]).toEqual({
      date: '2026-02-02', open: 4890, high: 4930, low: 4880, close: 4915.25, volume: 20000,
    });
    expect(history.rows[4].date).toBe('2026-02-03');
    expect(history.estimatedFrom).toBeNull();
  });

  it('falls back to Alpha Vantage close-only estimates when Yahoo fails', async () => {
    const yahooService = { getDailyHistory: vi.fn().mockRejectedValue(new Error('yahoo down')) };
    const alphaVantageService = {
      getDailyHistory: vi.fn().mockResolvedValue([
        { date: '2026-01-29', value: 5377.0 }, // already in static data
        { date: '2026-02-02', value: 4915.5 }, // new estimate
      ]),
    };
    const service = createMarketHistoryService({ yahooService, alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getXauMergedHistory();

    expect(history.rows).toHaveLength(4);
    // Estimated rows are flat (open=high=low=close, volume=0) and flagged.
    expect(history.rows[3]).toEqual({ date: '2026-02-02', open: 4915.5, high: 4915.5, low: 4915.5, close: 4915.5, volume: 0 });
    expect(history.estimatedFrom).toBe('2026-02-02');
  });

  it('serves the static CSV alone when every live provider fails', async () => {
    const service = createMarketHistoryService({
      yahooService: { getDailyHistory: vi.fn().mockRejectedValue(new Error('down')) },
      alphaVantageService: { getDailyHistory: vi.fn().mockRejectedValue(new Error('no key')) },
      staticCsvContent: FAKE_STATIC_CSV,
    });

    const history = await service.getXauMergedHistory();

    expect(history.rows).toHaveLength(3);
    expect(history.estimatedFrom).toBeNull();
  });
});

describe('createMarketHistoryService — live-only markets (FX majors, DXY)', () => {
  it('pulls the requested symbol straight from Yahoo without any estimation boundary', async () => {
    const liveRows = [
      { date: '2026-08-20', open: 1.08, high: 1.09, low: 1.07, close: 1.0854, volume: 0 },
      { date: '2026-08-21', open: 1.0854, high: 1.09, low: 1.08, close: 1.0872, volume: 0 },
    ];
    const yahooService = { getDailyHistory: vi.fn().mockResolvedValue(liveRows) };
    const service = createMarketHistoryService({ yahooService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getLiveFullHistory('EURUSD=X');

    expect(yahooService.getDailyHistory).toHaveBeenCalledWith('EURUSD=X', '2y');
    expect(history.rows).toEqual(liveRows);
    expect(history.estimatedFrom).toBeNull();
  });

  it('propagates provider failure so the route can degrade loudly', async () => {
    const service = createMarketHistoryService({
      yahooService: { getDailyHistory: vi.fn().mockRejectedValue(new Error('rate limited')) },
      staticCsvContent: FAKE_STATIC_CSV,
    });

    await expect(service.getLiveFullHistory('USDJPY=X')).rejects.toThrow('rate limited');
  });
});
