import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PriceRow } from '../types/market';
import { formatUsd } from '../lib/format';

// The shared `formatDate` in lib/format.ts omits the year, which is correct for the shorter
// windows it's used for elsewhere (e.g. HistoryChart.tsx) but ambiguous here: this chart spans
// roughly 1.5 years, so two points 12 months apart would otherwise render identical labels
// (e.g. both "Aug 13"). Kept local to this file rather than changing the shared helper.
function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ background: 'var(--card2)', borderColor: 'var(--border2)', color: 'var(--text)' }}
    >
      <div style={{ color: 'var(--muted)' }}>{formatChartDate(label)}</div>
      <div className="font-medium tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
        {formatUsd(value)}
      </div>
    </div>
  );
}

export function PriceChart({ data }: { data: PriceRow[] }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        XAU/USD Price
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-close" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-blue)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--series-blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'var(--border2)' }}
            tickLine={false}
            minTickGap={60}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) => formatUsd(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="close" stroke="var(--series-blue)" strokeWidth={2} fill="url(#fill-close)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
