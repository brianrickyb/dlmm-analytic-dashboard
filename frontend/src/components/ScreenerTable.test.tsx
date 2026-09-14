import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScreenerTable, type ScreenerColumn } from './ScreenerTable';

interface Row {
  id: string;
  name: string;
  value: number;
}

const rows: Row[] = [
  { id: 'a', name: 'Alpha', value: 10 },
  { id: 'b', name: 'Beta', value: 30 },
  { id: 'c', name: 'Gamma', value: 20 },
];

const columns: ScreenerColumn<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'value', header: 'Value', align: 'right', sortable: true, sortValue: (r) => r.value, render: (r) => String(r.value) },
];

function rowNames() {
  return screen.getAllByTestId('screener-row').map((row) => within(row).getByText(/Alpha|Beta|Gamma/).textContent);
}

describe('ScreenerTable', () => {
  it('renders one row per item using the row key', () => {
    render(<ScreenerTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    render(<ScreenerTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('applies a default sort on first render when defaultSortKey is given', () => {
    render(<ScreenerTable columns={columns} rows={rows} rowKey={(r) => r.id} defaultSortKey="value" defaultSortDir="desc" />);
    expect(rowNames()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('sorts descending by a sortable column on first click, then ascending on a second click', () => {
    render(<ScreenerTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const header = screen.getByRole('button', { name: /Value/ });

    fireEvent.click(header);
    expect(rowNames()).toEqual(['Beta', 'Gamma', 'Alpha']);

    fireEvent.click(header);
    expect(rowNames()).toEqual(['Alpha', 'Gamma', 'Beta']);
  });
});
