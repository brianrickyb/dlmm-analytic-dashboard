import { describe, expect, it, vi } from 'vitest';
import { createYahooFinanceService, YahooFinanceUnavailableError } from './yahooFinance.js';

interface FakeBar {
  ts: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
}

function chartPayload(bars: FakeBar[], timezone = 'UTC'): unknown {
  return {
    chart: {
      result: [
        {
          meta: { symbol: 'XAUUSD=X', exchangeTimezoneName: timezone },
          timestamp: bars.map((b) => b.ts),
          indicators: {
            quote: [
              {
                open: bars.map((b) => b.open),
                high: bars.map((b) => b.high),
                low: bars.map((b) => b.low),
                close: bars.map((b) => b.close),
                volume: bars.map((b) => b.volume ?? null),
              },
            ],
          },
        },
      ],
      error: null,
    },
  };
}

// Midday UTC epochs keep the UTC-side dates stable regardless of DST.
const day = (isoNoonUtc: string): number => Date.parse(isoNoonUtc) / 1000;

function okResponse(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

describe('createYahooFinanceService — parsing', () => {
  it('converts timestamps to exchange-timezone dates and returns ascending real OHLCV rows', async () => {
    // 2024-03-11T02:00Z is already Mar 11 in UTC but still Mar 10 in New York
    // (EST, -5) -- the bar MUST land on the exchange's date, not UTC's.
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse(
        chartPayload(
          [
            { ts: day('2024-03-08T12:00:00Z'), open: 2178.1, high: 2179.9, low: 2160.2, close: 2178.2, volume: 187300 },
            { ts: day('2024-03-11T02:00:00Z'), open: 2178.3, high: 2190.5, low: 2176.1, close: 2188.4, volume: 175100 },
          ],
          'America/New_York',
        ),
      ),
    );
    const service = createYahooFinanceService({ fetchImpl });

    const rows = await service.getDailyHistory('XAUUSD=X', '1mo');

    expect(rows).toEqual([
      { date: '2024-03-08', open: 2178.1, high: 2179.9, low: 2160.2, close: 2178.2, volume: 187300 },
      { date: '2024-03-10', open: 2178.3, high: 2190.5, low: 2176.1, close: 2188.4, volume: 175100 },
    ]);
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(decodeURIComponent(calledUrl)).toContain('/chart/XAUUSD=X?');
    expect(calledUrl).toContain('interval=1d');
    expect(calledUrl).toContain('range=1mo');
  });

  it('skips null holiday bars, structurally impossible bars, and deduplicates repeated dates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse(
        chartPayload([
          { ts: day('2026-08-18T12:00:00Z'), open: 4890, high: 4930, low: 4880, close: 4915, volume: 20000 },
          { ts: day('2026-08-19T12:00:00Z'), open: null, high: null, low: null, close: null, volume: null }, // holiday
          { ts: day('2026-08-20T12:00:00Z'), open: 5000, high: 4900, low: 5010, close: 4950, volume: 1 }, // high < low AND low > body -> invalid
          { ts: day('2026-08-21T12:00:00Z'), open: 4950, high: 4970, low: 4930, close: 4960, volume: 21000 },
          { ts: day('2026-08-21T12:00:00Z'), open: 4955, high: 4975, low: 4935, close: 4965, volume: 21500 }, // repeat: last wins
        ]),
      ),
    );
    const service = createYahooFinanceService({ fetchImpl });

    const rows = await service.getDailyHistory('XAUUSD=X', '1mo');

    expect(rows.map((r) => r.date)).toEqual(['2026-08-18', '2026-08-21']);
    expect(rows[1].close).toBe(4965);
  });

  it('treats missing/null volume as zero (FX bars carry none)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse(
        chartPayload([
          { ts: day('2026-08-20T12:00:00Z'), open: 1.08, high: 1.09, low: 1.07, close: 1.085 },
        ]),
      ),
    );
    const service = createYahooFinanceService({ fetchImpl });

    const rows = await service.getDailyHistory('EURUSD=X', '1mo');

    expect(rows[0].volume).toBe(0);
  });
});

describe('createYahooFinanceService — failures and caching', () => {
  it('throws a typed error when the payload carries a chart error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({ chart: { result: null, error: { code: 'Bad Request', description: 'Invalid input' } } }),
    );
    const service = createYahooFinanceService({ fetchImpl });

    await expect(service.getDailyHistory('NOPE=X', '1mo')).rejects.toBeInstanceOf(YahooFinanceUnavailableError);
  });

  it('throws on non-ok HTTP statuses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response);
    const service = createYahooFinanceService({ fetchImpl });

    await expect(service.getDailyHistory('XAUUSD=X', '1mo')).rejects.toThrow('status 429');
  });

  it('caches successes so repeated polls do not re-fetch upstream', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse(chartPayload([{ ts: day('2026-08-20T12:00:00Z'), open: 1, high: 2, low: 1, close: 1.5 }])),
    );
    const service = createYahooFinanceService({ fetchImpl });

    await service.getDailyHistory('XAUUSD=X', '1y');
    await service.getDailyHistory('XAUUSD=X', '1y');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches failures briefly so a blocked key cannot burn quota with retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const service = createYahooFinanceService({ fetchImpl });

    await expect(service.getDailyHistory('XAUUSD=X', '1y')).rejects.toBeInstanceOf(YahooFinanceUnavailableError);
    await expect(service.getDailyHistory('XAUUSD=X', '1y')).rejects.toBeInstanceOf(YahooFinanceUnavailableError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default range for unrecognized range inputs instead of forwarding them', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse(chartPayload([{ ts: day('2026-08-20T12:00:00Z'), open: 1, high: 2, low: 1, close: 1.5 }])),
    );
    const service = createYahooFinanceService({ fetchImpl });

    await service.getDailyHistory('XAUUSD=X', '../../etc');

    expect(fetchImpl.mock.calls[0][0] as string).toContain('range=1y');
  });
});
