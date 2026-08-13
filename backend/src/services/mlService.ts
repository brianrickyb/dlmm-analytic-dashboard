export class MlServiceUnavailableError extends Error {}

export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DirectionResult {
  direction: 'bullish' | 'bearish';
  confidence: number;
}

export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
}

export interface MlServiceDeps {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

async function postJson(fetchImpl: typeof fetch, url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new MlServiceUnavailableError(`Failed to reach ml-service at ${url}`, { cause: err });
  }
  if (!response.ok) {
    throw new MlServiceUnavailableError(`ml-service at ${url} returned status ${response.status}`);
  }
  try {
    return await response.json();
  } catch (err) {
    throw new MlServiceUnavailableError(`ml-service response from ${url} was not valid JSON`, { cause: err });
  }
}

export function createMlService(deps: MlServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

  async function getDirection(prices: PriceRow[]): Promise<DirectionResult> {
    const payload = await postJson(fetchImpl, `${baseUrl}/predict/direction`, { prices }, 15000);
    const p = payload as Record<string, unknown>;
    if ((p.direction !== 'bullish' && p.direction !== 'bearish') || typeof p.confidence !== 'number') {
      throw new MlServiceUnavailableError('ml-service direction response missing expected fields');
    }
    return { direction: p.direction, confidence: p.confidence };
  }

  async function getSentiment(text: string): Promise<SentimentResult> {
    const payload = await postJson(fetchImpl, `${baseUrl}/predict/sentiment`, { text }, 8000);
    const p = payload as Record<string, unknown>;
    if (
      (p.sentiment !== 'positive' && p.sentiment !== 'negative' && p.sentiment !== 'neutral') ||
      typeof p.score !== 'number'
    ) {
      throw new MlServiceUnavailableError('ml-service sentiment response missing expected fields');
    }
    return { sentiment: p.sentiment, score: p.score };
  }

  return { getDirection, getSentiment };
}
