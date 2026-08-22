import {
  getCoreRowModel,
  getSortedRowModel,
  type CellContext,
  type ColumnDef,
  type SortingFn,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';

import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { syntheticSubjectKey } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import { ConnectedVariablePill } from '~/components/VariablePill';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import { getProtocol } from '~/selectors/protocol';

import ControlsColumn from './ControlsColumn';
import { codebookVariableMarker, useCodebookVariableTarget } from './deepLink';
import {
  SyntheticEditorCell,
  SyntheticNotesCell,
  type SyntheticEditorCellProps,
} from './SyntheticColumn';
import UsageColumn from './UsageColumn';
import {
  buildVariableSyntheticRows,
  type CodebookVariableSynthetic,
} from './variableSyntheticRows';

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

/**
 * A row, with everything its synthetic cells need carried IN THE ROW rather
 * than closed over by the column definitions.
 *
 * Load-bearing, not tidiness. `flexRender` renders a `cell` definition as a
 * component, so a cell function rebuilt when the protocol changes is a new
 * component TYPE and React unmounts the subtree under it — which for this table
 * means the expanded sub-editor closes, and focus is lost, on every keystroke
 * that commits. Keeping the cell components module-level and feeding them
 * through row data is what makes editing in the table possible at all.
 */
type SyntheticVariableRow = Variable & {
  synthetic: SyntheticEditorCellProps;
  notes: readonly string[];
};

type VariablesProps = {
  entity: Entity;
  type?: string;
  variables?: Variable[];
};

/** What a row shows for an attribute the interface-rules walk never reached. */
const NO_SYNTHETIC: CodebookVariableSynthetic = {
  implied: {
    rules: {},
    binOnly: false,
    alwaysAnsweredBy: [],
    selectionPinnedBy: [],
  },
  notes: [],
};

const SyntheticCell = ({ row }: CellContext<SyntheticVariableRow, unknown>) => (
  <SyntheticEditorCell {...row.original.synthetic} />
);

const NotesCell = ({ row }: CellContext<SyntheticVariableRow, unknown>) => (
  <SyntheticNotesCell notes={row.original.notes} />
);

const Variables = ({ variables = [], entity, type }: VariablesProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);

  const subject = useMemo(
    () => ({ entity, ...(type === undefined ? {} : { type }) }),
    [entity, type],
  );
  // The stored definitions, not the usage-index rows the parent passes: a
  // summary and a sub-editor need the attribute's own type, options, validation
  // and `synthetic` block, and the document is where an authored block is
  // legible at all.
  const definitions = useAppSelector((state) =>
    getVariablesForSubjectSelector(state, subject),
  );
  const protocol = useAppSelector(getProtocol);
  const impliedRules = useMemo(
    () => buildVariableSyntheticRows(protocol, subject, definitions),
    [protocol, subject, definitions],
  );

  // A link naming an attribute of THIS subject opens that row's sub-editor.
  const target = useCodebookVariableTarget();
  const targetVariableId =
    target?.subjectKey === syntheticSubjectKey(subject)
      ? target.variableId
      : undefined;

  const rows = useMemo<SyntheticVariableRow[]>(
    () =>
      variables.map((variable) => {
        const row = impliedRules.get(variable.id) ?? NO_SYNTHETIC;
        return {
          ...variable,
          synthetic: {
            entity,
            type,
            variableId: variable.id,
            definition: definitions[variable.id],
            implied: row.implied,
            targeted: targetVariableId === variable.id,
          },
          notes: row.notes,
        };
      }),
    [variables, impliedRules, definitions, entity, type, targetVariableId],
  );

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

  const columns = useMemo<ColumnDef<SyntheticVariableRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column, table }) => (
          <DataTableColumnHeader column={column} table={table} title="Name" />
        ),
        sortingFn: caseInsensitiveSort,
        // Wrapped rather than bare so the row carries the deep-link marker: a
        // link from another screen lands on this attribute's own control.
        cell: ({ row }) => (
          <span
            className="inline-flex"
            {...codebookVariableMarker({ entity, type }, row.original.id)}
          >
            <ConnectedVariablePill
              animated
              editable
              uuid={row.original.id}
              width="25rem"
            />
          </span>
        ),
      },
      {
        id: 'synthetic',
        header: () => 'Synthetic data',
        enableSorting: false,
        cell: SyntheticCell,
      },
      {
        id: 'impliedRules',
        header: () => 'Set by the interview',
        enableSorting: false,
        cell: NotesCell,
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
    [handleDelete, entity, type],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    // Keyed by the attribute's own id rather than by position, so a row keeps
    // its identity — and its open sub-editor — when the table is re-sorted or
    // a sibling attribute is removed.
    getRowId: (row) => row.id,
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

const caseInsensitiveSort: SortingFn<SyntheticVariableRow> = (
  rowA,
  rowB,
  columnId,
) =>
  normalizeSortValue(rowA.getValue(columnId)).localeCompare(
    normalizeSortValue(rowB.getValue(columnId)),
  );

export default Variables;
