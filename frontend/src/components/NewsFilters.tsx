import type { NewsFilter } from '../types/news';

const FILTERS: { value: NewsFilter | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'rising', label: 'Rising' },
  { value: 'hot', label: 'Hot' },
  { value: 'bullish', label: 'Bullish' },
  { value: 'bearish', label: 'Bearish' },
  { value: 'important', label: 'Important' },
];

interface NewsFiltersProps {
  currencies: string;
  onCurrenciesChange: (value: string) => void;
  filter: NewsFilter | undefined;
  onFilterChange: (filter: NewsFilter | undefined) => void;
}

export function NewsFilters({ currencies, onCurrenciesChange, filter, onFilterChange }: NewsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        type="text"
        value={currencies}
        onChange={(e) => onCurrenciesChange(e.target.value.toUpperCase())}
        placeholder="Filter by coin, e.g. BTC,SOL"
        className="rounded border px-3 py-1.5 text-sm sm:w-64"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
      />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onFilterChange(f.value)}
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                borderColor: 'var(--border)',
                background: active ? 'var(--series-blue)' : 'var(--surface-1)',
                color: active ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
