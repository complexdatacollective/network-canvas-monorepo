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
import { ensureError } from '@codaco/shared-consts';
import { ConnectedVariablePill } from '~/components/VariablePill';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';

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
        // Fixed, localisable action strings. A variable name is a
        // researcher-authored identifier that may run to hundreds of characters
        // with no break opportunity; interpolated into the confirm button it
        // pushed Cancel clean out of the dialog (#1392). The identifier belongs
        // in the body text, which wraps.
        title: 'Delete attribute',
        // `codebook/deleteVariable` is inside the protocol timeline, so Undo
        // restores it (#1400) — wording shared with the stage, type and
        // resource dialogs.
        description: `Are you sure you want to delete the attribute “${name}”? You can restore it with Undo while this protocol remains open.`,
        confirmLabel: 'Delete attribute',
        cancelLabel: 'Cancel',
        intent: 'destructive',
        // `.unwrap()` re-throws a rejected thunk so `confirm` can surface the
        // refusal in the dialog's error paragraph and keep the dialog open.
        // Without it the dispatch promise RESOLVES even when the thunk
        // rejected, and the dialog closes reporting a deletion that never
        // happened.
        //
        // `ensureError` because `.unwrap()` throws Redux Toolkit's plain
        // `SerializedError`, not an `Error` — and the dialog only shows a
        // caught value's `message` when it `instanceof Error`, so without this
        // the researcher gets "An error occurred" instead of the reason.
        onConfirm: async () => {
          try {
            await dispatch(
              deleteVariableAsync({ entity, type, variable: id }),
            ).unwrap();
          } catch (error) {
            throw ensureError(error);
          }
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
          <ConnectedVariablePill
            animated
            editable
            uuid={row.original.id}
            width="25rem"
          />
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
        emptyText="No attributes."
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
