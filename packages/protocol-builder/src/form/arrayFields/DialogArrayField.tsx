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

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import DialogForm, {
  type DialogFormErrors,
  type DialogFormValidate,
} from '../DialogForm.tsx';
import {
  useStageEditorForm,
  type StageFormStoreApi,
} from '../stageEditorContext.ts';
import { reseatEditedRow } from './arrayFieldCommands.ts';
import {
  ArrayFieldBindingContext,
  useArrayFieldCommands,
  type ArrayFieldBinding,
} from './useArrayFieldCommands.ts';
import { useConfirmRowRemoval } from './useConfirmRowRemoval.ts';

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

/** What every list inside a row dialog is: part of one row, not a key. */
const NESTED_IN_A_ROW: ArrayFieldBinding = Object.freeze({
  documentKey: undefined,
});

/**
 * The researcher-facing account of a save that landed after its row was gone.
 * This is an authoring tool, so it says what happened and what to do next
 * rather than reporting a failure.
 */
const rowRemovedMessage = (itemLabel: string) =>
  `This ${itemLabel} was removed while your changes were being saved, so there is nothing left to save them to. Copy anything you want to keep, then cancel and add a new ${itemLabel}.`;

/**
 * Said when the stage stopped accepting writes while the editor was open. It
 * echoes the stage form's own read-only wording, because it is the same lease
 * that has gone: the researcher's next move is to take editing back, and the
 * draft stays on screen meanwhile.
 */
const readOnlyMessage = (itemLabel: string) =>
  `This stage is read-only, so this ${itemLabel} was not saved. Take over editing and try again.`;

/**
 * Said when the LIST stopped accepting changes while the editor was open —
 * a section whose prerequisite is no longer chosen, a list disabled by
 * something else on the stage. `ArrayField` withdraws its own save handler
 * then, so calling it commits nothing at all, and the stage's own lease is
 * untouched: the researcher's next move is to restore whatever the list
 * depends on, not to take editing back.
 */
const listDisabledMessage = (itemLabel: string) =>
  `This list is not accepting changes at the moment, so this ${itemLabel} was not saved. Copy anything you want to keep, then try again once the list can be edited.`;

/**
 * Said when `onBeforeSave` refuses without saying why. A refusal that reports
 * nothing would otherwise read as a success and close the dialog over work
 * that was never committed.
 */
const saveRefusedMessage = (itemLabel: string) =>
  `This ${itemLabel} could not be saved. Check your changes and try again.`;

/**
 * A pre-save refusal, in the shape the dialog renders: form-level messages
 * above the fields, field-level ones attached to the control they name.
 */
const refusalFrom = (
  failure: Extract<FormSubmissionResult, { success: false }>,
  itemLabel: string,
): DialogFormErrors => {
  const formErrors = failure.formErrors ?? [];
  // The flattened shape a failed submission is written in leaves every key
  // optional, and a key holding nothing has no message to attach to a control.
  const fieldErrors = Object.fromEntries(
    Object.entries(failure.fieldErrors ?? {}).filter(
      (entry): entry is [string, string[]] => entry[1] !== undefined,
    ),
  );
  if (formErrors.length === 0 && Object.keys(fieldErrors).length === 0) {
    return { formErrors: [saveRefusedMessage(itemLabel)] };
  }
  return { formErrors, fieldErrors };
};

type DialogArrayContextValue = {
  addTitle: string;
  /**
   * Commits a row the list has already moved on from — the editor's session
   * was replaced, or the editor unmounted, while `onBeforeSave` was in flight.
   * The row is addressed by its OWN id rather than by whichever row the list
   * is editing now, so index drift (a reorder, an insertion, an undo) can
   * never land the edit on a different row. Returns `false` when that row is
   * no longer in the committed array: there is then nothing to commit to.
   *
   * `base` is the row the edit was computed from, so an arrival that reached
   * another property of the same row while the save was in flight is kept
   * rather than written back out — see `reseatEditedRow`.
   */
  commitDetachedRow: (
    editedRow: ArrayItem,
    value: ArrayItem,
    isNewRow: boolean,
    base: ArrayItem,
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
  const confirmRemoval = useConfirmRowRemoval(item, itemLabel, onDelete);
  const rowRef = useRef<HTMLDivElement>(null);
  const interactionDisabled = disabled || readOnly;
  const itemValue = stripManagedProperties(item);

  const handleDelete = () => {
    // Resolved now, while the row is still in the document: after the confirm
    // the row is gone, and `closest()` from a detached node walks a detached
    // tree. The list element itself survives.
    const list = rowRef.current?.closest('[role="list"]') ?? null;

    confirmRemoval({
      title: `Remove this ${itemLabel}?`,
      description: `This ${itemLabel} will be removed from the list.`,
      confirmLabel: `Remove ${itemLabel}`,
      cancelLabel: 'Cancel',
      intent: 'destructive',
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

  // A row hides its own controls while its editor is open: the dialog IS this
  // row for as long as it is on screen, and the Edit button that opened it has
  // to be gone by the time focus is handed back. (A row still being ADDED
  // never reaches here — `ArrayField` keeps drafts out of the list whenever an
  // editor component is rendering them instead.)
  if (isBeingEdited) return null;

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
  /**
   * `ArrayField`'s own identity for the row this session is editing. It is
   * what makes a session survive the list moving beneath it: the list rebuilds
   * every row object whenever its value changes — an undo, a rollback after a
   * lost lease, a collaborator's insertion — and starting a new session for
   * each of those would throw away the draft in the dialog.
   */
  rowId: string | undefined;
  item: ArrayItem;
  index: number | null;
  isNewItem: boolean;
  open: boolean;
};

const rowIdentityOf = (item: ArrayItem | undefined): string | undefined =>
  typeof item?._internalId === 'string' ? item._internalId : undefined;

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
  const { protocolContext, readOnly } = useStageEditorForm();

  // `item` is undefined between edits. The last session stays mounted so the
  // dialog can animate closed, but every session gets its own `id` — and so
  // its own field store, since fresco-ui has no whole-form reinitialize and a
  // reused store would resurrect the previous session's (possibly cancelled)
  // values.
  const [session, setSession] = useState<EditorSession | null>(null);

  const activeSaveRef = useRef<Promise<void | DialogFormErrors> | null>(null);
  const rowId = rowIdentityOf(item);

  useEffect(() => {
    setSession((previous) => {
      if (!item) {
        // A save in flight owns the dialog. The list clears its editing state
        // the moment the row it was editing leaves the array, and closing here
        // would take the editor down over an answer the researcher has not
        // read — the row-removed refusal that save is about to report, and the
        // draft it is asking them to rescue.
        if (activeSaveRef.current !== null) return previous;
        return previous?.open ? { ...previous, open: false } : previous;
      }
      if (
        previous?.open &&
        previous.rowId !== undefined &&
        previous.rowId === rowId &&
        previous.isNewItem === isNewItem
      ) {
        // The same row, in a new object: the list rebuilt its rows because its
        // value moved. The draft on screen belongs to this session and stays;
        // only the committed values a save will be merged over are refreshed,
        // so an authoritative change to a key the editor does not render is
        // not written back out of existence.
        return previous.item === item && previous.index === index
          ? previous
          : { ...previous, item, index };
      }
      return {
        id: (previous?.id ?? 0) + 1,
        rowId,
        item,
        index,
        isNewItem,
        open: true,
      };
    });
  }, [index, isNewItem, item, rowId]);
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

  const storeApiRef = useRef<StageFormStoreApi | null>(null);
  const mountedRef = useRef(true);
  /**
   * The row the LIST is editing right now, which is not the same question as
   * which row this session opened on: the list drops its editing state as soon
   * as that row leaves the array, and rebuilds the object whenever its value
   * moves. Either answers "the commit route below is no longer this row's".
   */
  const activeItemRef = useRef(item);
  activeItemRef.current = item;
  const isNewItemRef = useRef(false);
  isNewItemRef.current = session?.isNewItem ?? false;
  const itemValuesRef = useRef(itemValues);
  itemValuesRef.current = itemValues;
  /**
   * Read as a getter rather than closed over, because access can be revoked
   * while the editor sits open — and again while a save is in flight.
   */
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  /**
   * The list's own save handler, which `ArrayField` WITHDRAWS while the list
   * is not accepting changes. Read as a getter for the same reason as the
   * lease: a list can stop accepting changes while the editor sits open, and
   * again while a save is in flight.
   */
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const performSave = useCallback(
    async (
      values: Record<string, FieldValue>,
    ): Promise<void | DialogFormErrors> => {
      const itemAtSaveStart = activeItemRef.current;
      const rowIdAtSaveStart = rowIdentityOf(itemAtSaveStart);
      const wasNewRow = isNewItemRef.current;
      /** The row's values as they stood when this save was composed. */
      const baseValues = itemValuesRef.current;

      /**
       * A stage or a list that has stopped accepting writes must not take a
       * save and look like it worked. Every commit route below is silent about
       * it: `ArrayField` withholds its own save handler entirely while the
       * list is disabled or read-only, and the structural commit answers that
       * it wrote when the form declined to issue the commands. Both leave the
       * dialog closing over an edit that reached nothing.
       *
       * The two are asked separately because they ask the researcher for
       * different things: a lease is taken back, a disabled list is waited on.
       */
      const refusal = (): DialogFormErrors | undefined => {
        if (readOnlyRef.current) {
          return { formErrors: [readOnlyMessage(itemLabel)] };
        }
        if (onSaveRef.current === undefined) {
          return { formErrors: [listDisabledMessage(itemLabel)] };
        }
        return undefined;
      };

      const refusedBefore = refusal();
      if (refusedBefore) return refusedBefore;

      let valueToSave: unknown = mergeEditedRow(
        baseValues,
        storeApiRef.current,
        values,
      );
      if (onBeforeSave) {
        const transformedValue = await onBeforeSave(valueToSave);
        if (isFailedSubmission(transformedValue)) {
          return refusalFrom(transformedValue, itemLabel);
        }
        if (transformedValue !== undefined) valueToSave = transformedValue;
      }

      // Asked again on the far side of the pre-save work: both answers above
      // are stale by the time it resolves.
      const refusedAfter = refusal();
      if (refusedAfter) return refusedAfter;

      /**
       * The row as it stands now — but only while this session is still
       * showing the same row. Once the editor has moved to a different row,
       * `itemValuesRef` describes THAT one, and re-seating this edit on it
       * would write one row's values onto another. Falling back to the values
       * the save was composed from makes the re-seat a no-op, which is exactly
       * what "nothing is known to have arrived" should mean.
       */
      const latestValues =
        rowIdAtSaveStart !== undefined &&
        rowIdentityOf(activeItemRef.current) === rowIdAtSaveStart
          ? itemValuesRef.current
          : baseValues;
      const rowToCommit = normalizeItem(
        reseatEditedRow(baseValues, valueToSave, latestValues),
      ) as ArrayItem;

      // The happy path: this editor is still the one editing this row, so
      // the list's own save handles the commit — including a draft's
      // promotion to a confirmed row. The dialog closes itself once this
      // resolves with nothing to report.
      if (mountedRef.current && activeItemRef.current === itemAtSaveStart) {
        onSaveRef.current?.(rowToCommit);
        return undefined;
      }

      // Otherwise the editor moved to a different session, or unmounted,
      // while the pre-save work was in flight. `onSave` commits to whichever
      // row the list is editing NOW, so it cannot be trusted here — but the
      // researcher's edit must not be thrown away either. Commit it to the
      // row it was actually made on, addressed by that row's own id.
      if (
        itemAtSaveStart &&
        commitDetachedRow(itemAtSaveStart, rowToCommit, wasNewRow, latestValues)
      ) {
        return undefined;
      }

      // Nothing can be committed: the row has left the array, or it carries
      // no id and ArrayField's positional fallback has already handed its
      // editing session to a neighbour. Writing anywhere now would be a
      // write onto a different row, so the save reports what happened.
      //
      // What this path must never do is report a save that did not happen as
      // a success, which is what silently closes the dialog over a discarded
      // edit — so the refusal is returned, and the dialog keeps the draft on
      // screen with the reason above it.
      return { formErrors: [rowRemovedMessage(itemLabel)] };
    },
    [commitDetachedRow, itemLabel, normalizeItem, onBeforeSave],
  );

  const handleSave = useCallback(
    (values: Record<string, FieldValue>): Promise<void | DialogFormErrors> => {
      // The row must be committed once however many submits arrive. Fresco
      // already collapses two that race through the form element — the second
      // supersedes the first's validation and the first abandons — but a host
      // that submits the store directly bypasses that entirely, and this is
      // the only thing standing between it and two commits. The save already
      // running answers for both, so the second reports what the first did.
      const inFlight = activeSaveRef.current;
      if (inFlight !== null) return inFlight;

      const save = performSave(values);
      activeSaveRef.current = save;
      return save.finally(() => {
        activeSaveRef.current = null;
      });
    },
    [performSave],
  );

  /**
   * The one route that closes this editor, so a save in flight cannot be
   * closed out from under by the list dropping its editing state.
   *
   * `DialogForm` calls it on a dismissal the researcher has nothing to lose by
   * — or has confirmed — and again once a save has SUCCEEDED, which is the
   * only outcome that should close a dialog a save is running in. A refused
   * save never reaches it, so the draft and the reason stay on screen.
   */
  const handleClose = useCallback(() => {
    setSession((previous) =>
      previous?.open ? { ...previous, open: false } : previous,
    );
    onCancel();
  }, [onCancel]);

  const validate = useMemo<DialogFormValidate | undefined>(() => {
    if (!editorValidate) return undefined;
    return (values) => {
      const fieldErrors = toFieldErrors(
        editorValidate(values, {
          ...(editIndex === undefined ? {} : { editIndex }),
          initialValues: itemValues,
        }),
      );
      return fieldErrors === undefined ? undefined : { fieldErrors };
    };
  }, [editIndex, editorValidate, itemValues]);

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
    <DialogForm
      key={session.id}
      open={session.open}
      onClose={handleClose}
      title={session.isNewItem ? addTitle : editorTitle}
      formId={editFormName}
      /**
       * What the row holds now, for any field inside the editor that reads its
       * starting value from the dialog rather than stating one itself. A
       * field's own `initialValue` still wins.
       */
      initialValues={itemValues as Record<string, FieldValue>}
      submitLabel={session.isNewItem ? 'Add' : 'Save'}
      onSubmit={handleSave}
      validate={validate}
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
      {/*
        Nothing inside a row is a document key.

        A list the researcher edits INSIDE this dialog — a prompt's sort
        rules — is part of one row of THIS list, and this list is what holds
        the document key. Left inherited, that key is what the inner list
        would commit its own insertions and reorderings against: adding a sort
        rule would insert a row into the array of prompts. It also must not
        commit anything at all until the dialog saves, which is the same rule
        `ProtocolArrayField` states for a list that finds itself in a nested
        form store.
      */}
      <ArrayFieldBindingContext value={NESTED_IN_A_ROW}>
        {createElement(editorFieldsComponent, {
          ...itemValues,
          ...editorProps,
          item: itemValues,
          editIndex,
          form: editFormName,
        })}
      </ArrayFieldBindingContext>
    </DialogForm>
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
    (
      editedRow: ArrayItem,
      rowValue: ArrayItem,
      isNewRow: boolean,
      base: ArrayItem,
    ) =>
      commitById(rowValue as T, resolveItemId(editedRow as T), isNewRow, base),
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
