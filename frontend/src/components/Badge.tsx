import type { ReactNode } from 'react';

type BadgeVariant = 'accent' | 'good' | 'critical' | 'warning' | 'neutral';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  accent: { bg: 'var(--green-subtle)', color: 'var(--green)' },
  good: { bg: 'rgba(0, 212, 126, 0.12)', color: 'var(--green)' },
  critical: { bg: 'var(--red-muted)', color: 'var(--red)' },
  warning: { bg: 'var(--amber-muted)', color: 'var(--amber)' },
  neutral: { bg: 'var(--card2)', color: 'var(--muted)' },
};

export function Badge({ variant = 'accent', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const { bg, color } = VARIANT_STYLES[variant];
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
      style={{ background: bg, color, fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </span>
  );
}
