import {
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';

type VariableListProps = {
  variables?: string[];
};

type VariableListRow = {
  name: string;
};

const Variables = ({ variables = [] }: VariableListProps) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);
  const data = useMemo(() => variables.map((name) => ({ name })), [variables]);
  const columns = useMemo<ColumnDef<VariableListRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column, table }) => (
          <DataTableColumnHeader column={column} table={table} title="Name" />
        ),
        cell: ({ row }) => row.original.name,
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="mt-7">
      <DataTable
        table={table}
        showPagination={false}
        emptyText="No variables."
      />
    </div>
  );
};

export default Variables;
