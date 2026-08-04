import type { ReactNode } from 'react';

export function StatTile({ label, value, accent }: { label: ReactNode; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}
