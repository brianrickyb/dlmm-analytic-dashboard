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
      <div className="rounded-full px-4 py-3" style={{ background: 'var(--accent-bg)', color: accent ?? 'var(--accent)' }}>
        <div className="text-xs">{label}</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
