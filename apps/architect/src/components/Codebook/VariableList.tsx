import {
  useTable,
  type HeaderContext,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import {
  dataTableFeatures,
  type DataTableFeatures,
} from '@codaco/fresco-ui/DataTable/features';
import { type DataTableColumnDef } from '@codaco/fresco-ui/DataTable/types';
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

/**
 * TanStack instantiates a column's `header` as a React component
 * (`flexRender` calls `createElement` with the header context as props), so
 * this lives at module scope rather than inside the render body — a renderer
 * redefined during render is a new component type on every render.
 */
const NameHeader = ({
  column,
  table,
}: HeaderContext<DataTableFeatures, VariableListRow>) => {
  const intl = useAppIntl();
  return (
    <DataTableColumnHeader
      column={column}
      table={table}
      title={intl.formatMessage(messages.name)}
    />
  );
};

const Variables = ({ variables = [] }: VariableListProps) => {
  const intl = useAppIntl();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);
  const data = useMemo(() => variables.map((name) => ({ name })), [variables]);
  const columns = useMemo<DataTableColumnDef<VariableListRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: NameHeader,
        cell: ({ row }) => row.original.name,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    // Every row on one page: this table renders without pagination, and
    // `manualPagination` skips the shared feature set's paginated row model.
    manualPagination: true,
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
