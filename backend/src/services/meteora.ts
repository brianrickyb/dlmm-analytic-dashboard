import { createSupabaseAdmin } from '../lib/supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Token {
  mintAddress: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface Pool {
  id: string;
  poolAddress: string;
  name: string;
  tokenX: Token;
  tokenY: Token;
  binStep: number;
  baseFeeBps: number;
  isActive: boolean;
}

export interface PoolLatestStats {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  currentPrice: number;
}

export interface PoolWithStats extends Pool {
  stats: PoolLatestStats;
}

export interface PoolSnapshot {
  poolId: string;
  snapshotAt: string;
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  feeApr24h: number;
  currentPrice: number;
}

export class MeteoraUnavailableError extends Error {}

export interface MeteoraServiceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
  historyCacheTtlMs?: number;
  supabaseAdmin?: SupabaseClient;
}

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const METEORA_BASE_URL = 'https://dlmm.datapi.meteora.ag';
const MIN_TVL_USD = 100_000;
const MIN_VOLUME_24H_USD = 10_000;
const CURATED_POOL_COUNT = 50;
const PAGE_SIZE = 100;

function parseToken(raw: unknown): Token | null {
  const t = raw as Record<string, unknown> | undefined;
  if (typeof t?.address !== 'string' || typeof t?.symbol !== 'string' || typeof t?.name !== 'string' || typeof t?.decimals !== 'number') {
    return null;
  }
  return { mintAddress: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals };
}

function parsePoolWithStats(raw: unknown): PoolWithStats | null {
  const p = raw as Record<string, unknown>;
  const address = p.address;
  const name = p.name;
  const createdAt = p.created_at;
  const tokenX = parseToken(p.token_x);
  const tokenY = parseToken(p.token_y);
  const poolConfig = p.pool_config as Record<string, unknown> | undefined;
  const binStep = poolConfig?.bin_step;
  const baseFeePct = poolConfig?.base_fee_pct;
  const tvl = Number(p.tvl);
  const currentPrice = Number(p.current_price);
  const volume = p.volume as Record<string, unknown> | undefined;
  const fees = p.fees as Record<string, unknown> | undefined;
  const volume24h = Number(volume?.['24h']);
  const fees24h = Number(fees?.['24h']);
  const isBlacklisted = p.is_blacklisted;

  if (
    typeof address !== 'string' ||
    typeof name !== 'string' ||
    typeof createdAt !== 'number' ||
    !tokenX ||
    !tokenY ||
    typeof binStep !== 'number' ||
    typeof baseFeePct !== 'number' ||
    Number.isNaN(tvl) ||
    Number.isNaN(currentPrice) ||
    Number.isNaN(volume24h) ||
    Number.isNaN(fees24h) ||
    typeof isBlacklisted !== 'boolean'
  ) {
    return null;
  }

  const feeApr24h = tvl > 0 ? (fees24h / tvl) * 365 * 100 : 0;

  return {
    id: address,
    poolAddress: address,
    name,
    tokenX,
    tokenY,
    binStep,
    baseFeeBps: baseFeePct * 100,
    isActive: !isBlacklisted,
    stats: {
      poolId: address,
      snapshotAt: new Date().toISOString(),
      tvlUsd: tvl,
      volume24hUsd: volume24h,
      fees24hUsd: fees24h,
      feeApr24h,
      currentPrice,
    },
  };
}

async function fetchPoolsRaw(fetchImpl: typeof fetch): Promise<unknown[]> {
  const params = new URLSearchParams({
    sort_by: 'tvl:desc',
    filter_by: `is_blacklisted=false && tvl>=${MIN_TVL_USD} && volume_24h>=${MIN_VOLUME_24H_USD}`,
    page: '1',
    page_size: String(PAGE_SIZE),
  });

  let response: Response;
  try {
    response = await fetchImpl(`${METEORA_BASE_URL}/pools?${params}`, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new MeteoraUnavailableError('Failed to reach Meteora pools endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new MeteoraUnavailableError(`Meteora pools endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new MeteoraUnavailableError('Meteora pools response was not valid JSON', { cause: err });
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new MeteoraUnavailableError('Meteora pools response missing expected data field');
  }
  return data;
}

interface DayPoint<T> {
  day: string;
  value: T;
}

async function fetchOhlcv(fetchImpl: typeof fetch, address: string, days: number): Promise<DayPoint<number>[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${METEORA_BASE_URL}/pools/${address}/ohlcv?resolution=1d&limit=${days}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new MeteoraUnavailableError('Failed to reach Meteora OHLCV endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new MeteoraUnavailableError(`Meteora OHLCV endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new MeteoraUnavailableError('Meteora OHLCV response was not valid JSON', { cause: err });
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new MeteoraUnavailableError('Meteora OHLCV response missing expected data field');
  }

  const points: DayPoint<number>[] = [];
  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    const timestampStr = item.timestamp_str;
    const close = Number(item.close);
    if (typeof timestampStr !== 'string' || Number.isNaN(close)) continue;
    points.push({ day: timestampStr.slice(0, 10), value: close });
  }
  return points;
}

interface VolumeFeesDay {
  volume: number;
  fees: number;
}

async function fetchVolumeHistory(fetchImpl: typeof fetch, address: string, days: number): Promise<DayPoint<VolumeFeesDay>[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${METEORA_BASE_URL}/pools/${address}/volume/history?resolution=1d&limit=${days}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new MeteoraUnavailableError('Failed to reach Meteora volume-history endpoint', { cause: err });
  }
  if (!response.ok) {
    throw new MeteoraUnavailableError(`Meteora volume-history endpoint returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new MeteoraUnavailableError('Meteora volume-history response was not valid JSON', { cause: err });
  }

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new MeteoraUnavailableError('Meteora volume-history response missing expected data field');
  }

  const points: DayPoint<VolumeFeesDay>[] = [];
  for (const raw of data) {
    const item = raw as Record<string, unknown>;
    const timestampStr = item.timestamp_str;
    const volume = Number(item.volume);
    const fees = Number(item.fees);
    if (typeof timestampStr !== 'string' || Number.isNaN(volume) || Number.isNaN(fees)) continue;
    points.push({ day: timestampStr.slice(0, 10), value: { volume, fees } });
  }
  return points;
}

async function fetchTvlRows(
  supabaseAdmin: SupabaseClient,
  address: string,
  days: number,
  now: () => number,
): Promise<DayPoint<number>[]> {
  const since = new Date(now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin.from('pool_tvl_daily').select('day, tvl_usd').eq('pool_address', address).gte('day', since);
  if (error || !data) return [];

  const points: DayPoint<number>[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const day = row.day;
    const tvlUsd = Number(row.tvl_usd);
    if (typeof day !== 'string' || Number.isNaN(tvlUsd)) continue;
    points.push({ day: day.slice(0, 10), value: tvlUsd });
  }
  return points;
}

export function createMeteoraService(deps: MeteoraServiceDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const historyCacheTtlMs = deps.historyCacheTtlMs ?? DEFAULT_HISTORY_CACHE_TTL_MS;
  const supabaseAdmin =
    deps.supabaseAdmin ??
    (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
      ? createSupabaseAdmin(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
      : null);

  let poolsCache: { expiresAt: number; data: PoolWithStats[] } | null = null;
  const historyCache = new Map<string, { expiresAt: number; data: PoolSnapshot[] }>();

  async function getPools(): Promise<PoolWithStats[]> {
    if (poolsCache && poolsCache.expiresAt > now()) {
      return poolsCache.data;
    }

    const raw = await fetchPoolsRaw(fetchImpl);
    const pools = raw
      .map(parsePoolWithStats)
      .filter((p): p is PoolWithStats => p !== null)
      .sort((a, b) => b.stats.tvlUsd - a.stats.tvlUsd)
      .slice(0, CURATED_POOL_COUNT);

    poolsCache = { expiresAt: now() + cacheTtlMs, data: pools };
    return pools;
  }

  async function getPoolByAddress(address: string): Promise<PoolWithStats | null> {
    const pools = await getPools();
    return pools.find((p) => p.poolAddress === address) ?? null;
  }

  async function getPoolHistory(address: string, days: number): Promise<PoolSnapshot[]> {
    const cacheKey = `${address}:${days}`;
    const cached = historyCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.data;
    }

    const [ohlcv, volumeHistory, tvlRows] = await Promise.all([
      fetchOhlcv(fetchImpl, address, days),
      fetchVolumeHistory(fetchImpl, address, days),
      supabaseAdmin ? fetchTvlRows(supabaseAdmin, address, days, now) : Promise.resolve([]),
    ]);

    const priceByDay = new Map(ohlcv.map((p) => [p.day, p.value]));
    const volumeByDay = new Map(volumeHistory.map((p) => [p.day, p.value]));
    const tvlByDay = new Map(tvlRows.map((p) => [p.day, p.value]));

    const coveredDays = [...priceByDay.keys()].filter((day) => volumeByDay.has(day) && tvlByDay.has(day)).sort();

    const snapshots: PoolSnapshot[] = coveredDays.map((day) => {
      const currentPrice = priceByDay.get(day)!;
      const { volume, fees } = volumeByDay.get(day)!;
      const tvlUsd = tvlByDay.get(day)!;
      const feeApr24h = tvlUsd > 0 ? (fees / tvlUsd) * 365 * 100 : 0;

      return {
        poolId: address,
        snapshotAt: `${day}T00:00:00.000Z`,
        tvlUsd,
        volume24hUsd: volume,
        fees24hUsd: fees,
        feeApr24h,
        currentPrice,
      };
    });

    historyCache.set(cacheKey, { expiresAt: now() + historyCacheTtlMs, data: snapshots });
    return snapshots;
  }

  return { getPools, getPoolByAddress, getPoolHistory };
}
