export interface PumpCandidate {
  poolId: string;
  network: string;
  dex: string;
  symbol: string;
  priceChangePct6h: number;
  volumeUsd24h: number;
  poolCreatedAt: string;
  poolUrl: string;
}

export class GeckoTerminalUnavailableError extends Error {}

export interface GeckoTerminalServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 90 * 1000;
const NEW_POOLS_URL = 'https://api.geckoterminal.com/api/v2/networks/new_pools';
const TRENDING_POOLS_URL = 'https://api.geckoterminal.com/api/v2/networks/trending_pools';
const MAX_PAGES = 5;
const MAX_POOL_AGE_MS = 72 * 60 * 60 * 1000;
const MIN_PRICE_CHANGE_H6_PCT = 25;
const MIN_VOLUME_USD_24H = 50_000;
const MAX_CANDIDATES = 15;

interface RawPool {
  id: string;
  attributes?: {
    name?: unknown;
    address?: unknown;
    pool_created_at?: unknown;
    price_change_percentage?: { h6?: unknown };
    volume_usd?: { h24?: unknown };
  };
  relationships?: {
    network?: { data?: { id?: unknown } };
    dex?: { data?: { id?: unknown } };
  };
}

function parseSymbol(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const base = name.split(' / ')[0]?.trim();
  return base && base.length > 0 ? base : null;
}

function parsePool(raw: RawPool, nowMs: number): PumpCandidate | null {
  const attrs = raw.attributes;
  if (!attrs) return null;

  const symbol = parseSymbol(attrs.name);
  const network = attrs && raw.relationships?.network?.data?.id;
  const dex = raw.relationships?.dex?.data?.id;
  const address = attrs.address;
  const poolCreatedAt = attrs.pool_created_at;
  const priceChangePct6h = Number(attrs.price_change_percentage?.h6);
  const volumeUsd24h = Number(attrs.volume_usd?.h24);

  if (
    !symbol ||
    typeof network !== 'string' ||
    typeof dex !== 'string' ||
    typeof address !== 'string' ||
    typeof poolCreatedAt !== 'string' ||
    Number.isNaN(priceChangePct6h) ||
    Number.isNaN(volumeUsd24h)
  ) {
    return null;
  }

  const createdAtMs = Date.parse(poolCreatedAt);
  if (Number.isNaN(createdAtMs)) return null;

  const ageMs = nowMs - createdAtMs;
  if (ageMs < 0 || ageMs > MAX_POOL_AGE_MS) return null;
  if (priceChangePct6h < MIN_PRICE_CHANGE_H6_PCT) return null;
  if (volumeUsd24h < MIN_VOLUME_USD_24H) return null;

  return {
    poolId: raw.id,
    network,
    dex,
    symbol,
    priceChangePct6h,
    volumeUsd24h,
    poolCreatedAt,
    poolUrl: `https://www.geckoterminal.com/${network}/pools/${address}`,
  };
}

async function fetchPage(fetchImpl: typeof fetch, baseUrl: string, page: number): Promise<RawPool[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}?page=${page}`, {
      headers: { Accept: 'application/json;version=20230302' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (page === 1) throw new GeckoTerminalUnavailableError('Failed to reach GeckoTerminal', { cause: err });
    return [];
  }

  if (!response.ok) {
    if (page === 1) throw new GeckoTerminalUnavailableError(`GeckoTerminal returned status ${response.status}`);
    return [];
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    if (page === 1) throw new GeckoTerminalUnavailableError('GeckoTerminal response was not valid JSON', { cause: err });
    return [];
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    if (page === 1) throw new GeckoTerminalUnavailableError('GeckoTerminal response missing expected data field');
    return [];
  }

  return data as RawPool[];
}

export function createGeckoTerminalService(deps: GeckoTerminalServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  let cache: { expiresAt: number; data: PumpCandidate[] } | null = null;

  async function getPumpCandidates(): Promise<PumpCandidate[]> {
    if (cache && cache.expiresAt > now()) {
      return cache.data;
    }

    const nowMs = now();
    const allRaw: RawPool[] = [];

    // new_pools page 1 failing is a hard failure (propagates as GeckoTerminalUnavailableError),
    // matching the pre-existing contract. trending_pools is supplementary: if it fails entirely
    // (including its own page 1), we still return whatever new_pools already contributed instead
    // of failing the whole request.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const pagePools = await fetchPage(fetchImpl, NEW_POOLS_URL, page);
      if (pagePools.length === 0) break;
      allRaw.push(...pagePools);
    }

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const pagePools = await fetchPage(fetchImpl, TRENDING_POOLS_URL, page);
        if (pagePools.length === 0) break;
        allRaw.push(...pagePools);
      }
    } catch (err) {
      if (!(err instanceof GeckoTerminalUnavailableError)) throw err;
    }

    const dedupedRaw = [...new Map(allRaw.map((raw) => [raw.id, raw])).values()];

    const candidates = dedupedRaw
      .map((raw) => parsePool(raw, nowMs))
      .filter((c): c is PumpCandidate => c !== null)
      .sort((a, b) => b.priceChangePct6h - a.priceChangePct6h)
      .slice(0, MAX_CANDIDATES);

    cache = { expiresAt: now() + cacheTtlMs, data: candidates };
    return candidates;
  }

  return { getPumpCandidates };
}
