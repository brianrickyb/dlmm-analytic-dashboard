import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PoolSnapshot } from '../types/pool';
import { formatDate, formatUsdCompact } from '../lib/format';

interface HistoryChartProps {
  data: PoolSnapshot[];
  dataKey: 'tvlUsd' | 'volume24hUsd' | 'feeApr24h';
  label: string;
  color: string;
  valueFormatter?: (v: number) => string;
}

function CustomTooltip({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div style={{ color: 'var(--text-muted)' }}>{formatDate(label)}</div>
      <div className="font-medium tabular-nums">{valueFormatter ? valueFormatter(value) : value}</div>
    </div>
  );
}

export function HistoryChart({ data, dataKey, label, color, valueFormatter }: HistoryChartProps) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mb-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--gridline)" vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="snapshotAt"
            tickFormatter={formatDate}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : formatUsdCompact(v))}
          />
          <Tooltip content={<CustomTooltip valueFormatter={valueFormatter ?? formatUsdCompact} />} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#fill-${dataKey})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
