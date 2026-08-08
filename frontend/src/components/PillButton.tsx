import type { ButtonHTMLAttributes } from 'react';

type PillVariant = 'solid' | 'tinted';

const VARIANT_STYLE: Record<PillVariant, { background: string; color: string }> = {
  solid: { background: 'var(--accent)', color: 'var(--accent-fg)' },
  tinted: { background: 'var(--accent-bg)', color: 'var(--accent)' },
};

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
}

// Shared accent pill button — `solid` for primary actions (Connect Wallet,
// form submits), `tinted` for secondary actions (Retry, disconnect,
// log out). Callers set text size (text-sm for primary, text-xs for
// secondary) and any layout classes (w-full, col-span-2) via className;
// only the shape/color pairing is fixed here, since that's what drifted
// across pages before this component existed.
export function PillButton({ variant = 'tinted', type = 'button', className = '', style, ...props }: PillButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-full px-3 py-1.5 font-bold ${className}`}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      {...props}
    />
  );
}
