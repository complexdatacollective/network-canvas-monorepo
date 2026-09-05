import {
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingFn,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { createElement, useCallback, useMemo, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ensureError } from '@codaco/shared-consts';
import { ConnectedVariablePill } from '~/components/VariablePill';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';

import ControlsColumn from './ControlsColumn';
import UsageColumn from './UsageColumn';
const messages = defineMessages({
  unknown: {
    id: 'architect.codebook.variables.unknown',
    defaultMessage: 'Unknown',
    description:
      'Fallback attribute name when its record is unavailable in the deletion dialog.',
  },
  deleteAttribute: {
    id: 'architect.codebook.variables.deleteAttribute',
    defaultMessage: 'Delete attribute',
    description: 'The title text in components / Codebook / Variables.',
  },
  areYouSureYouWantTo: {
    id: 'architect.codebook.variables.areYouSureYouWantTo',
    defaultMessage:
      'Are you sure you want to delete the attribute “{name}”? You can restore it with Undo while this protocol remains open.',
    description: 'The description text in components / Codebook / Variables.',
  },
  name: {
    id: 'architect.codebook.variables.name',
    defaultMessage: 'Name',
    description: 'The title text in components / Codebook / Variables.',
  },
  usedIn: {
    id: 'architect.codebook.variables.usedIn',
    defaultMessage: 'Used In',
    description: 'The title text in components / Codebook / Variables.',
  },
  actions: {
    id: 'architect.codebook.variables.actions',
    defaultMessage: 'Actions',
    description: 'Visible text in components / Codebook / Variables.',
  },
  noAttributes: {
    id: 'architect.codebook.variables.noAttributes',
    defaultMessage: 'No attributes.',
    description: 'The emptyText text in components / Codebook / Variables.',
  },
});

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
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);
  const caseInsensitiveSort = useMemo<SortingFn<Variable>>(
    () => (rowA, rowB, columnId) =>
      normalizeSortValue(rowA.getValue(columnId)).localeCompare(
        normalizeSortValue(rowB.getValue(columnId)),
        intl.locale,
      ),
    [intl.locale],
  );
  // TanStack caches the sorted row model by data and sorting state, not by
  // the column comparator. Refresh its data identity when collation changes
  // while preserving both the authored row objects and the chosen direction.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const localizedRows = useMemo(() => [...variables], [variables, intl.locale]);

  const handleDelete = useCallback(
    (id: string) => {
      const variable = variables.find((v: Variable) => v.id === id);
      const name = variable?.name ?? {
        messageError: createMessageError(messages.unknown),
      };

      void confirm({
        // Fixed, localisable action strings. A variable name is a
        // researcher-authored identifier that may run to hundreds of characters
        // with no break opportunity; interpolated into the confirm button it
        // pushed Cancel clean out of the dialog (#1392). The identifier belongs
        // in the body text, which wraps.
        title: createElement(AppMessage, { message: messages.deleteAttribute }),
        // `codebook/deleteVariable` is inside the protocol timeline, so Undo
        // restores it (#1400) — wording shared with the stage, type and
        // resource dialogs.
        description: createElement(AppErrorMessage, {
          error: createMessageError(messages.areYouSureYouWantTo, { name }),
        }),
        confirmLabel: createElement(AppMessage, {
          message: messages.deleteAttribute,
        }),
        cancelLabel: createElement(AppMessage, {
          message: commonMessages.cancel,
        }),
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
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.name)}
          />
        ),
        sortingFn: caseInsensitiveSort,
        cell: ({ row }) => (
          <ConnectedVariablePill animated editable uuid={row.original.id} />
        ),
      },
      {
        accessorKey: 'usageString',
        header: ({ column, table }) => (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.usedIn)}
          />
        ),
        sortingFn: caseInsensitiveSort,
        cell: ({ row }) => (
          <UsageColumn inUse={row.original.inUse} usage={row.original.usage} />
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className="sr-only">
            {intl.formatMessage(messages.actions)}
          </span>
        ),
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
    [caseInsensitiveSort, handleDelete, intl],
  );

  const table = useReactTable({
    data: localizedRows,
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

const normalizeSortValue = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase() : String(value ?? '');

export default Variables;
