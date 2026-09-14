import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAlphaVantageService, type GoldSnapshot } from './alphaVantage.js';
import { createYahooFinanceService, type YahooFinanceService } from './yahooFinance.js';
import type { PriceRow } from './mlService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_CSV_PATH = path.join(__dirname, '../data/xau-daily-history.csv');

export type { PriceRow };

/**
 * Yahoo symbol for the XAU live tail. Yahoo delisted the `XAUUSD=X` spot cross
 * (verified live 2026-08-24: it 404s), so the tail uses COMEX front-month gold
 * futures (`GC=F`) -- the deepest keyless gold series on Yahoo, with REAL
 * OHLCV + volume. Futures track spot within a small basis (~0.1-1%); every ML
 * feature is close-ratio based, so a level offset mostly cancels out.
 */
export const XAU_YAHOO_SYMBOL = 'GC=F';
// The static CSV ends at its last refresh date; one year of Yahoo bars comfortably
// overlaps it even if the Kaggle CSV refresh cron stops running for a while.
const XAU_TAIL_RANGE = '1y';
// Non-XAU markets have no local baseline dataset -- their full chart comes from
// Yahoo directly. Two years (~500 daily bars) is plenty for charts and technicals.
const FX_HISTORY_RANGE = '2y';

export interface AlphaVantageServiceLike {
  getDailyHistory(): Promise<GoldSnapshot[]>;
}

export interface MarketHistoryServiceDeps {
  yahooService?: Pick<YahooFinanceService, 'getDailyHistory'>;
  alphaVantageService?: AlphaVantageServiceLike;
  staticCsvContent?: string;
}

export interface MarketFullHistory {
  rows: PriceRow[];
  /**
   * First date whose row is a close-only ESTIMATE rather than real OHLCV; null
   * when every row is genuine.
   *
   * With Yahoo Finance healthy this is always null for every market: the XAU
   * live tail now carries real OHLCV bars, so only the Alpha Vantage fallback
   * path below can produce estimates (open=high=low=close, volume=0).
   *
   * NOTE FOR FUTURE FEATURE WORK: when non-null, only the `close` in the
   * estimated tail is real data. Every ML feature (ml-service
   * training/features.py) derives from Close alone, which is why feeding those
   * rows to the model is safe. Any feature consuming High/Low/Volume must
   * restrict itself to rows before this date or source genuine intraday OHLCV.
   */
  estimatedFrom: string | null;
}

function parseStaticCsv(content: string): PriceRow[] {
  const lines = content.trim().split('\n');
  const rows: PriceRow[] = [];
  for (const line of lines.slice(1)) {
    const [dateRaw, openStr, highStr, lowStr, closeStr, volumeStr] = line.split(';');
    const open = Number(openStr);
    const high = Number(highStr);
    const low = Number(lowStr);
    const close = Number(closeStr);
    const volume = Number(volumeStr);
    if (!dateRaw || [open, high, low, close, volume].some((n) => Number.isNaN(n))) continue;
    // Static file uses "YYYY.MM.DD HH:MM" -- normalize to "YYYY-MM-DD".
    const date = dateRaw.slice(0, 10).replace(/\./g, '-');
    rows.push({ date, open, high, low, close, volume });
  }
  return rows;
}

function sortRows(rows: PriceRow[]): PriceRow[] {
  return [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Per-symbol merged daily history:
 * - getXauMergedHistory: multi-decade real-OHLCV static CSV + a real-OHLCV live
 *   tail from Yahoo Finance; if Yahoo fails, a close-only tail from Alpha
 *   Vantage (rows flagged via estimatedFrom); if both fail, the static CSV alone.
 * - getLiveFullHistory: everything else (FX majors, DXY), straight from Yahoo.
 */
export function createMarketHistoryService(deps: MarketHistoryServiceDeps = {}): {
  getXauMergedHistory(yahooSymbol?: string): Promise<MarketFullHistory>;
  getLiveFullHistory(yahooSymbol: string): Promise<MarketFullHistory>;
} {
  const yahooService = deps.yahooService ?? createYahooFinanceService();
  const alphaVantageService = deps.alphaVantageService ?? createAlphaVantageService();
  const staticCsvContent = deps.staticCsvContent ?? readFileSync(STATIC_CSV_PATH, 'utf-8');
  let staticRowsCache: PriceRow[] | null = null;

  function loadStaticRows(): PriceRow[] {
    if (staticRowsCache === null) {
      staticRowsCache = parseStaticCsv(staticCsvContent);
    }
    return staticRowsCache;
  }

  function appendNewerThan(base: PriceRow[], candidates: PriceRow[]): PriceRow[] {
    const staticMaxDate = base.length > 0 ? base[base.length - 1].date : '';
    const newRows = candidates.filter((row) => row.date > staticMaxDate);
    return sortRows([...base, ...newRows]);
  }

  /**
   * Merged XAU/USD history. `yahooSymbol` comes from the caller's market config
   * so this module stays free of slug-to-provider mappings.
   */
  async function getXauMergedHistory(yahooSymbol: string = XAU_YAHOO_SYMBOL): Promise<MarketFullHistory> {
    const base = loadStaticRows();

    try {
      const liveRows = await yahooService.getDailyHistory(yahooSymbol, XAU_TAIL_RANGE);
      // Live rows are REAL OHLCV -> no estimation boundary.
      return { rows: appendNewerThan(base, liveRows), estimatedFrom: null };
    } catch {
      // Yahoo unavailable -- degrade to the value-only Alpha Vantage feed rather
      // than failing the whole chart/model-input request. The route layer marks
      // the newest price stale once it ages past PRICE_STALE_AFTER_DAYS.
    }

    try {
      const snapshots = await alphaVantageService.getDailyHistory();
      const staticMaxDate = base.length > 0 ? base[base.length - 1].date : '';
      const estimatedRows: PriceRow[] = snapshots
        .filter((s) => s.date > staticMaxDate)
        .map((s) => ({ date: s.date, open: s.value, high: s.value, low: s.value, close: s.value, volume: 0 }));
      const rows = sortRows([...base, ...estimatedRows]);
      return { rows, estimatedFrom: estimatedRows.length > 0 ? estimatedRows[0].date : null };
    } catch {
      // Both live providers down -- serve the static history alone.
      return { rows: base, estimatedFrom: null };
    }
  }

  /** Full daily series fetched straight from Yahoo Finance (FX majors, DXY, ...). */
  async function getLiveFullHistory(yahooSymbol: string): Promise<MarketFullHistory> {
    const rows = await yahooService.getDailyHistory(yahooSymbol, FX_HISTORY_RANGE);
    return { rows, estimatedFrom: null };
  }

  return { getXauMergedHistory, getLiveFullHistory };
}
