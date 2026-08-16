import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  accent,
  variant = 'default',
}: {
  label: ReactNode;
  value: string;
  accent?: string;
  variant?: 'default' | 'hero';
}) {
  if (variant === 'hero') {
    return (
      <div className="rounded-xl px-4 py-3" style={{ background: 'var(--green-subtle)', color: accent ?? 'var(--green)' }}>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{label}</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{value}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums"
        style={{ color: accent ?? 'var(--text)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </div>
    </div>
  );
}
