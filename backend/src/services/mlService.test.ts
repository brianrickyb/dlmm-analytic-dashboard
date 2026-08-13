import { describe, expect, it, vi } from 'vitest';
import { createMlService, MlServiceUnavailableError } from './mlService.js';

const SAMPLE_PRICES = [
  { date: '2026-01-01', open: 4000, high: 4010, low: 3990, close: 4005, volume: 1000 },
  { date: '2026-01-02', open: 4005, high: 4020, low: 4000, close: 4015, volume: 1100 },
];

describe('createMlService — getDirection', () => {
  it('returns a parsed direction result on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ direction: 'bullish', confidence: 0.73 }),
    } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    const result = await service.getDirection(SAMPLE_PRICES);

    expect(result).toEqual({ direction: 'bullish', confidence: 0.73 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ml-service.test/predict/direction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prices: SAMPLE_PRICES }),
      }),
    );
  });

  it('throws MlServiceUnavailableError when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getDirection(SAMPLE_PRICES)).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });

  it('throws MlServiceUnavailableError on a non-ok response (e.g. 422)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({}) } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getDirection(SAMPLE_PRICES)).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });

  it('throws MlServiceUnavailableError when the response is missing expected fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ direction: 'sideways', confidence: 0.5 }),
    } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getDirection(SAMPLE_PRICES)).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });
});

describe('createMlService — getSentiment', () => {
  it('returns a parsed sentiment result on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sentiment: 'positive', score: 0.91 }),
    } as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    const result = await service.getSentiment('Gold surges to record highs');

    expect(result).toEqual({ sentiment: 'positive', score: 0.91 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ml-service.test/predict/sentiment',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Gold surges to record highs' }) }),
    );
  });

  it('throws MlServiceUnavailableError when the sentiment response is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response);
    const service = createMlService({ fetchImpl, baseUrl: 'http://ml-service.test' });

    await expect(service.getSentiment('test')).rejects.toBeInstanceOf(MlServiceUnavailableError);
  });
});
