export const PAIR_LIST = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TONUSDT',
  'SUIUSDT', 'DOTUSDT', 'LTCUSDT', 'TRXUSDT', 'NEARUSDT',
];

export interface PairPositioning {
  symbol: string;
  buyRatio: number;
  sellRatio: number;
  fundingRate: number;
  price24hPct: number;
}

export interface MajorsResult {
  pairs: PairPositioning[];
  topLongSymbols: string[];
  topShortSymbols: string[];
}

export class BybitUnavailableError extends Error {}

export interface BybitServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const TICKERS_URL = 'https://api.bybit.com/v5/market/tickers?category=linear';

function accountRatioUrl(symbol: string): string {
  return `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=5min&limit=1`;
}

async function fetchBulkTickers(fetchImpl: typeof fetch): Promise<Map<string, { fundingRate: number; price24hPct: number }>> {
  let response: Response;
  try {
    response = await fetchImpl(TICKERS_URL);
  } catch (err) {
    throw new BybitUnavailableError('Failed to reach Bybit tickers endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new BybitUnavailableError(`Bybit tickers endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new BybitUnavailableError('Bybit tickers response was not valid JSON', { cause: err });
  }

  const list = (payload as { result?: { list?: unknown } })?.result?.list;
  if (!Array.isArray(list)) {
    throw new BybitUnavailableError('Bybit tickers response missing expected fields');
  }

  const map = new Map<string, { fundingRate: number; price24hPct: number }>();
  for (const raw of list) {
    const item = raw as Record<string, unknown>;
    if (typeof item.symbol !== 'string') continue;
    const fundingRate = Number(item.fundingRate);
    const price24hPcnt = Number(item.price24hPcnt);
    if (Number.isNaN(fundingRate) || Number.isNaN(price24hPcnt)) continue;
    map.set(item.symbol, { fundingRate, price24hPct: price24hPcnt * 100 });
  }
  return map;
}

async function fetchAccountRatio(
  symbol: string,
  fetchImpl: typeof fetch,
): Promise<{ symbol: string; buyRatio: number; sellRatio: number } | null> {
  let response: Response;
  try {
    response = await fetchImpl(accountRatioUrl(symbol));
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const list = (payload as { result?: { list?: unknown } })?.result?.list;
  if (!Array.isArray(list) || list.length === 0) return null;

  const entry = list[0] as Record<string, unknown>;
  const buyRatio = Number(entry.buyRatio);
  const sellRatio = Number(entry.sellRatio);
  if (Number.isNaN(buyRatio) || Number.isNaN(sellRatio)) return null;

  return { symbol, buyRatio, sellRatio };
}

export function createBybitService(deps: BybitServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  let cache: { expiresAt: number; data: MajorsResult } | null = null;

  async function getMajors(): Promise<MajorsResult> {
    if (cache && cache.expiresAt > now()) {
      return cache.data;
    }

    const tickerMap = await fetchBulkTickers(fetchImpl);
    const ratioResults = await Promise.all(PAIR_LIST.map((symbol) => fetchAccountRatio(symbol, fetchImpl)));

    const pairs: PairPositioning[] = [];
    for (const ratio of ratioResults) {
      if (!ratio) continue;
      const ticker = tickerMap.get(ratio.symbol);
      if (!ticker) continue;
      pairs.push({
        symbol: ratio.symbol,
        buyRatio: ratio.buyRatio,
        sellRatio: ratio.sellRatio,
        fundingRate: ticker.fundingRate,
        price24hPct: ticker.price24hPct,
      });
    }

    const sortedByBuyRatioDesc = [...pairs].sort((a, b) => b.buyRatio - a.buyRatio);
    const topLongSymbols = sortedByBuyRatioDesc.slice(0, 3).map((p) => p.symbol);
    const remainingForShort = sortedByBuyRatioDesc.filter((p) => !topLongSymbols.includes(p.symbol));
    const topShortSymbols = remainingForShort.slice(-3).reverse().map((p) => p.symbol);

    const result: MajorsResult = { pairs, topLongSymbols, topShortSymbols };
    cache = { expiresAt: now() + cacheTtlMs, data: result };
    return result;
  }

  return { getMajors };
}
