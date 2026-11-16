import { act, renderHook, waitFor } from '@testing-library/react';
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction,
} from 'nuqs/adapters/testing';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type DataTableColumnDef } from '@codaco/fresco-ui/DataTable/types';
import { useClientDataTable } from '~/hooks/useClientDataTable';

type TestRow = { id: string; status: string };

const columns: DataTableColumnDef<TestRow>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'status', header: 'Status' },
];

const data: TestRow[] = [
  { id: '1', status: 'open' },
  { id: '2', status: 'closed' },
  { id: '3', status: 'open' },
];

const closedFilter = JSON.stringify([{ id: 'status', value: 'closed' }]);

const statuses = (
  table: ReturnType<typeof useClientDataTable<TestRow>>['table'],
) => table.getFilteredRowModel().rows.map((row) => row.original.status);

function wrapper({ children }: { children: ReactNode }) {
  return <NuqsTestingAdapter>{children}</NuqsTestingAdapter>;
}

describe('useClientDataTable', () => {
  it('keeps column filters in local state by default', () => {
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useClientDataTable({ data, columns }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NuqsTestingAdapter
          searchParams={{ filters: closedFilter }}
          onUrlUpdate={onUrlUpdate}
        >
          {children}
        </NuqsTestingAdapter>
      ),
    });

    expect(statuses(result.current.table)).toEqual(['open', 'closed', 'open']);

    act(() => {
      result.current.table.getColumn('status')?.setFilterValue('open');
    });

    expect(statuses(result.current.table)).toEqual(['open', 'open']);
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('reads and writes column filters through the URL when enableUrlFilters is set', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    const { result } = renderHook(
      () => useClientDataTable({ data, columns, enableUrlFilters: true }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NuqsTestingAdapter
            searchParams={{ filters: closedFilter }}
            onUrlUpdate={onUrlUpdate}
          >
            {children}
          </NuqsTestingAdapter>
        ),
      },
    );

    expect(statuses(result.current.table)).toEqual(['closed']);

    act(() => {
      result.current.table.getColumn('status')?.setFilterValue('open');
    });

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const written = onUrlUpdate.mock.lastCall?.[0].searchParams.get('filters');
    expect(written && JSON.parse(written)).toEqual([
      { id: 'status', value: 'open' },
    ]);
    expect(statuses(result.current.table)).toEqual(['open', 'open']);
  });

  it('sorts rows with a registered sortFn named by string', () => {
    const sortable: DataTableColumnDef<TestRow>[] = [
      { accessorKey: 'id', header: 'ID', sortFn: 'text' },
      { accessorKey: 'status', header: 'Status', sortFn: 'text' },
    ];
    const { result } = renderHook(
      () =>
        useClientDataTable({
          data,
          columns: sortable,
          defaultSortBy: { id: 'id', desc: true },
        }),
      { wrapper },
    );

    const ids = () =>
      result.current.table.getRowModel().rows.map((row) => row.original.id);
    expect(ids()).toEqual(['3', '2', '1']);

    act(() => {
      result.current.table.getColumn('id')?.toggleSorting(false);
    });
    expect(ids()).toEqual(['1', '2', '3']);
  });

  it('paginates client-side by default and shows every row without pagination', () => {
    const many: TestRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      status: 'open',
    }));

    const paged = renderHook(
      () => useClientDataTable({ data: many, columns }),
      { wrapper },
    );
    expect(paged.result.current.table.getRowModel().rows).toHaveLength(10);
    expect(paged.result.current.table.getPageCount()).toBe(2);

    act(() => {
      paged.result.current.table.nextPage();
    });
    expect(paged.result.current.table.getRowModel().rows).toHaveLength(2);

    const unpaged = renderHook(
      () =>
        useClientDataTable({ data: many, columns, enablePagination: false }),
      { wrapper },
    );
    expect(unpaged.result.current.table.getRowModel().rows).toHaveLength(12);
  });

  it('tracks row selection, including the filtered selection', () => {
    const { result } = renderHook(() => useClientDataTable({ data, columns }), {
      wrapper,
    });

    act(() => {
      result.current.table.getRowModel().rows[1]?.toggleSelected(true);
    });

    expect(result.current.table.state.rowSelection).toEqual({ '1': true });
    expect(
      result.current.table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original.id),
    ).toEqual(['2']);
    expect(result.current.table.getIsSomePageRowsSelected()).toBe(true);
    expect(result.current.table.getIsAllPageRowsSelected()).toBe(false);
  });
});
