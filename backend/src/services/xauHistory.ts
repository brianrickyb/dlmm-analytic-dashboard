import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAlphaVantageService, type GoldSnapshot } from './alphaVantage.js';
import type { PriceRow } from './mlService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_CSV_PATH = path.join(__dirname, '../data/xau-daily-history.csv');

export type { PriceRow };

export interface AlphaVantageServiceLike {
  getDailyHistory(): Promise<GoldSnapshot[]>;
}

export interface XauHistoryServiceDeps {
  alphaVantageService?: AlphaVantageServiceLike;
  staticCsvContent?: string;
}

export interface XauFullHistory {
  rows: PriceRow[];
  /**
   * First date whose row is a close-only estimate synthesized from Alpha Vantage's
   * value-only GOLD endpoint (open=high=low=close, volume=0); null when every row
   * comes from the real-OHLCV static CSV.
   *
   * NOTE FOR FUTURE FEATURE WORK: only the `close` in the estimated tail is real
   * data. Every current ML feature (ml-service training/features.py) derives from
   * Close alone, which is why feeding these rows to the model is safe. Any future
   * feature consuming High/Low/Volume must restrict itself to rows before this
   * date or source genuine intraday OHLCV.
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

export function createXauHistoryService(deps: XauHistoryServiceDeps = {}): {
  getFullHistory(): Promise<XauFullHistory>;
} {
  const alphaVantageService = deps.alphaVantageService ?? createAlphaVantageService();
  const staticCsvContent = deps.staticCsvContent ?? readFileSync(STATIC_CSV_PATH, 'utf-8');
  const staticHistory = parseStaticCsv(staticCsvContent);

  async function getFullHistory(): Promise<XauFullHistory> {
    let liveSnapshots: GoldSnapshot[] = [];
    try {
      liveSnapshots = await alphaVantageService.getDailyHistory();
    } catch {
      // Alpha Vantage unavailable -- serve the static history rather than failing the
      // whole chart/model-input request. The route layer marks the newest price as
      // stale once it ages past PRICE_STALE_AFTER_DAYS, not a hard error.
    }

    const staticMaxDate = staticHistory.length > 0 ? staticHistory[staticHistory.length - 1].date : '';
    const newRows: PriceRow[] = liveSnapshots
      .filter((s) => s.date > staticMaxDate)
      .map((s) => ({ date: s.date, open: s.value, high: s.value, low: s.value, close: s.value, volume: 0 }));

    return {
      rows: [...staticHistory, ...newRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
      estimatedFrom: newRows.length > 0 ? newRows[0].date : null,
    };
  }

  return { getFullHistory };
}
