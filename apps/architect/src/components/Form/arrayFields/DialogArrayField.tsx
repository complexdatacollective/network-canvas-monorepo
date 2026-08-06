/**
 * COMPOSITION: this is a *field component*, rendered as
 * `<ArchitectArrayField name="prompts" component={DialogArrayField} … />`.
 * It receives the whole array as one `value`/`onChange` pair and never
 * registers per-index leaves, which is the governing rule for every array in
 * the stage form: a deleted row's dormant value must not be able to resurrect
 * itself in `getFormValues()`. Making it a field component rather than a
 * self-contained `name`-taking section keeps ONE owner of the field name, the
 * validation adapter and the Issues anchor (`ArchitectArrayField`).
 */
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
import { shallowEqual, useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import ArrayField, {
  ArrayFieldDragHandle,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import DialogForm from '~/components/DialogForm/DialogForm';
import type { FormLevelValidate } from '~/components/DialogForm/formLevelValidate';
import { STAGE_FORM_ID } from '~/components/StageEditor/StageForm';
import type { StageFormStoreApi } from '~/components/StageEditor/stageFormContext';
import type { RootState } from '~/ducks/modules/root';
import { ensureError } from '~/utils/ensureError';

type ArrayItem = Record<string, unknown>;
type Renderer = ComponentType<Record<string, unknown>>;

/**
 * Reads the codebook (or any other Redux state) for the row being edited, so
 * the editor can open on a richer object than the array itself holds — e.g.
 * NetworkComposer merging the codebook variable's `options`/`validation` over
 * the stored field. Keyed on the edited item rather than on a form path: the
 * array is one opaque value now, so there is no per-row path to select.
 */
export type DialogArrayItemSelector = (
  state: RootState,
  context: { item: ArrayItem; index: number },
) => unknown;

/**
 * `editorValidate` keeps its legacy shape: the second argument carries
 * the edited row's committed array index so a sibling-duplicate check can
 * exclude that row. A new item is not in the committed array and reports none.
 */
export type DialogArrayEditorValidate = (
  values: Record<string, unknown>,
  context?: {
    editIndex?: number;
    /**
     * The row's PRE-EDIT committed values. `makeFieldEditorValidate` reads
     * them for its unchanged-pick escape.
     */
    initialValues?: unknown;
  },
) => Record<string, unknown> | undefined;

export type DialogArrayFieldProps<T extends ArrayItem> = Omit<
  ArrayFieldProps<T>,
  | 'confirmDelete'
  | 'editorComponent'
  | 'immediateAdd'
  | 'itemComponent'
  | 'itemTemplate'
  | 'onOperation'
> & {
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
  /** DOM id of the editor dialog's `<form>` (`SubmitButton form={…}`). */
  requestedEditFormName?: string;
};

const stripManagedProperties = (
  item: Partial<ArrayItem> | undefined,
): ArrayItem => {
  if (!item) return {};
  const { _internalId, _draft, ...value } = item;
  return value;
};

const isRecord = (value: unknown): value is ArrayItem =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFailedSubmission = (
  value: unknown,
): value is Extract<FormSubmissionResult, { success: false }> =>
  isRecord(value) && value.success === false;

/**
 * Preserves the legacy derivation exactly (`edit-stage-form-fields-item-editor`
 * and friends) — these ids are the `SubmitButton form=` seam and appear in
 * saved-state expectations.
 */
const defaultEditFormName = (arrayName: string) =>
  `${STAGE_FORM_ID}-${arrayName.replaceAll(/[^a-zA-Z0-9]+/g, '-')}-item-editor`;

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
 * `DialogForm` and therefore sits OUTSIDE the provider that form creates —
 * but needs the store's dormant entries at save time (see `mergeEditedRow`).
 */
const DialogStoreCapture = ({
  apiRef,
}: {
  apiRef: RefObject<StageFormStoreApi | null>;
}) => {
  const storeApi = useContext(FormStoreContext);

  useEffect(() => {
    apiRef.current = storeApi ?? null;
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, storeApi]);

  return null;
};

/**
 * The values a save commits for an edited row.
 *
 * The dialog form only reports the fields it actually RENDERED, so properties
 * the editor never registers — `id` above all — are carried over from the row
 * being edited. That carry-over alone would also resurrect a value
 * the researcher explicitly cleared this session, because clearing a field in
 * a section that then collapses leaves the field unregistered, and so absent
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

  const merged = cloneDeep(committed);
  for (const [name, field] of dormant) {
    if (isEqual(field.value, field.initialValue)) continue;
    if (field.value === undefined) {
      unset(merged, name);
    } else {
      set(merged, name, field.value);
    }
  }

  return { ...merged, ...submitted };
};

type DialogArrayContextValue = {
  addTitle: string;
  editorFieldsComponent: Renderer;
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

const DialogItem = ({
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
}: ArrayFieldItemProps<ArrayItem>) => {
  const { itemLabel, previewComponent, previewProps } = useDialogArrayContext();
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
  const itemValue = stripManagedProperties(item);

  const handleDelete = () => {
    void confirm({
      title: `Remove this ${itemLabel}?`,
      description: `This ${itemLabel} will be removed from the list.`,
      confirmLabel: `Remove ${itemLabel}`,
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => onDelete(),
    });
  };

  if (isBeingEdited || item._draft) return null;

  return (
    <div className="flex w-full items-center gap-3">
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
};

type EditorSession = {
  /** Bumped for every editing session; used as the DialogForm remount key. */
  id: number;
  item: ArrayItem;
  index: number | null;
  isNewItem: boolean;
  open: boolean;
};

const DialogEditor = ({
  item,
  index,
  isNewItem,
  onSave,
  onCancel,
}: ArrayFieldEditorProps<ArrayItem>) => {
  const {
    addTitle,
    editFormName,
    editorFieldsComponent,
    editorProps,
    editorTitle,
    editorValidate,
    itemSelector,
    normalizeItem,
    onBeforeSave,
  } = useDialogArrayContext();

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

  const selectedItem = useSelector((state: RootState) => {
    if (
      !session ||
      session.isNewItem ||
      !itemSelector ||
      editIndex === undefined
    )
      return null;
    return itemSelector(state, {
      item: stripManagedProperties(session.item),
      index: editIndex,
    });
  }, shallowEqual);

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

        // The dialog may have been torn down (or moved to another row) while
        // the pre-save work was in flight; committing then would write the
        // edit onto whatever is there now.
        if (!mountedRef.current || activeItemRef.current !== itemAtSaveStart) {
          return { success: true };
        }

        onSave(normalizeItem(valueToSave) as ArrayItem);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          formErrors: [ensureError(error).message],
        };
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [normalizeItem, onBeforeSave, onSave],
  );

  const validate = useMemo<FormLevelValidate | undefined>(() => {
    if (!editorValidate) return undefined;
    return (values, context) =>
      toFieldErrors(
        editorValidate(values, { ...context, initialValues: itemValues }),
      );
  }, [editorValidate, itemValues]);

  if (!session) return null;

  return (
    <DialogForm
      key={session.id}
      open={session.open}
      onClose={handleCancel}
      title={session.isNewItem ? addTitle : editorTitle}
      formId={editFormName}
      submitLabel={session.isNewItem ? 'Add' : 'Save'}
      onSubmit={handleSave}
      validate={validate}
      editIndex={editIndex}
      layoutId={
        !session.isNewItem && typeof session.item._internalId === 'string'
          ? session.item._internalId
          : undefined
      }
      style={{ borderRadius: 'var(--radius)' }}
    >
      <DialogStoreCapture apiRef={storeApiRef} />
      {createElement(editorFieldsComponent, {
        ...itemValues,
        ...editorProps,
        item: itemValues,
        editIndex,
        form: editFormName,
      })}
    </DialogForm>
  );
};

/**
 * An array of records edited one row at a time in a dialog. Rows render a
 * caller-supplied preview; the dialog renders caller-supplied fields inside
 * its own form store, and commits the whole array on save, delete or reorder.
 */
function DialogArrayField<T extends ArrayItem>({
  value,
  onChange,
  name = '',
  addButtonLabel = 'Create new',
  emptyStateMessage = 'No items have been created yet.',
  addTitle,
  editorTitle,
  editorFieldsComponent,
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
  itemClasses = 'bg-accent text-accent-contrast elevation-low',
  ...arrayFieldProps
}: DialogArrayFieldProps<T>) {
  const createItem = useCallback(() => {
    const item = itemTemplate();
    return {
      ...item,
      id: typeof item.id === 'string' && item.id.length > 0 ? item.id : uuid(),
    } as Partial<T>;
  }, [itemTemplate]);

  const context = useMemo<DialogArrayContextValue>(
    () => ({
      addTitle: addTitle ?? `Add ${itemLabel}`,
      editFormName: requestedEditFormName ?? defaultEditFormName(name),
      editorFieldsComponent,
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
      editorFieldsComponent,
      editorProps,
      editorTitle,
      editorValidate,
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
    <DialogArrayContext.Provider value={context}>
      <ArrayField<T>
        {...arrayFieldProps}
        name={name}
        value={value}
        onChange={onChange}
        addButtonLabel={addButtonLabel}
        emptyStateMessage={emptyStateMessage}
        itemTemplate={createItem}
        getId={
          getId ??
          ((candidate) =>
            typeof candidate.id === 'string' ? candidate.id : undefined)
        }
        itemClasses={itemClasses}
        // Rows run their own confirm dialog, which names the item type.
        confirmDelete={false}
        itemComponent={DialogItem as ComponentType<ArrayFieldItemProps<T>>}
        editorComponent={
          DialogEditor as ComponentType<ArrayFieldEditorProps<T>>
        }
      />
    </DialogArrayContext.Provider>
  );
}

export default DialogArrayField;
