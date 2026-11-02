import {
  useTable,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataTableColumnHeader } from '../ColumnHeader';
import { DataTable } from '../DataTable';
import { dataTableFeatures, type DataTableFeatures } from '../features';
import { type DataTableColumnDef } from '../types';

type Row = { id: string; name: string; age: number };

const rows: Row[] = Array.from({ length: 25 }, (_, index) => ({
  id: `row-${index}`,
  name: `Person ${index}`,
  age: 20 + index,
}));

const columns: DataTableColumnDef<Row>[] = [
  {
    id: 'select',
    header: 'Select',
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onChange={(event) => row.toggleSelected(event.target.checked)}
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'name',
    header: ({ column, table }) => (
      <DataTableColumnHeader column={column} table={table} title="Name" />
    ),
    enableSorting: true,
  },
  {
    accessorKey: 'age',
    header: ({ column, table }) => (
      <DataTableColumnHeader column={column} table={table} title="Age" />
    ),
    enableSorting: true,
  },
  { id: 'notes', header: 'Notes', cell: () => 'None', enableSorting: false },
];

// A stable identity: TanStack resets the page whenever the sorting changes.
const noSorting: SortingState = [];

type HarnessProps = {
  sorting?: SortingState;
  label?: { 'aria-label': string } | { 'aria-labelledby': string } | object;
  selectedCount?: number;
  initialSelection?: RowSelectionState;
};

const Harness = ({
  sorting = noSorting,
  label = { 'aria-label': 'People' },
  initialSelection = {},
  selectedCount,
}: HarnessProps) => {
  const [rowSelection, setRowSelection] =
    useState<RowSelectionState>(initialSelection);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const table = useTable<DataTableFeatures, Row>({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection, pagination },
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
  });

  return <DataTable table={table} selectedCount={selectedCount} {...label} />;
};

const columnHeader = (name: string) =>
  screen.getByRole('columnheader', { name: new RegExp(name) });

describe('DataTable column headers', () => {
  it('declares every header cell as a column header', () => {
    render(<Harness />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(columns.length);
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col');
    }
  });

  it('puts the sort state on the header cell, not the button inside it', () => {
    const { rerender } = render(
      <Harness sorting={[{ id: 'name', desc: false }]} />,
    );

    expect(columnHeader('Name')).toHaveAttribute('aria-sort', 'ascending');
    expect(columnHeader('Age')).toHaveAttribute('aria-sort', 'none');
    for (const button of screen.getAllByRole('button', {
      name: /Name|Age/,
    })) {
      expect(button).not.toHaveAttribute('aria-sort');
    }

    rerender(<Harness sorting={[{ id: 'name', desc: true }]} />);
    expect(columnHeader('Name')).toHaveAttribute('aria-sort', 'descending');
    expect(columnHeader('Age')).toHaveAttribute('aria-sort', 'none');

    rerender(<Harness sorting={[{ id: 'age', desc: false }]} />);
    expect(columnHeader('Name')).toHaveAttribute('aria-sort', 'none');
    expect(columnHeader('Age')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('leaves columns that cannot be sorted without aria-sort', () => {
    render(<Harness sorting={[{ id: 'name', desc: false }]} />);

    expect(columnHeader('Select')).not.toHaveAttribute('aria-sort');
    expect(columnHeader('Notes')).not.toHaveAttribute('aria-sort');
  });
});

describe('DataTable accessible name', () => {
  it('names the table from aria-label', () => {
    render(<Harness label={{ 'aria-label': 'People' }} />);

    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument();
  });

  it('names the table from the heading aria-labelledby points at', () => {
    render(
      <>
        <h2 id="people-heading">All people</h2>
        <Harness label={{ 'aria-labelledby': 'people-heading' }} />
      </>,
    );

    expect(
      screen.getByRole('table', { name: 'All people' }),
    ).toBeInTheDocument();
  });
});

describe('DataTable name warning', () => {
  it('warns in development when the table has no name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness label={{}} />);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DataTable'));
    warn.mockRestore();
  });

  it('stays silent when the table has a name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(<Harness label={{ 'aria-label': 'People' }} />);
    unmount();
    render(
      <>
        <h2 id="people-heading">People</h2>
        <Harness label={{ 'aria-labelledby': 'people-heading' }} />
      </>,
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('DataTable row selection', () => {
  it('does not put aria-selected on rows, which a table does not support', () => {
    render(<Harness initialSelection={{ 'row-0': true, 'row-1': true }} />);

    const selectedRows = screen
      .getAllByRole('row')
      .filter((row) => row.getAttribute('data-state') === 'selected');
    expect(selectedRows).toHaveLength(2);
    expect(document.querySelector('[aria-selected]')).toBeNull();
  });

  it('announces how many rows are selected as the selection changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const live = screen
      .getAllByRole('status')
      .find((region) => region.textContent === '');
    expect(live).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: 'Select Person 0' }));
    expect(live).toHaveTextContent('1 row selected');

    await user.click(screen.getByRole('checkbox', { name: 'Select Person 3' }));
    expect(live).toHaveTextContent('2 rows selected');

    await user.click(screen.getByRole('checkbox', { name: 'Select Person 3' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 0' }));
    expect(live).toBeEmptyDOMElement();
  });

  it('announces a count handed in by a table that keeps its own selection', () => {
    // Selection that is not TanStack's `rowSelection` (such as "all matching",
    // which spans pages that were never fetched) is announced from the count
    // the caller states.
    const { rerender } = render(<Harness selectedCount={0} />);
    const live = screen
      .getAllByRole('status')
      .find((region) => region.textContent === '');

    rerender(<Harness selectedCount={48} />);
    expect(live).toHaveTextContent('48 rows selected');

    rerender(<Harness selectedCount={0} />);
    expect(live).toBeEmptyDOMElement();
  });

  it('counts rows selected on other pages', () => {
    render(<Harness initialSelection={{ 'row-20': true, 'row-21': true }} />);

    expect(
      screen.getByText('2 rows selected', { selector: 'output' }),
    ).toBeInTheDocument();
  });
});

describe('DataTable page changes', () => {
  it('announces the new page politely through a region that stays mounted', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const region = screen.getByText('Page 1 of 3', { selector: 'output' });
    // An <output> is a polite live region (role=status) without further markup.
    expect(screen.getAllByRole('status')).toContain(region);

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(region).toHaveTextContent('Page 2 of 3');
    expect(region).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to last page' }));
    expect(region).toHaveTextContent('Page 3 of 3');
  });
});

describe('DataTable horizontal scrolling', () => {
  const stubWidths = (scrollWidth: number, clientWidth: number) => {
    for (const [property, value] of [
      ['scrollWidth', scrollWidth],
      ['clientWidth', clientWidth],
    ] as const) {
      Object.defineProperty(HTMLElement.prototype, property, {
        configurable: true,
        get: () => value,
      });
    }
  };

  afterEach(() => {
    for (const property of ['scrollWidth', 'clientWidth']) {
      Reflect.deleteProperty(HTMLElement.prototype, property);
    }
  });

  it('makes a table that overflows a named, keyboard-reachable region', async () => {
    stubWidths(900, 300);
    render(<Harness />);

    const region = await screen.findByRole('region', { name: 'People' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });

  it('names the region from aria-labelledby as well', async () => {
    stubWidths(900, 300);
    render(
      <>
        <h2 id="people-heading">All people</h2>
        <Harness label={{ 'aria-labelledby': 'people-heading' }} />
      </>,
    );

    expect(
      await screen.findByRole('region', { name: 'All people' }),
    ).toHaveAttribute('tabindex', '0');
  });

  it('adds no tab stop or landmark while the table fits', async () => {
    stubWidths(300, 300);
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(
      screen.getByRole('table').closest('section')?.hasAttribute('tabindex'),
    ).toBe(false);
  });
});
