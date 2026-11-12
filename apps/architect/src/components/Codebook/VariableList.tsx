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
  tableLabel: {
    id: 'architect.codebook.variableList.tableLabel',
    defaultMessage: 'Attributes',
    description:
      'Accessible name of the table listing the attributes of a type, announced by screen readers when it is reached.',
  },
  name: {
    id: 'architect.codebook.variableList.name',
    defaultMessage: 'Name',
    description:
      'Column header of the table that lists the attribute names found in a network resource file on the Codebook page. Clicking it sorts the table.',
  },
  noAttributes: {
    id: 'architect.codebook.variableList.noAttributes',
    defaultMessage: 'No attributes.',
    description:
      'Message shown in place of the rows of the table of a network resource attributes when the resource file has none.',
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
        aria-label={intl.formatMessage(messages.tableLabel)}
        showPagination={false}
        emptyText={intl.formatMessage(messages.noAttributes)}
      />
    </div>
  );
};

export default Variables;
