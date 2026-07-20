export function formatUsdCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function formatPercent(value: number, digits = 2): string {
  return `${value >= 0 ? '' : ''}${value.toFixed(digits)}%`;
}

export function formatPrice(value: number): string {
  if (value < 0.001) return value.toExponential(3);
  if (value < 1) return value.toFixed(6);
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
