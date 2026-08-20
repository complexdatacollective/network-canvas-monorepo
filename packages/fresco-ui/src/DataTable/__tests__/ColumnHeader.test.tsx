import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTableColumnHeader } from '../ColumnHeader';

type Row = { name: string };

const Harness = ({ sorting }: { sorting: SortingState }) => {
  const table = useReactTable<Row>({
    data: [{ name: 'Ada' }, { name: 'Grace' }],
    columns: [{ accessorKey: 'name', header: 'Name', enableSorting: true }],
    state: { sorting },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const column = table.getColumn('name')!;
  return <DataTableColumnHeader column={column} table={table} title="Name" />;
};

describe('DataTableColumnHeader', () => {
  /**
   * The header is a MENU trigger: it carries `aria-haspopup="menu"` and
   * `aria-expanded`. A button cannot be a menu button and a toggle button at
   * once, and `aria-pressed` was on it only to reach the selected colours —
   * announcing a pressed state that opening the menu does not change.
   */
  it('does not claim a toggle state while its column is sorted', () => {
    render(<Harness sorting={[{ id: 'name', desc: false }]} />);

    const header = screen.getByRole('button', { name: /Name/ });
    expect(header).not.toHaveAttribute('aria-pressed');
    expect(header).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('renders the selected treatment while its column is sorted', () => {
    render(<Harness sorting={[{ id: 'name', desc: false }]} />);

    expect(screen.getByRole('button', { name: /Name/ })).toHaveClass(
      'bg-selected',
      'text-selected-contrast',
    );
  });

  it('renders no selected treatment while its column is unsorted', () => {
    render(<Harness sorting={[]} />);

    expect(screen.getByRole('button', { name: /Name/ })).not.toHaveClass(
      'bg-selected',
    );
  });
});
