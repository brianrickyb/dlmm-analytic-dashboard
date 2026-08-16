import type { NewsSource } from '../types/news';

const SOURCES: { value: NewsSource | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'coindesk', label: 'CoinDesk' },
  { value: 'cointelegraph', label: 'Cointelegraph' },
  { value: 'theblock', label: 'The Block' },
  { value: 'decrypt', label: 'Decrypt' },
];

interface NewsFiltersProps {
  currencies: string;
  onCurrenciesChange: (value: string) => void;
  source: NewsSource | undefined;
  onSourceChange: (source: NewsSource | undefined) => void;
}

export function NewsFilters({ currencies, onCurrenciesChange, source, onSourceChange }: NewsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        type="text"
        value={currencies}
        onChange={(e) => onCurrenciesChange(e.target.value.toUpperCase())}
        placeholder="Filter by coin, e.g. BTC,SOL"
        aria-label="Filter news by coin"
        className="rounded border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--green)] sm:w-64"
        style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
      />
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => {
          const active = s.value === source;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onSourceChange(s.value)}
              aria-pressed={active}
              className="rounded-full border px-3 py-1 text-xs font-bold"
              style={{
                borderColor: active ? 'transparent' : 'var(--border)',
                background: active ? 'var(--green)' : 'var(--card)',
                color: active ? 'var(--green-fg)' : 'var(--muted)',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
