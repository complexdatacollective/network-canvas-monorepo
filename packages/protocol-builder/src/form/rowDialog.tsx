import { Pencil, Trash2 } from 'lucide-react';
import {
  createContext,
  type ComponentType,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { DEFAULT_ITEM_LABEL } from './arrayFields/arrayMessages.ts';
import DialogForm, {
  type DialogFormErrors,
  useDialogFormId,
} from './DialogForm.tsx';
import {
  documentFromSubmission,
  dormantFieldsOf,
  mountedPathsOf,
} from './documentFromSubmission.ts';
import { EditedRowContext, type EditedRowScope } from './editedRow.ts';
import { READ_ONLY_MESSAGE } from './readOnlyRefusal.ts';

/** One row of a list a section owns, as the stage document holds it. */
export type RowValues = Record<string, unknown>;

const messages = defineMessages({
  removeRow: {
    id: 'protocolBuilder.arrayField.removeRow',
    defaultMessage: 'Remove {itemLabel}',
    description:
      'Action that deletes one row of a list — the accessible name of the button on the row. itemLabel is the list’s own noun for one of its rows, already in the reader’s language.',
  },
  editRow: {
    id: 'protocolBuilder.arrayField.editRow',
    defaultMessage: 'Edit {itemLabel}',
    description:
      'Accessible name of the button that opens one row of a list in its editing dialog. itemLabel is the list’s own noun for one of its rows, already in the reader’s language.',
  },
  reorderRow: {
    id: 'protocolBuilder.arrayField.reorderRow',
    defaultMessage: 'Reorder {itemLabel} {position} of {count, number}',
    description:
      'Accessible name of the handle that drags one row of a list into a different position. itemLabel is the list’s own noun for one of its rows, already in the reader’s language; position is the row’s own place in the list, counting from one; count is how many rows the list holds.',
  },
  addSubmit: {
    id: 'protocolBuilder.arrayField.addSubmit',
    defaultMessage: 'Add',
    description:
      'Button that commits the dialog a researcher has filled in for a NEW row of a list. The same dialog says Save when it is editing a row that already exists.',
  },
});

/**
 * The rows a list value holds.
 *
 * A field component renders whatever the stage document has at its key, which
 * an import or a migration can leave as something that is not a list of
 * records at all; entries that are not rows are dropped rather than read,
 * which is fresco-ui's render-tolerance contract (#1433).
 */
export const rowsOf = (value: unknown): RowValues[] =>
  Array.isArray(value)
    ? value.filter(
        (row): row is RowValues =>
          typeof row === 'object' && row !== null && !Array.isArray(row),
      )
    : [];

/**
 * A row's own identity: `id`, and nothing else.
 *
 * It is what the list mints when a row is added, what the protocol schema
 * carries on a prompt, a panel, a form field and a content block for exactly
 * this reason, and the only thing about a row that survives being edited and
 * moved. `ArrayField` keys its rows on it, so `editingId` survives a reorder
 * and an edit lands on the row it was made from.
 */
export const rowId = (row: RowValues): string | undefined =>
  typeof row.id === 'string' && row.id.length > 0 ? row.id : undefined;

/**
 * What a row being ADDED starts out holding.
 *
 * The id is the list's own business and is filled in whether the section's
 * template supplies one or not; everything else is what the section says a new
 * row of its list begins as.
 */
export const rowTemplate =
  (template?: () => Partial<RowValues>) => (): Partial<RowValues> => {
    const row = template?.() ?? {};
    return { ...row, id: rowId(row) ?? crypto.randomUUID() };
  };

/** What the fields a section renders inside a row dialog are told. */
export type RowEditorProps = Readonly<{
  /** The row the dialog opened on, whole. */
  item: RowValues;
  /** Its index in the committed list; absent for a row being added. */
  editIndex?: number;
  /**
   * DOM id of the dialog's own form, for a control rendered outside it.
   *
   * The id the dialog actually rendered, not the name it was configured with:
   * a `form=` attribute resolves by id, and the two differ by a per-mount
   * suffix that exists precisely so a dialog animating closed cannot capture
   * the submit of the one that replaced it.
   */
  form: string;
}>;

export type RowEditorComponent = ComponentType<RowEditorProps>;

/** What a collapsed row hands the summary a section renders for it. */
export type RowPreviewProps = Readonly<{ item: RowValues }>;

export type RowPreviewComponent = ComponentType<RowPreviewProps>;

/**
 * What a section's own gate makes of the row about to be committed: the row to
 * commit, or the reason it may not be.
 *
 * Two answers rather than one value, because a refusal is a record too and the
 * dialog has to be able to tell them apart. A refusal keeps the dialog open
 * with the draft intact and the reason where the researcher can act on it —
 * above the fields for something about the whole row, on the named control for
 * something about one of them.
 */
export type RowSaveOutcome =
  | Readonly<{ row: RowValues }>
  | Readonly<{ refused: DialogFormErrors }>;

/** What a section's gate is told about the row beyond the row itself. */
export type RowSaveContext = Readonly<{
  /** Its index in the committed list; absent for a row being added. */
  editIndex?: number;
  /**
   * The row as this dialog OPENED on it, for a gate asking what the researcher
   * decided since — an unchanged-pick escape, above all. Judged against the row
   * as it stands now, a pick they never touched stops reading as one.
   */
  openedOn: RowValues;
}>;

/**
 * Everything the row and the dialog need that is not `ArrayField`'s to supply.
 *
 * By CONTEXT rather than by props, because `ArrayField` mounts the two
 * components below directly: a component identity derived per render would
 * remount the row — destroying an open dialog and the researcher's draft with
 * it — every time anything the section closes over moved, which for a gate
 * that reads the protocol is every revision anybody makes.
 */
export type RowListConfig = Readonly<{
  /** How one row reads in the list when its dialog is closed. */
  Preview: RowPreviewComponent;
  /** The section's own fields, rendered inside the row dialog. */
  Editor: RowEditorComponent;
  /** Dialog title for a row being added. */
  addTitle: MessageDescriptor;
  /** Dialog title for a row that already exists. */
  editTitle: MessageDescriptor;
  /** Stable, human-readable stem for the dialog form's DOM id. */
  formId: string;
  /**
   * The name the list is mounted under, for a control inside the dialog asking
   * what the stage would hold if this row were saved — see
   * {@link EditedRowScope}. Left out by a list with no place of its own in the
   * stage document: a list nested inside another row, whose rows reach the
   * stage through the dialog around IT.
   */
  name?: string;
  /**
   * Opens the row on controls its saved shape does not name.
   *
   * A content block's `content` is one key whose MEANING depends on its kind —
   * prose for a text block, a resource id for every other — so the editor gives
   * each kind a slot of its own and this puts the saved value in the slot the
   * row's kind names. Run once, when the dialog opens: what is written back is
   * `normalize`'s business, and a section declaring one without the other saves
   * a row the protocol schema refuses.
   */
  expand?: (row: RowValues) => RowValues;
  /**
   * A check, a codebook write, or anything else that must succeed before the
   * row is committed. The row it answers with is the row committed.
   */
  beforeSave?: (
    row: RowValues,
    context: RowSaveContext,
  ) => RowSaveOutcome | Promise<RowSaveOutcome>;
  /** Last transform before the row reaches the list. */
  normalize?: (row: RowValues) => RowValues;
}>;

const RowListContext = createContext<RowListConfig | null>(null);

const useRowListConfig = (): RowListConfig => {
  const config = useContext(RowListContext);
  if (config === null) {
    throw new Error('A row list’s renderers must be used inside a RowList.');
  }
  return config;
};

/**
 * The configuration the rows and the row dialog of one list read.
 *
 * Wraps the `<Field>` the section mounts, so that everything below is
 * `ArrayField` as it is: `RowListItem` is its `itemComponent` and `RowDialog`
 * its `editorComponent`, and neither takes a prop of its own.
 */
export function RowList({
  config,
  children,
}: Readonly<{ config: RowListConfig; children: ReactNode }>) {
  return <RowListContext value={config}>{children}</RowListContext>;
}

/**
 * One row of a list edited in a dialog: what it holds, and the three things a
 * researcher can do to it.
 *
 * The affordances are named in the list's own noun, which `ArrayField` hands
 * down from the same descriptor its delete confirmation uses, so a stage
 * editor showing several lists at once does not show several rows of
 * identically named buttons (#1391).
 */
export function RowListItem({
  item,
  index,
  itemCount,
  itemLabel,
  isSortable,
  isBeingEdited,
  dragControls,
  onMove,
  onEdit,
  onDelete,
  disabled,
  readOnly,
  editTriggerRef,
  deleteTriggerRef,
}: ArrayFieldItemProps<RowValues>) {
  const intl = useAppIntl();
  const { Preview } = useRowListConfig();
  // Resolved once for the whole row: every affordance below says the same noun.
  const noun = intl.formatMessage(itemLabel ?? DEFAULT_ITEM_LABEL);
  const interactionDisabled = disabled || readOnly;

  // A row hides its own controls while its editor is open: the dialog IS this
  // row for as long as it is on screen, and the Edit button that opened it has
  // to be gone by the time focus is handed back. (A row still being ADDED
  // never reaches here — `ArrayField` keeps drafts out of the list whenever an
  // editor component is rendering them instead.)
  if (isBeingEdited) return null;

  return (
    <div className="flex w-full items-center gap-3">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={interactionDisabled}
          label={intl.formatMessage(messages.reorderRow, {
            itemLabel: noun,
            // The row's own place in the list, which the researcher reads as
            // this row's number rather than as a quantity — so it is passed as
            // they would say it, ungrouped.
            position: String(index + 1),
            count: itemCount,
          })}
        />
      )}
      <div className="min-w-0 flex-1">
        <Preview item={stripManagedProperties<RowValues>(item)} />
      </div>
      <IconButton
        ref={editTriggerRef}
        icon={<Pencil />}
        aria-label={intl.formatMessage(messages.editRow, { itemLabel: noun })}
        color="dynamic"
        disabled={interactionDisabled}
        onClick={onEdit}
      />
      <IconButton
        ref={deleteTriggerRef}
        icon={<Trash2 />}
        aria-label={intl.formatMessage(messages.removeRow, { itemLabel: noun })}
        color="destructive"
        disabled={interactionDisabled}
        onClick={onDelete}
      />
    </div>
  );
}

/**
 * One editing session, which outlives the list's own editing state.
 *
 * `item` is undefined between edits, and the dialog stays mounted through that
 * so it can animate closed — so the row, the title and the submit label all
 * come from the session rather than from the props of the moment, which would
 * otherwise flip to nothing while the researcher is still watching the dialog
 * leave.
 *
 * `key` is what gives every session its own form store: fresco-ui has no
 * whole-form reinitialise, so a reused store would open the next row — or the
 * same row reopened after a cancel — holding the last session's draft.
 */
type RowEditorSession = Readonly<{
  key: number;
  row: RowValues;
  editIndex?: number;
  isNewItem: boolean;
  open: boolean;
  layoutId?: string;
}>;

function useRowEditorSession(
  item: ArrayFieldEditorProps<RowValues>['item'],
  index: number | null,
  isNewItem: boolean,
  expand: RowListConfig['expand'],
): RowEditorSession | null {
  const [session, setSession] = useState<RowEditorSession | null>(null);
  // Read through a ref rather than depended on: a section binds its expansion
  // to whatever it reads the row against, and rebuilding the session when that
  // moves would reopen the dialog on a fresh store over the researcher's draft.
  const expandRef = useRef(expand);
  expandRef.current = expand;
  const row = useMemo(() => {
    if (!item) return undefined;
    const values = stripManagedProperties<RowValues>(item);
    return expandRef.current ? expandRef.current(values) : values;
  }, [item]);
  const layoutId =
    typeof item?._internalId === 'string' ? item._internalId : undefined;

  useEffect(() => {
    setSession((previous) => {
      if (row === undefined) {
        return previous?.open ? { ...previous, open: false } : previous;
      }
      // A new item is not in the committed array yet, so it has no index to
      // report.
      const editIndex = !isNewItem && index !== null ? index : undefined;
      return {
        key: (previous?.key ?? 0) + 1,
        row,
        ...(editIndex === undefined ? {} : { editIndex }),
        isNewItem,
        open: true,
        // A new item was never a row, so there is nothing on screen for the
        // dialog to morph out of.
        ...(isNewItem || layoutId === undefined ? {} : { layoutId }),
      };
    });
  }, [index, isNewItem, layoutId, row]);

  return session;
}

/**
 * A row of a list, edited in a dialog of its own.
 *
 * The canonical shape: a form store around the dialog, the fields inside its
 * `<form>`, and the chrome — title, Cancel, the submit control — outside that
 * element but sharing the store. Nothing typed here reaches the stage until the
 * researcher saves, so cancelling leaves the stage exactly as it was.
 *
 * The row it commits is the record this dialog's own submit leaves, assembled
 * the same way the stage form assembles the stage: fields still on screen write
 * at their own paths, a value hidden behind a collapsed group is put back, and
 * one hidden after the researcher emptied it is removed. What is left holding
 * nothing is the list's `normalize` to decide.
 */
export function RowDialog({
  item,
  index,
  isNewItem,
  onSave,
  onCancel,
  getEditorTrigger,
}: ArrayFieldEditorProps<RowValues>) {
  const intl = useAppIntl();
  const {
    addTitle,
    editTitle,
    formId,
    name,
    expand,
    beforeSave,
    normalize,
    Editor,
  } = useRowListConfig();
  const session = useRowEditorSession(item, index, isNewItem, expand);

  if (session === null) return null;

  return (
    <DialogForm
      key={session.key}
      open={session.open}
      onClose={onCancel}
      title={intl.formatMessage(session.isNewItem ? addTitle : editTitle)}
      formId={formId}
      document={session.row}
      size="editor"
      submitLabel={intl.formatMessage(
        session.isNewItem ? messages.addSubmit : commonMessages.save,
      )}
      onSubmit={async (_values, edited) => {
        // `ArrayField` withdraws its own save handler while the list is not
        // accepting changes, so calling it would leave the dialog closing over
        // an edit that reached nothing. The stage being somebody else's is the
        // only way that happens once a dialog is open: a list waiting on a
        // choice elsewhere on the stage cannot be reached past a modal dialog,
        // and one at capacity still saves the row it is editing.
        if (onSave === undefined) return { formErrors: [READ_ONLY_MESSAGE] };

        const outcome = beforeSave
          ? await beforeSave(edited, {
              ...(session.editIndex === undefined
                ? {}
                : { editIndex: session.editIndex }),
              openedOn: session.row,
            })
          : { row: edited };
        if ('refused' in outcome) return outcome.refused;

        // Asked again on the far side of the gate: the answer above is stale
        // by the time an asynchronous one resolves.
        if (onSave === undefined) return { formErrors: [READ_ONLY_MESSAGE] };
        onSave(normalize ? normalize(outcome.row) : outcome.row);
      }}
      /**
       * A row hides its own controls while it is being edited, so the Edit
       * button that opened this dialog is not the element that will be on
       * screen when it closes. `getEditorTrigger` is called at that moment and
       * answers with the freshly mounted control — or, for a new item (which
       * was never a row), with the list's add button.
       */
      finalFocus={getEditorTrigger}
      {...(session.layoutId === undefined
        ? {}
        : { layoutId: session.layoutId })}
      style={{ borderRadius: 'var(--radius)' }}
    >
      <RowFields
        {...(name === undefined ? {} : { name })}
        row={session.row}
        {...(session.editIndex === undefined
          ? {}
          : { editIndex: session.editIndex })}
        formId={formId}
        Editor={Editor}
      />
    </DialogForm>
  );
}

/**
 * The section's own fields, inside the dialog's store.
 *
 * Rendered here rather than by `RowDialog` itself because it is the store that
 * both of the things below need: the DOM id the dialog gave its `<form>`, and
 * the draft the next save would commit.
 */
function RowFields({
  name,
  row,
  editIndex,
  formId,
  Editor,
}: Readonly<{
  name?: string;
  row: RowValues;
  editIndex?: number;
  formId: string;
  Editor: RowEditorComponent;
}>) {
  const storeApi = useContext(FormStoreContext);
  const dialogFormId = useDialogFormId();

  /**
   * Which list this row is going into, and what a save would put there.
   *
   * The row on screen is not in the stage form behind this dialog — that is
   * what a row dialog IS — so anything reasoning about the stage the next save
   * would produce has to be told about it. `read` assembles the row exactly as
   * the submit does, so the two cannot disagree about one draft.
   *
   * The list, not a place in it: a dialog outlives its row leaving the list, so
   * the position it opened at can belong to another row by the time a reader
   * uses it. See {@link EditedRowScope}.
   */
  const editedRow = useMemo<EditedRowScope | null>(() => {
    if (name === undefined || storeApi === undefined) return null;
    const listPath = safeKeyPath(name);
    if (listPath === null) return null;
    return {
      listPath,
      read: () =>
        documentFromSubmission({
          currentFields: row,
          submittedValues: storeApi.getState().getFormValues(),
          mountedPaths: mountedPathsOf(storeApi),
          dormantFields: dormantFieldsOf(storeApi),
          emptied: 'keep',
        }),
    };
  }, [name, row, storeApi]);

  return (
    <EditedRowContext value={editedRow}>
      <Editor
        item={row}
        {...(editIndex === undefined ? {} : { editIndex })}
        form={dialogFormId ?? formId}
      />
    </EditedRowContext>
  );
}

/**
 * Object keys the whole way down, or nothing.
 *
 * A segment that is an array INDEX names a position rather than a place: a
 * collaborator inserting a row above it makes it address a different one, and
 * nothing reading this scope could tell.
 */
function safeKeyPath(name: string): readonly string[] | null {
  try {
    const path = resolveFieldPath([], name);
    return path.every((segment) => typeof segment === 'string')
      ? (path as string[])
      : null;
  } catch {
    return null;
  }
}
