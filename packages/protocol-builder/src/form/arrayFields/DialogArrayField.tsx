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
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import ArrayField, {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldState,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import {
  getValue,
  type ObjectPath,
} from '@codaco/fresco-ui/form/utils/objectPath';

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
  type ArrayWriteOutcome,
  type ArrayWriteRefusal,
} from './useArrayFieldCommands.ts';
import {
  rowRemovalControlProps,
  useConfirmRowRemoval,
} from './useConfirmRowRemoval.ts';

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
 * the dialog OPENED on, which is what its fields registered against. What the
 * row holds NOW belongs to the re-seat that follows this, not here: judged
 * against a newer row, an untouched field reads as a deliberate edit and is
 * written back over whatever reached the row meanwhile. That carry-over alone
 * would also resurrect a value the
 * researcher explicitly cleared this session, because clearing a field in a
 * section that then collapses leaves the field unregistered, and so absent
 * from the submitted values rather than present-and-empty.
 *
 * The store's dormant entries are the record of what became of those unmounted
 * fields. An entry whose value has diverged from the value its field
 * registered with is a real edit and is applied over the opened-on row —
 * `undefined` meaning "cleared", which DELETES the key. An entry still equal to
 * its own `initialValue` is an untouched field that merely unmounted (a
 * section that became disabled, a branch that stopped rendering) and is
 * ignored, so a normalised `initialValue` such as `?? []` cannot invent a key
 * the row never had.
 */
const mergeEditedRow = (
  openedOn: ArrayItem,
  storeApi: StageFormStoreApi | null,
  submitted: Record<string, FieldValue>,
): ArrayItem => {
  const state = storeApi?.getState();
  if (state === undefined) return { ...openedOn, ...submitted };

  // Every field is replayed at the exact path it registered under, mounted
  // ones from the submitted snapshot and dormant ones from what the store
  // parked. Spreading the submitted object over the row instead would replace
  // a nested key WHOLE: an editor that renders `edges.create` submits
  // `{ edges: { create } }`, which erases an `edges.display` no control in
  // this dialog ever rendered. Shallowest first, so a leaf inside a container
  // field wins over the container — the order `getFormValues` itself replays
  // in, for the same reason.
  const merged = cloneDeep(openedOn);
  for (const { path } of fieldPaths(state.fields)) {
    set(merged, path, getValue(submitted, path));
  }
  for (const { path, field } of fieldPaths(state.dormantValues)) {
    if (isEqual(field.value, field.initialValue)) continue;
    if (field.value === undefined) {
      unset(merged, path);
    } else {
      set(merged, path, field.value);
    }
  }

  return merged;
};

/** A form store's fields, addressed structurally, shallowest path first. */
const fieldPaths = (
  fields: ReadonlyMap<string, FieldState>,
): { path: ObjectPath; field: FieldState }[] =>
  [...fields]
    .flatMap(([name, field]) => {
      // A stored path is authoritative; a name without one is a plain field
      // whose own name is its path.
      const path = field.path ?? safeFieldPath(name);
      return path === null || path.length === 0 ? [] : [{ path, field }];
    })
    .toSorted((left, right) => left.path.length - right.path.length);

/** A name that resolves to no path addresses nothing in the row. */
const safeFieldPath = (name: string): ObjectPath | null => {
  try {
    return resolveFieldPath([], name);
  } catch {
    return null;
  }
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
 * Said when the commit resolved to no row at all.
 *
 * The row has not necessarily gone: a row carrying no id of its own is found
 * by its content, and only while exactly one row matches — two rows the
 * researcher cannot tell apart are two rows this save describes identically,
 * and writing to either would be a guess that lands the edit on a row they
 * never opened. So the list is what has to be looked at, not the row.
 */
const rowUnresolvedMessage = (itemLabel: string) =>
  `This list changed while you were editing, so this ${itemLabel} could not be matched to a row in it and nothing was saved. Copy anything you want to keep, then check the list and make the change again.`;

/**
 * What a refused list write is called on screen.
 *
 * Exhaustive over the reasons the write path can give, in one place, so a
 * reason added there has to be answered here rather than reaching the
 * researcher as silence — or as the wrong thing to do about it.
 */
const WRITE_REFUSAL_MESSAGES: Readonly<
  Record<ArrayWriteRefusal, (itemLabel: string) => string>
> = Object.freeze({
  'session-refused': readOnlyMessage,
  'row-removed': rowRemovedMessage,
  'row-unresolved': rowUnresolvedMessage,
});

const writeRefusalMessage = (reason: ArrayWriteRefusal, itemLabel: string) =>
  WRITE_REFUSAL_MESSAGES[reason](itemLabel);

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
   * never land the edit on a different row. Answers with a refusal and its
   * reason when that row is no longer in the committed array: there is then
   * nothing to commit to.
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
  ) => ArrayWriteOutcome;
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
  /**
   * Runs the commit the editor issues through the list's own save handler —
   * which answers nothing — and says what it wrote. The only thing that can
   * tell a commit from a no-op on that route.
   */
  writeThrough: (dispatch: () => void) => ArrayWriteOutcome;
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
  const { rowRef, confirmRemoval } = useConfirmRowRemoval({
    item,
    itemLabel,
    index,
    onDelete,
    getAddTrigger,
  });
  const interactionDisabled = disabled || readOnly;
  const itemValue = stripManagedProperties(item);

  const handleDelete = () => {
    confirmRemoval({
      title: `Remove this ${itemLabel}?`,
      description: `This ${itemLabel} will be removed from the list.`,
      confirmLabel: `Remove ${itemLabel}`,
      cancelLabel: 'Cancel',
      intent: 'destructive',
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
        {...rowRemovalControlProps}
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
    writeThrough,
  } = useDialogArrayContext();
  const { protocolContext, readOnly } = useStageEditorForm();

  // `item` is undefined between edits. The last session stays mounted so the
  // dialog can animate closed, but every session gets its own `id` — and so
  // its own field store, since fresco-ui has no whole-form reinitialize and a
  // reused store would resurrect the previous session's (possibly cancelled)
  // values.
  const [session, setSession] = useState<EditorSession | null>(null);

  const activeSaveRef = useRef<Promise<void | DialogFormErrors> | null>(null);
  /**
   * A refusal this editor is SHOWING, which owns the dialog exactly as a save
   * still running does.
   *
   * Every refusal leaves the list without an editing session — a refused
   * commit still cleared it, and a removed row never had one — so the answer
   * being on screen rather than still being computed is no reason to close
   * over it. It is the same answer, and the draft it asks the researcher to
   * rescue is the same draft.
   */
  const refusedSaveRef = useRef(false);
  const rowId = rowIdentityOf(item);
  /**
   * The dialog's own dismissal route, so that a session ending OUTSIDE the
   * dialog leaves by the same door the Cancel button does — see the effect
   * below.
   */
  const requestCloseRef = useRef<(() => void) | null>(null);
  /**
   * Whether this session has already been asked to close. The question is
   * asked once per session: `requestClose` opens a confirmation the researcher
   * may answer with "Keep editing", and asking again on the next render would
   * stack a second copy of it over the first.
   */
  const closeRequestedRef = useRef(false);
  const sessionRef = useRef<EditorSession | null>(session);
  sessionRef.current = session;

  useEffect(() => {
    if (item) {
      closeRequestedRef.current = false;
      setSession((previous) => {
        if (
          previous?.open &&
          previous.rowId !== undefined &&
          previous.rowId === rowId &&
          previous.isNewItem === isNewItem
        ) {
          // The same row, in a new object: the list rebuilt its rows because
          // its value moved. The draft on screen belongs to this session and
          // stays; only the committed values a save will be merged over are
          // refreshed, so an authoritative change to a key the editor does not
          // render is not written back out of existence.
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
      return;
    }

    // The list has stopped editing a row: it left the array — removed by a
    // collaborator, rolled back with a lease — or a commit cleared the
    // editing state.
    //
    // A save owns the dialog through all of that. Closing here would take the
    // editor down over an answer the researcher has not read: the refusal that
    // save reported or is about to, and the draft it is asking them to rescue.
    if (activeSaveRef.current !== null || refusedSaveRef.current) return;
    if (!sessionRef.current?.open || closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    // Everything else goes out through the dialog's own dismissal, which is
    // the only route that asks before unsaved work is discarded. Setting
    // `open` to false from here instead is a silent close, and a row vanishing
    // from under an editor is precisely when the researcher has something on
    // screen they have not saved anywhere else. The draft stays until they say
    // otherwise; a save made afterwards reports that the row has gone.
    requestCloseRef.current?.();
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
   * The row's values as this editing session OPENED on them, which is what
   * every field in the dialog registered its `initialValue` from and therefore
   * the only thing a submitted value can be judged against.
   *
   * Not the row as it stands now. The list refreshes `itemValues` whenever the
   * row's committed values move — which is right, so a save is re-seated on
   * what arrived — but the dialog's own store deliberately keeps the draft the
   * researcher is looking at. Judged against the newer row, every untouched
   * field the arrival touched reads as a deliberate edit and is written
   * straight back over it. The store cannot answer this on its own either: a
   * field re-registers when its `initialValue` changes, so the arrival marks
   * untouched fields dirty, and "left alone" and "typed back to what it was"
   * are the same state by then. Both resolve toward keeping the arrival, which
   * is the direction that loses nobody's work: the researcher's draft is still
   * on screen.
   */
  const sessionBaseRef = useRef<ArrayItem>(itemValues);
  const sessionBaseIdRef = useRef<number | null>(null);
  if (session !== null && sessionBaseIdRef.current !== session.id) {
    sessionBaseIdRef.current = session.id;
    sessionBaseRef.current = itemValues;
    // A different row is being edited, so nothing the previous one was told
    // is still on screen to be kept open for.
    refusedSaveRef.current = false;
  }
  /**
   * The row the LIST is editing right now, which is not the same question as
   * which row this session opened on: the list drops its editing state as soon
   * as that row leaves the array, and rebuilds the object whenever its value
   * moves. Either answers "the commit route below is no longer this row's".
   */
  const activeItemRef = useRef(item);
  activeItemRef.current = item;
  /**
   * The row THIS SESSION is editing, which outlives the list's editing state.
   *
   * A refused commit clears that state — `ArrayField` has already handed the
   * row over by the time the session declines the write — while this dialog
   * stays open over the draft it refused. The retry the researcher then makes
   * has a row to commit to; the list simply is not the one that can name it.
   */
  const sessionItemRef = useRef<ArrayItem | undefined>(undefined);
  sessionItemRef.current = session?.item;
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
      /** The row the LIST is editing, which a refused commit has cleared. */
      const listItemAtSaveStart = activeItemRef.current;
      /**
       * The row this save is FOR. Two absent rows are not the same row: when
       * the list has stopped editing, the session is what still knows which
       * row the draft on screen belongs to.
       */
      const itemAtSaveStart = listItemAtSaveStart ?? sessionItemRef.current;
      const rowIdAtSaveStart = rowIdentityOf(itemAtSaveStart);
      const wasNewRow = isNewItemRef.current;
      /** The row's values the draft in this dialog was composed against. */
      const baseValues = sessionBaseRef.current;

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
        rowIdentityOf(activeItemRef.current ?? sessionItemRef.current) ===
          rowIdAtSaveStart
          ? itemValuesRef.current
          : baseValues;
      const rowToCommit = normalizeItem(
        reseatEditedRow(baseValues, valueToSave, latestValues),
      ) as ArrayItem;

      // The happy path: this editor is still the one editing this row, so
      // the list's own save handles the commit — including a draft's
      // promotion to a confirmed row. The dialog closes itself once this
      // resolves with nothing to report.
      //
      // "Still editing" has to mean a row: `ArrayField`'s save commits to
      // whichever row it is editing NOW and answers nothing, so calling it
      // when it is editing none is a commit that never happens reported as
      // one that did — which closes the dialog over the researcher's draft.
      if (
        mountedRef.current &&
        listItemAtSaveStart !== undefined &&
        activeItemRef.current === listItemAtSaveStart
      ) {
        // `ArrayField`'s save handler answers nothing, so what it did is read
        // from the write it caused rather than from its silence. Two different
        // things can go wrong inside it and neither is visible from here: the
        // session can refuse the write it dispatches (a lease taken back after
        // the checks above read what this render built), and the commands it
        // dispatches can resolve against the array the session holds to no row
        // at all — a row removed, or one that cannot be told apart from the
        // list as it now stands. Returning nothing for either would report it
        // as a save and close the dialog over the draft, leaving the reason on
        // a form the researcher can no longer see the editor in front of.
        const outcome = writeThrough(() => {
          onSaveRef.current?.(rowToCommit);
        });
        return outcome.kind === 'written'
          ? undefined
          : { formErrors: [writeRefusalMessage(outcome.reason, itemLabel)] };
      }

      // Otherwise the list is editing no row, a different one, or this editor
      // has unmounted: a save that was refused as it dispatched and is being
      // retried, a row that left the array, a session replaced while the
      // pre-save work was in flight. `onSave` commits to whichever row the
      // list is editing NOW, so it cannot be trusted here — but the
      // researcher's edit must not be thrown away either. Commit it to the
      // row it was actually made on, addressed by that row's own id.
      // What this path must never do is report a save that did not happen as
      // a success, which is what silently closes the dialog over a discarded
      // edit — so a commit that wrote nothing hands back its own reason, and
      // the dialog keeps the draft on screen with that reason above it. The
      // reasons ask the researcher for different things: a refused write asks
      // them to take editing back, a vanished row says there is nothing left
      // to save to.
      if (itemAtSaveStart) {
        const outcome = commitDetachedRow(
          itemAtSaveStart,
          rowToCommit,
          wasNewRow,
          latestValues,
        );
        return outcome.kind === 'written'
          ? undefined
          : { formErrors: [writeRefusalMessage(outcome.reason, itemLabel)] };
      }

      // Neither the list nor this session can name a row, so there is nothing
      // for the edit to be committed to at all.
      return { formErrors: [rowRemovedMessage(itemLabel)] };
    },
    [commitDetachedRow, itemLabel, normalizeItem, onBeforeSave, writeThrough],
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

      // Held open from BEFORE the work starts, because `performSave` runs
      // synchronously as far as its first await and the commit it makes there
      // is what clears the list's editing state — so nothing raised after it
      // hands back a promise is raised in time. Only a save that answers with
      // nothing lets go of the editor.
      refusedSaveRef.current = true;
      const save = performSave(values).then((result) => {
        // `performSave` answers with nothing when the row was committed, and
        // with the reason it was not otherwise — which is the reason now on
        // screen, and what keeps this editor open over it.
        refusedSaveRef.current = result !== undefined;
        return result;
      });
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
    // Whatever the last save had to say, the researcher has answered it by
    // closing the editor.
    refusedSaveRef.current = false;
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
          // The row this session OPENED on, for the same reason a save is
          // composed against it. An unchanged-pick escape asks whether the
          // researcher chose this value, and only what was on screen when they
          // submitted can answer that. Judged against the row as it stands
          // now, a value that arrived from elsewhere while the dialog was open
          // reads as their choice — and the pick they actually made, and never
          // touched, stops reading as one and is refused.
          initialValues: sessionBaseRef.current,
        }),
      );
      return fieldErrors === undefined ? undefined : { fieldErrors };
    };
  }, [editIndex, editorValidate]);

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
      requestCloseRef={requestCloseRef}
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
  const {
    onOperation,
    commitDetachedRow: commitById,
    writeThrough,
  } = useArrayFieldCommands<T>(rows, onChange, resolveItemId);

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
      writeThrough,
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
      writeThrough,
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
