import { useMemo, useState } from 'react';
import type { PoolSnapshot, Strategy } from '../types/pool';
import { calculateNetYield } from '../lib/yield';
import { formatPercent, formatPrice, formatUsd } from '../lib/format';

const STRATEGY_DEFAULT_WIDTH_PCT: Record<Strategy, number> = {
  Spot: 10,
  Curve: 25,
  BidAsk: 40,
};

const ENTRY_OPTIONS = [7, 14, 30, 60, 90];

export function IlCalculator({ series }: { series: PoolSnapshot[] }) {
  const [depositUsd, setDepositUsd] = useState(10_000);
  const [strategy, setStrategy] = useState<Strategy>('Spot');
  const [widthPct, setWidthPct] = useState(STRATEGY_DEFAULT_WIDTH_PCT.Spot);
  const [daysAgo, setDaysAgo] = useState(30);

  const entryDate = useMemo(() => {
    const idx = Math.max(0, series.length - 1 - daysAgo);
    return series[idx]?.snapshotAt ?? series[0].snapshotAt;
  }, [series, daysAgo]);

  const entrySnapshot = series.find((s) => s.snapshotAt === entryDate) ?? series[0];
  const lowerPrice = entrySnapshot.currentPrice * (1 - widthPct / 100);
  const upperPrice = entrySnapshot.currentPrice * (1 + widthPct / 100);

  const result = useMemo(
    () => calculateNetYield({ depositUsd, entryDate, lowerPrice, upperPrice, series }),
    [depositUsd, entryDate, lowerPrice, upperPrice, series],
  );

  function handleStrategyChange(next: Strategy) {
    setStrategy(next);
    setWidthPct(STRATEGY_DEFAULT_WIDTH_PCT[next]);
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-4 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        Impermanent loss & net yield calculator (hypothetical)
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Deposit amount
          <input
            type="number"
            min={0}
            value={depositUsd}
            onChange={(e) => setDepositUsd(Number(e.target.value) || 0)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Strategy
          <select
            value={strategy}
            onChange={(e) => handleStrategyChange(e.target.value as Strategy)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          >
            <option value="Spot">Spot</option>
            <option value="Curve">Curve</option>
            <option value="BidAsk">Bid-Ask</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Range width (± %)
          <input
            type="number"
            min={1}
            max={200}
            value={widthPct}
            onChange={(e) => setWidthPct(Number(e.target.value) || 1)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Entered
          <select
            value={daysAgo}
            onChange={(e) => setDaysAgo(Number(e.target.value))}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)' }}
          >
            {ENTRY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days ago
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Entry price {formatPrice(entrySnapshot.currentPrice)} · range [{formatPrice(lowerPrice)}, {formatPrice(upperPrice)}]. Strategy
        only sets the default range width here — it does not yet change how liquidity is weighted inside the range.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Result label="Days in range" value={`${result.daysInRange} / ${result.daysHeld}`} />
        <Result label="Fees earned" value={formatUsd(result.feesEarnedUsd)} accent="var(--series-green)" />
        <Result
          label="Impermanent loss"
          value={`${formatUsd(result.impermanentLossUsd)} (${formatPercent(result.impermanentLossPct)})`}
          accent="var(--series-red)"
        />
        <Result
          label="Net yield"
          value={`${formatUsd(result.netYieldUsd)} (${formatPercent(result.netYieldPct)})`}
          accent={result.netYieldUsd >= 0 ? 'var(--status-good)' : 'var(--status-critical)'}
        />
      </div>
    </div>
  );
}

function Result({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
