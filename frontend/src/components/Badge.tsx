import type { ReactNode } from 'react';

type BadgeVariant = 'accent' | 'good' | 'critical' | 'warning';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: 'var(--accent-bg)', color: 'var(--accent)' },
  good: { bg: 'rgba(12, 163, 12, 0.12)', color: 'var(--status-good)' },
  critical: { bg: 'rgba(208, 59, 59, 0.12)', color: 'var(--status-critical)' },
  warning: { bg: 'rgba(250, 178, 25, 0.12)', color: 'var(--status-warning)' },
};

export function Badge({ variant = 'accent', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const { bg, color } = VARIANT_STYLES[variant];
  return (
    <span className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: bg, color }}>
      {children}
    </span>
  );
}
