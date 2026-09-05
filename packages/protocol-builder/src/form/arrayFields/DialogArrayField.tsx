import { cloneDeep, isEqual, set, unset } from 'es-toolkit/compat';
import { Pencil, Trash2 } from 'lucide-react';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import { v4 as uuid } from 'uuid';

import { IconButton } from '@codaco/fresco-ui/Button';
import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import ArrayField, {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { ensureError } from '@codaco/shared-consts';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import {
  useStageEditorForm,
  type StageFormStoreApi,
} from '../stageEditorContext.ts';
import ArrayItemDialog, { type FormLevelValidate } from './ArrayItemDialog.tsx';
import { useArrayFieldCommands } from './useArrayFieldCommands.ts';

/**
 * COMPOSITION: this is a *field component*, rendered as
 * `<ProtocolArrayField name="prompts" component={DialogArrayField} … />`.
 * It receives the whole array as one `value`/`onChange` pair and never
 * registers per-index leaves, which is the governing rule for every array in
 * the stage form: a deleted row's dormant value must not be able to resurrect
 * itself in the submitted values. Making it a field component rather than a
 * self-contained `name`-taking section keeps ONE owner of the field name, the
 * validation adapter and the problem-panel anchor (`ProtocolArrayField`).
 */

type ArrayItem = Record<string, unknown>;
type Renderer = ComponentType<Record<string, unknown>>;

/**
 * Reads the protocol around the stage for the row being edited, so the editor
 * can open on a richer object than the array itself holds — e.g. merging a
 * codebook variable's `options`/`validation` over the stored field. Keyed on
 * the edited item rather than on a form path: the array is one opaque value,
 * so there is no per-row path to select.
 *
 * It is handed the package's tolerant protocol read model rather than a host
 * store, so the same editor works in any host and cannot reach anything the
 * package does not already guarantee is there.
 */
export type DialogArrayItemSelector = (
  context: ProtocolBuilderProtocolContext,
  scope: { item: ArrayItem; index: number },
) => unknown;

/**
 * `editorValidate`'s second argument carries the edited row's committed array
 * index so a sibling-duplicate check can exclude that row. A new item is not
 * in the committed array and reports none.
 */
export type DialogArrayEditorValidate = (
  values: Record<string, unknown>,
  context?: {
    editIndex?: number;
    /** The row's PRE-EDIT committed values, for an unchanged-pick escape. */
    initialValues?: unknown;
  },
) => Record<string, unknown> | undefined;

export type DialogArrayFieldProps<T extends ArrayItem> = Omit<
  ArrayFieldProps<T>,
  | 'addButtonLabel'
  | 'confirmDelete'
  | 'editorComponent'
  | 'immediateAdd'
  | 'itemComponent'
  | 'itemTemplate'
  | 'onOperation'
> & {
  /**
   * Visible text and accessible name of the add button — REQUIRED, and a whole
   * string rather than a `Create new ${itemLabel}` template, so it can be
   * localised and so no call site can fall back to a generic default.
   *
   * A stage editor mounts several of these at once (a Name Generator has both
   * a form-field list and a prompt list). Named "Create new", every one of
   * them is the same control to anyone navigating by a list of buttons
   * (#1391).
   */
  addButtonLabel: string;
  /** Dialog title when adding. Defaults to `Add ${itemLabel}`. */
  addTitle?: string;
  /** Dialog title when editing an existing row. */
  editorTitle: string;
  /** Renders the collapsed row. Receives the item's own properties. */
  previewComponent: Renderer;
  previewProps?: Record<string, unknown>;
  /** Renders the editor dialog's fields. Receives the item's own properties. */
  editorFieldsComponent: Renderer;
  editorProps?: Record<string, unknown>;
  /**
   * Optional supporting pane for the editor dialog. It receives the row that
   * opened the dialog plus `editorPreviewProps`, and can subscribe to the
   * dialog form store for live draft values.
   */
  editorPreviewComponent?: Renderer;
  editorPreviewProps?: Record<string, unknown>;
  /** Semantic width preset for the editor dialog. */
  editorDialogSize?: DialogProps['size'];
  editorValidate?: DialogArrayEditorValidate;
  /** Noun used in row affordances ("Edit prompt", "Remove prompt"). */
  itemLabel?: string;
  itemSelector?: DialogArrayItemSelector;
  itemTemplate?: () => Partial<T>;
  /** Last transform before the value reaches the array. */
  normalizeItem?: (value: unknown) => unknown;
  /**
   * Async work that must succeed before the row is committed (e.g. writing a
   * codebook variable). Return a transformed value to save it instead, or
   * `{success: false, fieldErrors}` to keep the dialog open with those errors.
   */
  onBeforeSave?: (value: unknown) => unknown;
  /** DOM id stem of the editor dialog's `<form>`. */
  requestedEditFormName?: string;
};

const isRecord = (value: unknown): value is ArrayItem =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFailedSubmission = (
  value: unknown,
): value is Extract<FormSubmissionResult, { success: false }> =>
  isRecord(value) && value.success === false;

/**
 * Derived from the stage form's own id, so two stages open in different tabs
 * cannot collide, and so the ids stay legible in the `SubmitButton form=` seam
 * that saved-state expectations name.
 */
const defaultEditFormName = (stageFormId: string, arrayName: string) =>
  `${stageFormId}-${arrayName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-item-editor`;

/**
 * `editorValidate` returns a loosely-typed error object. Only string(-list)
 * entries can be rendered as field errors; anything else has never been
 * displayable, so it is dropped rather than stringified.
 */
const toFieldErrors = (
  errors: Record<string, unknown> | undefined,
): Record<string, string | string[]> | undefined => {
  if (!errors) return undefined;

  const entries = Object.entries(errors).filter(
    (entry): entry is [string, string | string[]] =>
      typeof entry[1] === 'string' ||
      (Array.isArray(entry[1]) &&
        entry[1].every((message) => typeof message === 'string')),
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/**
 * Publishes the dialog form's own store api to `DialogEditor`, which renders
 * the dialog and therefore sits OUTSIDE the provider that form creates — but
 * needs the store's dormant entries at save time (see `mergeEditedRow`).
 */
function DialogStoreCapture({
  apiRef,
}: {
  apiRef: RefObject<StageFormStoreApi | null>;
}) {
  const storeApi = useContext(FormStoreContext);

  useEffect(() => {
    apiRef.current = storeApi ?? null;
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, storeApi]);

  return null;
}

/**
 * The values a save commits for an edited row.
 *
 * The dialog form only reports the fields it actually RENDERED, so properties
 * the editor never registers — `id` above all — are carried over from the row
 * being edited. That carry-over alone would also resurrect a value the
 * researcher explicitly cleared this session, because clearing a field in a
 * section that then collapses leaves the field unregistered, and so absent
 * from the submitted values rather than present-and-empty.
 *
 * The store's dormant entries are the record of what became of those unmounted
 * fields. An entry whose value has diverged from the value its field
 * registered with is a real edit and is applied over the committed row —
 * `undefined` meaning "cleared", which DELETES the key. An entry still equal to
 * its own `initialValue` is an untouched field that merely unmounted (a
 * section that became disabled, a branch that stopped rendering) and is
 * ignored, so a normalised `initialValue` such as `?? []` cannot invent a key
 * the row never had.
 */
const mergeEditedRow = (
  committed: ArrayItem,
  storeApi: StageFormStoreApi | null,
  submitted: Record<string, FieldValue>,
): ArrayItem => {
  const dormant = storeApi?.getState().dormantValues;
  if (!dormant || dormant.size === 0) return { ...committed, ...submitted };

  // Start with the mounted fields' submitted snapshot, then replay genuine
  // dormant edits at their exact paths. A shallow submitted object such as
  // `{ edges: { create } }` must not erase a dormant sibling written at
  // `edges.display`; the two fields cannot be both mounted and dormant at the
  // same time, so the dormant path is the authoritative value for that leaf.
  const merged = cloneDeep({ ...committed, ...submitted });
  for (const [name, field] of dormant) {
    if (isEqual(field.value, field.initialValue)) continue;
    if (field.value === undefined) {
      unset(merged, name);
    } else {
      set(merged, name, field.value);
    }
  }

  return merged;
};

/**
 * The researcher-facing account of a save that landed after its row was gone.
 * This is an authoring tool, so it says what happened and what to do next
 * rather than reporting a failure.
 */
const rowRemovedMessage = (itemLabel: string) =>
  `This ${itemLabel} was removed while your changes were being saved, so there is nothing left to save them to. Copy anything you want to keep, then cancel and add a new ${itemLabel}.`;

type DialogArrayContextValue = {
  addTitle: string;
  /**
   * Commits a row the list has already moved on from — the editor's session
   * was replaced, or the editor unmounted, while `onBeforeSave` was in flight.
   * The row is addressed by its OWN id rather than by whichever row the list
   * is editing now, so index drift (a reorder, an insertion, an undo) can
   * never land the edit on a different row. Returns `false` when that row is
   * no longer in the committed array: there is then nothing to commit to.
   */
  commitDetachedRow: (
    editedRow: ArrayItem,
    value: ArrayItem,
    isNewRow: boolean,
  ) => boolean;
  editorFieldsComponent: Renderer;
  editorDialogSize?: DialogProps['size'];
  editorPreviewComponent?: Renderer;
  editorPreviewProps?: Record<string, unknown>;
  editorProps?: Record<string, unknown>;
  editorTitle: string;
  editorValidate?: DialogArrayEditorValidate;
  editFormName: string;
  itemLabel: string;
  itemSelector?: DialogArrayItemSelector;
  normalizeItem: (value: unknown) => unknown;
  onBeforeSave?: (value: unknown) => unknown;
  previewComponent: Renderer;
  previewProps?: Record<string, unknown>;
};

// The renderers must be stable module-level components — ArrayField mounts
// them directly, so deriving them per render would remount the row (and the
// open dialog) on every keystroke. Their configuration arrives by context.
const DialogArrayContext = createContext<DialogArrayContextValue | null>(null);

const useDialogArrayContext = () => {
  const context = useContext(DialogArrayContext);
  if (!context) {
    throw new Error(
      'DialogArrayField renderers must be used inside the field.',
    );
  }
  return context;
};

function DialogItem({
  item,
  index,
  itemCount,
  isSortable,
  isBeingEdited,
  dragControls,
  onMove,
  onEdit,
  onDelete,
  disabled,
  readOnly,
  editTriggerRef,
  getAddTrigger,
}: ArrayFieldItemProps<ArrayItem>) {
  const { itemLabel, previewComponent, previewProps } = useDialogArrayContext();
  const { confirm } = useDialog();
  const rowRef = useRef<HTMLDivElement>(null);
  const interactionDisabled = disabled || readOnly;
  const itemValue = stripManagedProperties(item);

  const handleDelete = () => {
    // Resolved now, while the row is still in the document: after the confirm
    // the row is gone, and `closest()` from a detached node walks a detached
    // tree. The list element itself survives.
    const list = rowRef.current?.closest('[role="list"]') ?? null;

    void confirm({
      title: `Remove this ${itemLabel}?`,
      description: `This ${itemLabel} will be removed from the list.`,
      confirmLabel: `Remove ${itemLabel}`,
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => onDelete?.(),
      // Cancel returns focus to the Remove control, which is untouched. Confirm
      // destroys it along with the row, so name a surviving target: whichever
      // row has taken this one's place, else the list's add button — which is
      // the only control left when the row just removed was the last one.
      // Answering `null` there would leave focus on `<body>`, which Base UI
      // resolves to the first tabbable element in the document, sending the
      // researcher back to the page header from the middle of a form.
      finalFocus: () => {
        if (list?.isConnected) {
          // `itemLabel` is caller-supplied, and this runs inside Base UI's
          // layout-effect cleanup — an unescaped quote would throw a
          // SyntaxError out of an unmount.
          const remaining = list.querySelectorAll<HTMLElement>(
            `[aria-label="${CSS.escape(`Remove ${itemLabel}`)}"]`,
          );
          // The row that has taken this one's place, or the last one if this
          // was the last row.
          const neighbour = remaining[Math.min(index, remaining.length - 1)];
          if (neighbour) return neighbour;
        }
        // Nothing is left in the list, and both remembered openers point at
        // the Remove button that has just been destroyed with the row. The add
        // button is the one control that survives an emptied list, and it is
        // where the researcher is going next anyway.
        return getAddTrigger();
      },
    });
  };

  if (isBeingEdited || item._draft) return null;

  return (
    <div ref={rowRef} className="flex w-full items-center gap-3">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={interactionDisabled}
          label={`Reorder ${itemLabel} ${index + 1} of ${itemCount}`}
        />
      )}
      <div className="min-w-0 flex-1">
        {createElement(previewComponent, {
          ...previewProps,
          ...itemValue,
          sortable: isSortable,
        })}
      </div>
      <IconButton
        ref={editTriggerRef}
        icon={<Pencil />}
        aria-label={`Edit ${itemLabel}`}
        color="dynamic"
        disabled={interactionDisabled}
        onClick={onEdit}
      />
      <IconButton
        icon={<Trash2 />}
        aria-label={`Remove ${itemLabel}`}
        color="destructive"
        disabled={interactionDisabled}
        onClick={handleDelete}
      />
    </div>
  );
}

type EditorSession = {
  /** Bumped for every editing session; used as the dialog remount key. */
  id: number;
  item: ArrayItem;
  index: number | null;
  isNewItem: boolean;
  open: boolean;
};

function DialogEditor({
  item,
  index,
  isNewItem,
  onSave,
  onCancel,
  getEditorTrigger,
}: ArrayFieldEditorProps<ArrayItem>) {
  const {
    addTitle,
    commitDetachedRow,
    editFormName,
    editorFieldsComponent,
    editorDialogSize,
    editorPreviewComponent,
    editorPreviewProps,
    editorProps,
    editorTitle,
    editorValidate,
    itemLabel,
    itemSelector,
    normalizeItem,
    onBeforeSave,
  } = useDialogArrayContext();
  const { protocolContext } = useStageEditorForm();

  // `item` is undefined between edits. The last session stays mounted so the
  // dialog can animate closed, but every session gets its own `id` — and so
  // its own field store, since fresco-ui has no whole-form reinitialize and a
  // reused store would resurrect the previous session's (possibly cancelled)
  // values.
  const [session, setSession] = useState<EditorSession | null>(null);

  useEffect(() => {
    setSession((previous) => {
      if (!item) {
        return previous?.open ? { ...previous, open: false } : previous;
      }
      if (
        previous?.open &&
        previous.item === item &&
        previous.index === index
      ) {
        return previous;
      }
      return {
        id: (previous?.id ?? 0) + 1,
        item,
        index,
        isNewItem,
        open: true,
      };
    });
  }, [index, isNewItem, item]);

  const sessionItem = session?.item;
  // A new item is not in the committed array yet, so it has no index to
  // report. Derived once because `editorValidate` and the fields component
  // must agree: the editor's pickers have to scope themselves to exactly the
  // row the validate is judging.
  const editIndex =
    session && !session.isNewItem && session.index !== null
      ? session.index
      : undefined;

  const selectedItem = useMemo(() => {
    if (
      !session ||
      session.isNewItem ||
      !itemSelector ||
      editIndex === undefined
    ) {
      return null;
    }
    return itemSelector(protocolContext, {
      item: stripManagedProperties(session.item),
      index: editIndex,
    });
  }, [editIndex, itemSelector, protocolContext, session]);

  const itemValues = useMemo<ArrayItem>(() => {
    if (!session) return {};
    return isRecord(selectedItem)
      ? selectedItem
      : stripManagedProperties(session.item);
  }, [selectedItem, session]);

  const saveInFlightRef = useRef(false);
  const storeApiRef = useRef<StageFormStoreApi | null>(null);
  const mountedRef = useRef(true);
  const activeItemRef = useRef(sessionItem);
  activeItemRef.current = sessionItem;
  const isNewItemRef = useRef(false);
  isNewItemRef.current = session?.isNewItem ?? false;
  const itemValuesRef = useRef(itemValues);
  itemValuesRef.current = itemValues;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (!saveInFlightRef.current) onCancel();
  }, [onCancel]);

  const handleSave = useCallback(
    async (
      values: Record<string, FieldValue>,
    ): Promise<FormSubmissionResult> => {
      // fresco-ui disables the submit button while submitting, but a keyboard
      // submit can still re-enter; the row must only be committed once.
      if (saveInFlightRef.current) return { success: true };
      saveInFlightRef.current = true;
      const itemAtSaveStart = activeItemRef.current;
      const wasNewRow = isNewItemRef.current;

      try {
        let valueToSave: unknown = mergeEditedRow(
          itemValuesRef.current,
          storeApiRef.current,
          values,
        );
        if (onBeforeSave) {
          const transformedValue = await onBeforeSave(valueToSave);
          if (isFailedSubmission(transformedValue)) return transformedValue;
          if (transformedValue !== undefined) valueToSave = transformedValue;
        }

        const rowToCommit = normalizeItem(valueToSave) as ArrayItem;

        // The happy path: this editor is still the one editing this row, so
        // the list's own save handles the commit — including a draft's
        // promotion to a confirmed row, and closing the editor.
        if (mountedRef.current && activeItemRef.current === itemAtSaveStart) {
          onSave?.(rowToCommit);
          return { success: true };
        }

        // Otherwise the editor moved to a different session, or unmounted,
        // while the pre-save work was in flight. `onSave` commits to whichever
        // row the list is editing NOW, so it cannot be trusted here — but the
        // researcher's edit must not be thrown away either. Commit it to the
        // row it was actually made on, addressed by that row's own id.
        if (
          itemAtSaveStart &&
          commitDetachedRow(itemAtSaveStart, rowToCommit, wasNewRow)
        ) {
          // The list never ran its own save, so nothing has cleared the
          // editing state; close the editor the way a normal save would.
          onCancel();
          return { success: true };
        }

        // Nothing can be committed: the row has left the array, or it carries
        // no id and ArrayField's positional fallback has already handed its
        // editing session to a neighbour. Writing anywhere now would be a
        // write onto a different row, so the save reports what happened.
        //
        // Be clear-eyed about where that report goes. Every route here has
        // already torn down the form that submitted, so these errors are set
        // on a store that no longer renders. The truthful result is returned
        // regardless — a caller that can still show it should, and the outcome
        // is "not saved" either way. What this path must never do is report a
        // save that did not happen as a success, which is what silently closes
        // the dialog over a discarded edit.
        return {
          success: false,
          formErrors: [rowRemovedMessage(itemLabel)],
        };
      } catch (error) {
        return {
          success: false,
          formErrors: [ensureError(error).message],
        };
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [
      commitDetachedRow,
      itemLabel,
      normalizeItem,
      onBeforeSave,
      onCancel,
      onSave,
    ],
  );

  const validate = useMemo<FormLevelValidate | undefined>(() => {
    if (!editorValidate) return undefined;
    return (values, context) =>
      toFieldErrors(
        editorValidate(values, { ...context, initialValues: itemValues }),
      );
  }, [editorValidate, itemValues]);

  if (!session) return null;

  const editorPreview = editorPreviewComponent
    ? createElement(editorPreviewComponent, {
        ...itemValues,
        ...editorProps,
        ...editorPreviewProps,
        item: itemValues,
        editIndex,
      })
    : undefined;

  return (
    <ArrayItemDialog
      key={session.id}
      open={session.open}
      onClose={handleCancel}
      title={session.isNewItem ? addTitle : editorTitle}
      formId={editFormName}
      submitLabel={session.isNewItem ? 'Add' : 'Save'}
      onSubmit={handleSave}
      validate={validate}
      editIndex={editIndex}
      size={editorDialogSize}
      /**
       * A row hides its own controls while it is being edited, so the Edit
       * button that opened this dialog is not the element that will be on
       * screen when the dialog closes. `getEditorTrigger` is called at that
       * moment and answers with the freshly mounted control — or, for a new
       * item (which was never a row), with the list's add button.
       */
      finalFocus={getEditorTrigger}
      layoutId={
        !session.isNewItem && typeof session.item._internalId === 'string'
          ? session.item._internalId
          : undefined
      }
      style={{ borderRadius: 'var(--radius)' }}
      aside={editorPreview}
    >
      <DialogStoreCapture apiRef={storeApiRef} />
      {createElement(editorFieldsComponent, {
        ...itemValues,
        ...editorProps,
        item: itemValues,
        editIndex,
        form: editFormName,
      })}
    </ArrayItemDialog>
  );
}

/**
 * An array of records edited one row at a time in a dialog. Rows render a
 * caller-supplied preview; the dialog renders caller-supplied fields inside
 * its own form store, and each save, delete or reorder is committed to the
 * stage document as the operation it actually was — addressed by the row's own
 * id, never by the index this render happened to draw it at.
 */
export default function DialogArrayField<T extends ArrayItem>({
  value,
  onChange,
  name = '',
  addButtonLabel,
  emptyStateMessage = 'No items have been created yet.',
  addTitle,
  editorTitle,
  editorFieldsComponent,
  editorDialogSize,
  editorPreviewComponent,
  editorPreviewProps,
  editorProps,
  editorValidate,
  itemLabel = 'item',
  itemSelector,
  itemTemplate = () => ({}),
  normalizeItem = (itemValue) => itemValue,
  onBeforeSave,
  previewComponent,
  previewProps,
  requestedEditFormName,
  getId,
  itemClasses,
  ...arrayFieldProps
}: DialogArrayFieldProps<T>) {
  const { formId } = useStageEditorForm();

  const createItem = useCallback(() => {
    const item = itemTemplate();
    return {
      ...item,
      id: typeof item.id === 'string' && item.id.length > 0 ? item.id : uuid(),
    } as Partial<T>;
  }, [itemTemplate]);

  const resolveItemId = useMemo(
    () =>
      getId ??
      ((candidate: T) =>
        typeof candidate.id === 'string' ? candidate.id : undefined),
    [getId],
  );

  const rows = useMemo(() => value ?? [], [value]);
  const { onOperation, commitDetachedRow: commitById } =
    useArrayFieldCommands<T>(rows, onChange, resolveItemId);

  const commitDetachedRow = useCallback(
    (editedRow: ArrayItem, rowValue: ArrayItem, isNewRow: boolean) =>
      commitById(rowValue as T, resolveItemId(editedRow as T), isNewRow),
    [commitById, resolveItemId],
  );

  const context = useMemo<DialogArrayContextValue>(
    () => ({
      addTitle: addTitle ?? `Add ${itemLabel}`,
      commitDetachedRow,
      editFormName: requestedEditFormName ?? defaultEditFormName(formId, name),
      editorFieldsComponent,
      editorDialogSize,
      editorPreviewComponent,
      editorPreviewProps,
      editorProps,
      editorTitle,
      editorValidate,
      itemLabel,
      itemSelector,
      normalizeItem,
      onBeforeSave,
      previewComponent,
      previewProps,
    }),
    [
      addTitle,
      commitDetachedRow,
      editorFieldsComponent,
      editorDialogSize,
      editorPreviewComponent,
      editorPreviewProps,
      editorProps,
      editorTitle,
      editorValidate,
      formId,
      itemLabel,
      itemSelector,
      name,
      normalizeItem,
      onBeforeSave,
      previewComponent,
      previewProps,
      requestedEditFormName,
    ],
  );

  return (
    <DialogArrayContext value={context}>
      <ArrayField<T>
        {...arrayFieldProps}
        name={name}
        value={value}
        onChange={onChange}
        onOperation={onOperation}
        addButtonLabel={addButtonLabel}
        emptyStateMessage={emptyStateMessage}
        itemTemplate={createItem}
        getId={resolveItemId}
        itemClasses={itemClasses}
        // Rows run their own confirm dialog, which names the item type.
        confirmDelete={false}
        itemComponent={DialogItem as ComponentType<ArrayFieldItemProps<T>>}
        editorComponent={
          DialogEditor as ComponentType<ArrayFieldEditorProps<T>>
        }
      />
    </DialogArrayContext>
  );
}
