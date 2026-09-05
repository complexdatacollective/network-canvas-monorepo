import {
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
const messages = defineMessages({
  name: {
    id: 'architect.codebook.variableList.name',
    defaultMessage: 'Name',
    description: 'The title text in components / Codebook / VariableList.',
  },
  noAttributes: {
    id: 'architect.codebook.variableList.noAttributes',
    defaultMessage: 'No attributes.',
    description: 'The emptyText text in components / Codebook / VariableList.',
  },
});

type VariableListProps = {
  variables?: string[];
};

type VariableListRow = {
  name: string;
};

const Variables = ({ variables = [] }: VariableListProps) => {
  const intl = useAppIntl();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);
  const data = useMemo(() => variables.map((name) => ({ name })), [variables]);
  const columns = useMemo<ColumnDef<VariableListRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column, table }) => (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.name)}
          />
        ),
        cell: ({ row }) => row.original.name,
      },
    ],
    [intl],
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
        emptyText={intl.formatMessage(messages.noAttributes)}
      />
    </div>
  );
};

export default Variables;
