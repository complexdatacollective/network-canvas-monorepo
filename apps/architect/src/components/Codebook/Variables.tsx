import {
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingFn,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';

import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';

import EditableVariablePill from '../Form/Fields/VariablePicker/VariablePill';
import ControlsColumn from './ControlsColumn';
import UsageColumn from './UsageColumn';

type UsageItem = {
  label: string;
  id?: string;
};

type Variable = {
  id: string;
  name: string;
  component: string;
  inUse: boolean;
  usage: UsageItem[];
  usageString?: string;
};

type Entity = 'node' | 'edge' | 'ego';

type VariablesProps = {
  entity: Entity;
  type?: string;
  variables?: Variable[];
};

const Variables = ({ variables = [], entity, type }: VariablesProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      const variable = variables.find((v: Variable) => v.id === id);
      const { name } = variable || { name: 'Unknown' };

      void confirm({
        title: `Delete ${name}`,
        description: `Are you sure you want to delete the variable called ${name}? This cannot be undone.`,
        confirmLabel: `Delete ${name}`,
        cancelLabel: 'Cancel',
        intent: 'destructive',
        onConfirm: () => {
          void dispatch(deleteVariableAsync({ entity, type, variable: id }));
        },
      });
    },
    [confirm, dispatch, entity, type, variables],
  );

  const columns = useMemo<ColumnDef<Variable>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column, table }) => (
          <DataTableColumnHeader column={column} table={table} title="Name" />
        ),
        sortingFn: caseInsensitiveSort,
        cell: ({ row }) => (
          <EditableVariablePill uuid={row.original.id} width="25rem" />
        ),
      },
      {
        accessorKey: 'usageString',
        header: ({ column, table }) => (
          <DataTableColumnHeader
            column={column}
            table={table}
            title="Used In"
          />
        ),
        sortingFn: caseInsensitiveSort,
        cell: ({ row }) => (
          <UsageColumn inUse={row.original.inUse} usage={row.original.usage} />
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ControlsColumn
              onDelete={handleDelete}
              inUse={row.original.inUse}
              id={row.original.id}
            />
          </div>
        ),
      },
    ],
    [handleDelete],
  );

  const table = useReactTable({
    data: variables,
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

const normalizeSortValue = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase() : String(value ?? '');

const caseInsensitiveSort: SortingFn<Variable> = (rowA, rowB, columnId) =>
  normalizeSortValue(rowA.getValue(columnId)).localeCompare(
    normalizeSortValue(rowB.getValue(columnId)),
  );

export default Variables;
