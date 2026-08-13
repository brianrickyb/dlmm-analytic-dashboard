import { describe, expect, it, vi } from 'vitest';
import { createXauHistoryService } from './xauHistory.js';

const FAKE_STATIC_CSV = `Date;Open;High;Low;Close;Volume
2026.01.28 00:00;5179.67;5419.08;5157.04;5414.46;1000
2026.01.29 00:00;5421.43;5597.60;5097.38;5377.00;1100
2026.01.30 00:00;5385.09;5450.62;4679.69;4889.48;1200
`;

describe('createXauHistoryService — static-only', () => {
  it('parses the static CSV into ascending PriceRow entries when Alpha Vantage is unavailable', async () => {
    const alphaVantageService = { getDailyHistory: vi.fn().mockRejectedValue(new Error('no key')) };
    const service = createXauHistoryService({ alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getFullHistory();

    expect(history).toEqual([
      { date: '2026-01-28', open: 5179.67, high: 5419.08, low: 5157.04, close: 5414.46, volume: 1000 },
      { date: '2026-01-29', open: 5421.43, high: 5597.6, low: 5097.38, close: 5377, volume: 1100 },
      { date: '2026-01-30', open: 5385.09, high: 5450.62, low: 4679.69, close: 4889.48, volume: 1200 },
    ]);
  });
});

describe('createXauHistoryService — merged with live data', () => {
  it('appends only the live rows newer than the static data\'s last date', async () => {
    const alphaVantageService = {
      getDailyHistory: vi.fn().mockResolvedValue([
        { date: '2026-01-29', value: 5377.0 }, // already in static data -- must not duplicate
        { date: '2026-01-31', value: 4900.0 }, // new
        { date: '2026-02-01', value: 4915.5 }, // new
      ]),
    };
    const service = createXauHistoryService({ alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getFullHistory();

    expect(history).toHaveLength(5); // 3 static + 2 genuinely new
    expect(history[3]).toEqual({ date: '2026-01-31', open: 4900, high: 4900, low: 4900, close: 4900, volume: 0 });
    expect(history[4].date).toBe('2026-02-01');
  });

  it('falls back to static-only data when Alpha Vantage throws, without failing the whole call', async () => {
    const alphaVantageService = { getDailyHistory: vi.fn().mockRejectedValue(new Error('rate limited')) };
    const service = createXauHistoryService({ alphaVantageService, staticCsvContent: FAKE_STATIC_CSV });

    const history = await service.getFullHistory();

    expect(history).toHaveLength(3);
  });
});
