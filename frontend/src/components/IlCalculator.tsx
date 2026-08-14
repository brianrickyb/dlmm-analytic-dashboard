import { useMemo, useState, type ReactNode } from 'react';
import type { PoolSnapshot, Strategy } from '../types/pool';
import { calculateNetYield } from '../lib/yield';
import { formatPercent, formatPrice, formatUsd } from '../lib/format';
import { Tooltip } from './Tooltip';

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
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="mb-4 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        Impermanent loss & net yield calculator (hypothetical)
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
          Deposit amount
          <input
            type="number"
            min={0}
            value={depositUsd}
            onChange={(e) => setDepositUsd(Number(e.target.value) || 0)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
          <Tooltip termKey="strategy">Strategy</Tooltip>
          <select
            value={strategy}
            onChange={(e) => handleStrategyChange(e.target.value as Strategy)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          >
            <option value="Spot">Spot</option>
            <option value="Curve">Curve</option>
            <option value="BidAsk">Bid-Ask</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
          Range width (± %)
          <input
            type="number"
            min={1}
            max={200}
            value={widthPct}
            onChange={(e) => setWidthPct(Number(e.target.value) || 1)}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
          Entered
          <select
            value={daysAgo}
            onChange={(e) => setDaysAgo(Number(e.target.value))}
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          >
            {ENTRY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days ago
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
        Entry price {formatPrice(entrySnapshot.currentPrice)} · range [{formatPrice(lowerPrice)}, {formatPrice(upperPrice)}]. Strategy
        only sets the default range width here — it does not yet change how liquidity is weighted inside the range.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Result label="Days in range" value={`${result.daysInRange} / ${result.daysHeld}`} />
        <Result label="Fees earned" value={formatUsd(result.feesEarnedUsd)} accent="var(--green)" />
        <Result
          label={<Tooltip termKey="impermanentLoss">Impermanent loss</Tooltip>}
          value={`${formatUsd(result.impermanentLossUsd)} (${formatPercent(result.impermanentLossPct)})`}
          accent="var(--red)"
        />
        <Result
          label={<Tooltip termKey="netYield">Net yield</Tooltip>}
          value={`${formatUsd(result.netYieldUsd)} (${formatPercent(result.netYieldPct)})`}
          accent={result.netYieldUsd >= 0 ? 'var(--green)' : 'var(--red)'}
        />
      </div>
    </div>
  );
}

function Result({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div
        className="mt-0.5 text-sm font-bold tabular-nums"
        style={{ color: accent ?? 'var(--text)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </div>
    </div>
  );
}
