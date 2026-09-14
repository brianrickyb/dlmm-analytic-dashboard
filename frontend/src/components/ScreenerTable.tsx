import { useMemo, useState, type ReactNode } from 'react';

export interface ScreenerColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  /** Grid track width, e.g. '1.5fr' or '96px'. Defaults to '1fr'. */
  width?: string;
  sortable?: boolean;
  /** Required when sortable is true — the numeric value to compare rows by. */
  sortValue?: (row: T) => number;
  render: (row: T) => ReactNode;
}

interface ScreenerTableProps<T> {
  columns: ScreenerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  /** Optional per-row href — rows render as links (e.g. out to an explorer) when set. */
  rowHref?: (row: T) => string | undefined;
  /** Optional per-row accent styling, e.g. highlighting a top-long pair. */
  rowStyle?: (row: T) => { borderColor?: string; background?: string } | undefined;
  /** Column key to sort by on first render. Unsorted (insertion order) when omitted. */
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
}

export function ScreenerTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  rowHref,
  rowStyle,
  defaultSortKey,
  defaultSortDir = 'desc',
}: ScreenerTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const gridTemplateColumns = columns.map((c) => c.width ?? '1fr').join(' ');

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = column.sortValue!(a) - column.sortValue!(b);
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}>
        {emptyMessage ?? 'No data available.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] text-sm">
        <div className="grid gap-3 border-b px-3 py-2" style={{ gridTemplateColumns, borderColor: 'var(--border)' }}>
          {columns.map((col) =>
            col.sortable ? (
              <button
                key={col.key}
                type="button"
                onClick={() => toggleSort(col.key)}
                className="text-xs font-medium"
                style={{ color: 'var(--muted)', textAlign: col.align ?? 'left' }}
              >
                {col.header}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            ) : (
              <span key={col.key} className="text-xs font-medium" style={{ color: 'var(--muted)', textAlign: col.align ?? 'left' }}>
                {col.header}
              </span>
            ),
          )}
        </div>
        <div>
          {sorted.map((row) => {
            const accent = rowStyle?.(row);
            const href = rowHref?.(row);
            const Row = href ? 'a' : 'div';
            return (
              <Row
                key={rowKey(row)}
                data-testid="screener-row"
                {...(href ? { href, target: '_blank', rel: 'noreferrer' } : {})}
                className="grid items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:brightness-110"
                style={{
                  gridTemplateColumns,
                  borderColor: 'var(--border)',
                  background: accent?.background,
                  ...(accent?.borderColor ? { boxShadow: `inset 2px 0 0 0 ${accent.borderColor}` } : {}),
                }}
              >
                {columns.map((col) => (
                  <div key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {col.render(row)}
                  </div>
                ))}
              </Row>
            );
          })}
        </div>
      </div>
    </div>
  );
}
