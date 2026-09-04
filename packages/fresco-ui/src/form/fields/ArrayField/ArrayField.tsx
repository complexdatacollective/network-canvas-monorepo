'use client';

import { GripVerticalIcon, PlusIcon } from 'lucide-react';
import {
  AnimatePresence,
  type DragControls,
  LayoutGroup,
  motion,
  Reorder,
  useDragControls,
} from 'motion/react';
import {
  type ComponentType,
  forwardRef,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { MotionButton } from '../../../Button';
import useDialog from '../../../dialogs/useDialog';
import { useAccessibilityAnnouncements } from '../../../dnd/useAccessibilityAnnouncements';
import { useKeyboardReorder } from '../../../dnd/useKeyboardReorder';
import Surface from '../../../layout/Surface';
import {
  controlVariants,
  groupSpacingVariants,
  heightVariants,
  inputControlVariants,
  proportionalLucideIconVariants,
  stateVariants,
  textSizeVariants,
} from '../../../styles/controlVariants';
import { compose, cva, cx } from '../../../utils/cva';
import type { CreateFormFieldProps } from '../../Field/types';
import { getInputState } from '../../utils/getInputState';
import {
  useArrayFieldItems,
  type ArrayFieldOperation,
  type WithItemProperties,
} from './useArrayFieldItems';

export type {
  ArrayFieldOperation,
  WithItemProperties,
} from './useArrayFieldItems';
// Re-exported here because this module is the package's public entry for
// ArrayField: an item reaching a consumer carries the managed properties, so
// the consumer needs the same strip the hook uses rather than its own copy.
export { stripManagedProperties } from './useArrayFieldItems';

const messages = defineMessages({
  reorderHandle: {
    id: 'frescoUi.arrayField.reorderHandle',
    defaultMessage: 'Reorder item {index, number} of {count, number}',
    description: 'Default accessible name of the drag handle on one list item.',
  },
  reorderInstructions: {
    id: 'frescoUi.arrayField.reorderInstructions',
    defaultMessage:
      'Drag to reorder. Use the up and down arrow keys with the handle focused.',
    description: 'Tooltip explaining how to operate the reorder drag handle.',
  },
  movedItem: {
    id: 'frescoUi.arrayField.movedItem',
    defaultMessage:
      'Moved item {from, number} to position {to, number} of {count, number}.',
    description: 'Screen-reader announcement after a list item is reordered.',
  },
  addedItem: {
    id: 'frescoUi.arrayField.addedItem',
    defaultMessage:
      'Added item at position {position, number} of {count, number}.',
    description: 'Screen-reader announcement after a new list item is added.',
  },
  removedItem: {
    id: 'frescoUi.arrayField.removedItem',
    defaultMessage:
      'Removed item {position, number}. {count, plural, one {# item remaining} other {# items remaining}}.',
    description: 'Screen-reader announcement after a list item is deleted.',
  },
  addItem: {
    id: 'frescoUi.arrayField.addItem',
    defaultMessage: 'Add Item',
    description: 'Default label of the button that adds a list item.',
  },
  emptyState: {
    id: 'frescoUi.arrayField.emptyState',
    defaultMessage: 'No items added yet. Click "Add Item" to get started.',
    description:
      'Default empty state of the list field; mention the add button by its default label.',
  },
});

// Stable empty array to prevent infinite re-renders when value is undefined
const EMPTY_ARRAY: never[] = [];

/**
 * A list this field can render: an array whose entries are objects.
 *
 * `useArrayFieldItems` keys its internal-id WeakMap on the item objects, so a
 * primitive entry is not merely the wrong shape — it is not a legal WeakMap
 * key at all. See the render-tolerance contract on `useField`.
 */
function isItemList<T extends Record<string, unknown>>(
  value: unknown,
): value is T[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null)
  );
}

const arrayFieldVariants = compose(
  controlVariants,
  inputControlVariants,
  groupSpacingVariants,
  stateVariants,
  cva({
    // `min-w-0` overrides the `min-w-fit` `controlVariants` sets for buttons,
    // whose labels should never be clipped. On this list that floor is
    // `fit-content` of every row at once — a row of selects and buttons — so
    // the group refused to shrink below ~428px and pushed the roster editor
    // past a 390px viewport (#1388). The list wraps and clips its own rows
    // (`overflow-hidden text-wrap`), so it has no need of a content floor.
    base: 'relative w-full min-w-0 flex-col overflow-hidden text-wrap',
  }),
);

const itemVariants = cva({
  base: 'w-full rounded select-none',
});

/**
 * Returns animation props for array field items.
 * When hasMounted is false, initial is set to false to prevent mount animations.
 * This avoids flickering when ArrayField is rendered inside animated containers like dialogs.
 */
const getItemAnimationProps = {
  initial: (hasMounted: boolean) => ({
    opacity: hasMounted ? 0 : 1,
    scale: hasMounted ? 0.6 : 1,
  }),
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6 },
};

/**
 * Props passed to the item content renderer component.
 * The component renders the CONTENT inside a Reorder.Item (not the Reorder.Item itself).
 */
export type ArrayFieldItemProps<T extends Record<string, unknown>> = {
  item: Partial<WithItemProperties<T>>;
  index: number;
  /**
   * Position of this item in the last committed value, or undefined for a draft
   * that is not yet part of it. Adapters that bind index-based field paths to a
   * form store should prefer this over `index`, which tracks the live (possibly
   * mid-reorder-preview) position and is meant for visuals and drag bounds.
   */
  committedIndex?: number;
  itemCount: number;
  isNewItem: boolean;
  /**
   * Save and exit editing mode. Use for inline editing pattern. Undefined
   * when the field is disabled or read-only — an ItemComponent that renders
   * its save affordance from handler presence should omit it then.
   */
  onChange?: (value: T) => void;
  /**
   * Update item data without affecting editing state. Use for always-editing
   * pattern. Undefined when the field is disabled or read-only — an
   * ItemComponent that renders its edit affordance from handler presence
   * should omit it then.
   */
  onUpdate?: (value: Partial<T>) => void;
  onCancel: () => void;
  /**
   * Undefined when the field is disabled or read-only — an ItemComponent
   * that renders its delete affordance from handler presence should omit it
   * then, rather than wiring a live-looking control to a no-op.
   */
  onDelete?: () => void;
  /**
   * Undefined when the field is disabled or read-only — an ItemComponent
   * that renders its edit affordance from handler presence should omit it
   * then, rather than wiring a live-looking control to a no-op.
   */
  onEdit?: () => void;
  /**
   * Move this item to `targetIndex` — see `ArrayFieldDragHandleProps.onMove`,
   * which every item component forwards this straight into, for the refusal
   * channel it carries.
   *
   * Declared BY REFERENCE rather than restated, deliberately. TypeScript
   * assigns a function of any return type to a `void`-returning one, so a
   * restatement that fell behind would typecheck across the whole repo while
   * quietly making a refusal unsayable for every list — and the handle would
   * then go on waiting to reclaim focus after a move that never happened,
   * firing at the next unrelated reorder. This makes the two impossible to
   * diverge.
   */
  onMove: ArrayFieldDragHandleProps['onMove'];
  isSortable: boolean;
  isBeingEdited: boolean;
  disabled: boolean;
  readOnly: boolean;
  dragControls: DragControls;
  /**
   * Attach to the control that invokes `onEdit`.
   *
   * When an external `editorComponent` closes, ArrayField returns focus here.
   * It has to be a ref rather than an element captured when editing began,
   * because a row that renders nothing while `isBeingEdited` unmounts this
   * control and mounts a FRESH one on the way back — an element captured at
   * open time is a detached node by the time focus is returned.
   */
  editTriggerRef?: (element: HTMLElement | null) => void;
  /**
   * Resolves the list's own add control — the one control that survives this
   * row being destroyed.
   *
   * For an item component that runs its OWN delete confirmation (rather than
   * leaning on `confirmDelete`) and so has to name its own `finalFocus`. On
   * confirm, both the row and the Remove control that opened the dialog are
   * gone; when the row was the last one there is no neighbouring row to move
   * to either, and answering `null` there sends focus to `<body>`, which Base
   * UI resolves to the first tabbable element in the whole document.
   *
   * Call it when focus is being RETURNED, not when the dialog opens — see
   * `editTriggerRef` for why an element captured earlier is a dead node by
   * then.
   */
  getAddTrigger: () => HTMLElement | null;
};

export type ArrayFieldEditorProps<T extends Record<string, unknown>> = {
  item: WithItemProperties<T> | undefined; // Undefined when no item is being edited
  index: number | null;
  isNewItem: boolean;
  // Editors get onSave to reflect the fact that this should be called once
  // the user is done editing, rather than onChange which implies continuous updates.
  // Undefined when the field is disabled or read-only — an EditorComponent
  // that renders its save affordance from handler presence should omit it
  // then, rather than wiring a live-looking control to a no-op.
  onSave?: (value: T) => void;
  onCancel: () => void;
  /**
   * Resolves the control that opened the current editing session: the edited
   * row's own `editTriggerRef`, or the add button for a new item.
   *
   * Call it when focus is being RETURNED (i.e. pass it as a dialog's
   * `finalFocus`), not when the editor opens — see `editTriggerRef`.
   */
  getEditorTrigger: () => HTMLElement | null;
};

/**
 * Custom props specific to ArrayField (excluding value/onChange/InjectedFieldProps).
 */
type ArrayFieldCustomProps<T extends Record<string, unknown>> = {
  sortable?: boolean;
  maxItems?: number;
  itemClasses?:
    | string
    | ((item: WithItemProperties<T>, isBeingEdited: boolean) => string);

  /**
   * Optional function to extract an ID from an item.
   * If the item has its own ID, return it. Otherwise return undefined.
   * When undefined is returned, ArrayField generates and tracks an internal ID.
   *
   * @example
   * // For items with an 'id' property
   * getId={(item) => item.id}
   *
   * @example
   * // For items without IDs (all get internal IDs)
   * // Simply omit this prop
   */
  getId?: (item: T) => string | undefined;

  /**
   * Component that renders the content inside each Reorder.Item.
   * Receives item data (with _internalId), callbacks, and dragControls for implementing a drag handle.
   *
   * Can also render edit UI for inline editing.
   *
   * Note: ArrayField handles the Reorder.Item wrapper automatically.
   * This component only needs to render the item's visual content and styling.
   */
  itemComponent: ComponentType<ArrayFieldItemProps<T>>;

  /**
   * Provided a dedicated component used to edit an item in the array. Useful
   * for complex editors such as modals or side panels.
   *
   * Accepts ArrayFieldEditorProps<T>.
   */
  editorComponent?: ComponentType<ArrayFieldEditorProps<T>>;

  /**
   * Function that returns a new item template when adding a new item.
   * Note: You don't need to include an 'id' property - ArrayField handles ID generation internally.
   */
  itemTemplate: () => Partial<T>;
  addButtonLabel?: string;
  emptyStateMessage?: string;
  confirmDelete?: boolean;

  /**
   * When true, clicking "Add" immediately adds a confirmed item without entering
   * editing mode. Use this for the "always editing" pattern where items show
   * editable UI at all times.
   *
   * @default false
   */
  immediateAdd?: boolean;

  /**
   * Receive one semantic descriptor for each committed mutation. When this is
   * provided, it replaces the value-level onChange callback so array-aware
   * form stores can preserve index-based metadata.
   */
  onOperation?: (operation: ArrayFieldOperation<T>) => void;
};

export type ArrayFieldProps<T extends Record<string, unknown>> =
  CreateFormFieldProps<T[], 'ul', ArrayFieldCustomProps<T>>;

export type ArrayFieldDragHandleProps = {
  dragControls: DragControls;
  index: number;
  itemCount: number;
  /**
   * Move the item to `targetIndex`.
   *
   * Return `false` when the move is REFUSED — a list with ordering rules of its
   * own (Architect's timeline refuses a reorder that would strand a skip
   * destination) leaves the item where it was, and the handle must then not go
   * on waiting to reclaim focus. Returning nothing means the move happened,
   * which is what every caller without ordering rules does.
   */
  onMove: (targetIndex: number) => void | boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

/**
 * TARGET SIZE DEPENDENCY — do not tighten the gap around the handle.
 *
 * The handle renders roughly 16 x 48 px, which is under WCAG 2.5.8's 24 x 24
 * minimum. It is compliant only through that success criterion's SPACING
 * EXCEPTION: the surrounding gap keeps a >= 24 px exclusion zone around its
 * centre, because the nearest adjacent target sits ~12 px away.
 *
 * That is a deliberate, reviewed choice (the handle blends into the item panel
 * by design — see the accent Surface item treatment), NOT an oversight. But it
 * means the compliance lives in the LAYOUT, not here: any
 * change that brings a neighbouring control closer, or that packs items more
 * tightly, breaks 2.5.8 with nothing in this file to warn you.
 *
 * If you tighten the spacing, widen the handle to >= 24 px in the same change —
 * which is a pixel change, so it needs an E2E visual baseline regeneration
 * (see the `regenerating-e2e-visual-snapshots` skill).
 */
const dragHandleVariants = compose(
  heightVariants,
  textSizeVariants,
  proportionalLucideIconVariants,
);

/**
 * Pointer drag handle with an arrow-key equivalent, for any reorderable list.
 *
 * Exported for lists that are not `ArrayField`s. `onMove` carries a refusal
 * channel so a list with ordering rules of its own can answer whether a move
 * was accepted.
 */
export function ArrayFieldDragHandle({
  dragControls,
  index,
  itemCount,
  onMove,
  disabled = false,
  label,
  className,
  size = 'md',
}: ArrayFieldDragHandleProps) {
  const intl = useAppIntl();
  const resolvedLabel =
    label ??
    intl.formatMessage(messages.reorderHandle, {
      index: index + 1,
      count: itemCount,
    });
  const { ref, ...keyboardReorder } = useKeyboardReorder({
    index,
    itemCount,
    onMove,
  });

  return (
    <button
      ref={ref}
      type="button"
      aria-label={resolvedLabel}
      title={intl.formatMessage(messages.reorderInstructions)}
      // A disabled or read-only list is not reorderable. Four call sites have
      // always passed this; the handle used to drop it on the floor, leaving
      // both the pointer drag and the arrow keys live in a form nobody was
      // allowed to edit.
      disabled={disabled}
      className={cx(
        dragHandleVariants({ size }),
        // `focusable` is the design system's focus ring. Reordering with the
        // keyboard is only usable if you can see which handle holds focus, and
        // this is a control that MOVES while focused.
        'focusable',
        'ui-disabled:cursor-not-allowed ui-disabled:opacity-50',
        'cursor-grab touch-none active:cursor-grabbing',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      // Guarded explicitly rather than left to the `disabled` attribute. A
      // disabled button is unfocusable and swallows clicks, but whether it
      // receives `pointerdown` is not something to bet a locked form on — and
      // announcing `aria-keyshortcuts` for keys that do nothing is its own
      // small lie.
      {...(disabled ? {} : keyboardReorder)}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (disabled) return;
        dragControls.start(event);
      }}
    >
      <GripVerticalIcon />
    </button>
  );
}

type ArrayFieldItemWrapperProps<T extends Record<string, unknown>> = {
  item: WithItemProperties<T>;
  index: number;
  committedIndex?: number;
  itemCount: number;
  isSortable: boolean;
  isBeingEdited: boolean;
  isNewItem: boolean;
  hasMounted: boolean;
  onCancel: () => void;
  onChange?: (value: T) => void;
  onUpdateItem?: (internalId: string, value: Partial<T>) => void;
  onDeleteItem?: (internalId: string) => void;
  onEditItem?: (internalId: string) => void;
  // Carries the refusal channel through the wrapper too, for the reason given
  // on `ArrayFieldItemProps.onMove`: a `=> void` hop anywhere along the way
  // type-erases the `false` before it reaches the handle, and still typechecks.
  onMoveItem: (
    internalId: string,
    targetIndex: number,
  ) => ReturnType<ArrayFieldDragHandleProps['onMove']>;
  onDragStartItem: (internalId: string) => void;
  onDragEndItem: () => void;
  ItemComponent: ComponentType<ArrayFieldItemProps<T>>;
  editTriggerRef: (element: HTMLElement | null) => void;
  getAddTrigger: () => HTMLElement | null;
  disabled: boolean;
  readOnly: boolean;
  itemClasses?:
    | string
    | ((item: WithItemProperties<T>, isBeingEdited: boolean) => string);
};

/**
 * Internal wrapper component for each item that provides drag controls.
 * Uses forwardRef to allow parent components to access the underlying li element.
 */
function ArrayFieldItemWrapperInner<T extends Record<string, unknown>>(
  {
    item,
    index,
    committedIndex,
    itemCount,
    isSortable,
    isBeingEdited,
    isNewItem,
    hasMounted,
    onDeleteItem,
    onEditItem,
    onMoveItem,
    onDragStartItem,
    onDragEndItem,
    onCancel,
    onChange,
    onUpdateItem,
    ItemComponent,
    editTriggerRef,
    getAddTrigger,
    itemClasses,
    disabled,
    readOnly,
  }: ArrayFieldItemWrapperProps<T>,
  ref: Ref<HTMLLIElement>,
) {
  const dragControls = useDragControls();

  const resolvedItemClasses =
    typeof itemClasses === 'function'
      ? itemClasses(item, isBeingEdited)
      : itemClasses;

  // Memoize item-specific callbacks to prevent re-renders. Each stays
  // `undefined` when the corresponding array-level handler is undefined
  // (the field is disabled or read-only), rather than falling back to a
  // no-op stub — an ItemComponent that renders its affordance from handler
  // presence must see it absent, not a live-looking control wired to nothing.
  const onUpdate = useMemo(
    () =>
      onUpdateItem
        ? (data: Partial<T>) => onUpdateItem(item._internalId, data)
        : undefined,
    [onUpdateItem, item._internalId],
  );

  const onDelete = useMemo(
    () => (onDeleteItem ? () => onDeleteItem(item._internalId) : undefined),
    [onDeleteItem, item._internalId],
  );

  const onEdit = useMemo(
    () => (onEditItem ? () => onEditItem(item._internalId) : undefined),
    [onEditItem, item._internalId],
  );

  const onMove = useCallback(
    (targetIndex: number) => onMoveItem(item._internalId, targetIndex),
    [onMoveItem, item._internalId],
  );

  return (
    <Surface
      as={Reorder.Item}
      noContainer
      series="accent"
      ref={ref}
      value={item}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => onDragStartItem(item._internalId)}
      onDragEnd={onDragEndItem}
      className={cx(itemVariants(), resolvedItemClasses)}
      custom={hasMounted}
      layout
      layoutId={item._internalId}
      variants={getItemAnimationProps}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <ItemComponent
        item={item}
        index={index}
        committedIndex={committedIndex}
        itemCount={itemCount}
        isSortable={isSortable}
        isBeingEdited={isBeingEdited}
        onCancel={onCancel}
        onChange={onChange}
        onUpdate={onUpdate}
        isNewItem={isNewItem}
        onDelete={onDelete}
        onEdit={onEdit}
        onMove={onMove}
        disabled={disabled}
        readOnly={readOnly}
        dragControls={dragControls}
        editTriggerRef={editTriggerRef}
        getAddTrigger={getAddTrigger}
      />
    </Surface>
  );
}

// Generic forwardRef wrapper that preserves the generic type parameter
const ArrayFieldItemWrapper = forwardRef(ArrayFieldItemWrapperInner) as <
  T extends Record<string, unknown>,
>(
  props: ArrayFieldItemWrapperProps<T> & { ref?: Ref<HTMLLIElement> },
) => React.JSX.Element;

export default function ArrayField<T extends Record<string, unknown>>({
  value = EMPTY_ARRAY as T[],
  onChange,
  onOperation,
  sortable = false,
  maxItems,
  getId,
  itemComponent: ItemComponent,
  editorComponent: EditorComponent,
  itemTemplate,
  addButtonLabel,
  emptyStateMessage,
  confirmDelete = true,
  immediateAdd = false,
  itemClasses,
  disabled,
  readOnly,
  className,
  ...ariaProps
}: ArrayFieldProps<T>) {
  const intl = useAppIntl();
  const resolvedAddButtonLabel =
    addButtonLabel ?? intl.formatMessage(messages.addItem);
  const resolvedEmptyStateMessage =
    emptyStateMessage ?? intl.formatMessage(messages.emptyState);
  // Props for getInputState - combines disabled/readOnly with aria props
  const inputStateProps = { disabled, readOnly, ...ariaProps };

  // Rendering only: a stored value of another shape shows an empty list until
  // the form's reset lands. Both branches are referentially stable across
  // renders, which `useArrayFieldItems`' external-value sync depends on.
  const itemValue = isItemList<T>(value) ? value : (EMPTY_ARRAY as T[]);

  // Track mount state to prevent initial animations when rendered inside
  // animated containers (e.g., dialogs with layoutId animations).
  // Using a ref instead of state to avoid triggering an extra render.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  const { confirm } = useDialog();
  const { announce } = useAccessibilityAnnouncements();
  const isInteractionDisabled = (disabled ?? false) || (readOnly ?? false);

  const handleCommittedChange = useCallback(
    (nextValue: T[], operation: ArrayFieldOperation<T>) => {
      if (onOperation) {
        onOperation(operation);
        return;
      }
      onChange?.(nextValue);
    },
    [onChange, onOperation],
  );

  const {
    items,
    committedIndexById,
    setItems,
    editingItem,
    isAddingNew,
    startAdding,
    addItem,
    startEditing,
    cancelEditing,
    saveEditing,
    removeItem,
    updateItem,
    isDraft,
  } = useArrayFieldItems(itemValue, handleCommittedChange, { getId });

  const editingIndex = editingItem
    ? items.findIndex((item) => item._internalId === editingItem._internalId)
    : null;
  const confirmedItemCount = items.filter((item) => !item._draft).length;

  /**
   * Focus return for an external editor.
   *
   * `editTriggerElements` is keyed by `_internalId` and written by React when
   * a row's trigger MOUNTS or UNMOUNTS — not on every render, which is the
   * whole point of the memoised ref callbacks below. It therefore always holds
   * the CURRENT element for a row, including the fresh one mounted after a row
   * that hid its controls while being edited comes back. `lastEditingRef`
   * remembers which session was open, because by the time focus is returned
   * `editingItem` is already null.
   */
  const editTriggerElements = useRef(new Map<string, HTMLElement>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const lastEditingRef = useRef<{ internalId: string; isNew: boolean } | null>(
    null,
  );

  if (editingItem) {
    lastEditingRef.current = {
      internalId: editingItem._internalId,
      isNew: isAddingNew,
    };
  }

  // Cached per row so the ref identity is stable across renders — a fresh
  // callback each render would make React detach and reattach every row's
  // trigger on every keystroke.
  const editTriggerCallbacks = useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );

  const registerEditTrigger = useCallback((internalId: string) => {
    const cached = editTriggerCallbacks.current.get(internalId);
    if (cached) return cached;

    const callback = (element: HTMLElement | null) => {
      if (element) {
        editTriggerElements.current.set(internalId, element);
      } else {
        editTriggerElements.current.delete(internalId);
      }
    };
    editTriggerCallbacks.current.set(internalId, callback);
    return callback;
  }, []);

  // The list's add button, resolved lazily. Handed to every row so an item
  // component running its own delete confirmation can name a surviving focus
  // target — the same answer this component's own `confirmDelete` path gives.
  const getAddTrigger = useCallback(() => addButtonRef.current, []);

  const getEditorTrigger = useCallback(() => {
    const session = lastEditingRef.current;
    const rowTrigger = session
      ? editTriggerElements.current.get(session.internalId)
      : undefined;
    // A row deleted while its editor was open has no trigger to go back to.
    const connectedRowTrigger = rowTrigger?.isConnected ? rowTrigger : null;

    if (session && !session.isNew && connectedRowTrigger) {
      return connectedRowTrigger;
    }

    // A new item was never a row, so its opener is the add button — which is
    // also the best remaining answer for an edited row that has since gone.
    //
    // Except at `maxItems`, where there IS no add button: saving the item that
    // fills the list unmounts it in the same commit that mounts the saved
    // row. Answering null there loses focus altogether — the caller's fallback
    // is that same detached button, which every `finalFocus` resolver rejects
    // for being disconnected — so hand back the row this session just
    // committed. `saveEditing` keeps the draft's `_internalId`, so the map
    // lookup above resolves to that freshly mounted control.
    return addButtonRef.current ?? connectedRowTrigger;
  }, []);

  const latestItemsRef = useRef(items);
  latestItemsRef.current = items;
  const pointerDragRef = useRef<{
    internalId: string;
    from: number | null;
  } | null>(null);

  const startPointerDrag = useCallback(
    (internalId: string) => {
      if (isInteractionDisabled) return;
      const itemIndex = items.findIndex(
        (item) => item._internalId === internalId,
      );
      if (itemIndex === -1) return;
      const item = items[itemIndex];
      const from = item?._draft
        ? null
        : items.slice(0, itemIndex).filter((candidate) => !candidate._draft)
            .length;
      pointerDragRef.current = { internalId, from };
      latestItemsRef.current = items;
    },
    [isInteractionDisabled, items],
  );

  const finishPointerDrag = useCallback(() => {
    const drag = pointerDragRef.current;
    pointerDragRef.current = null;
    if (!drag || drag.from === null || isInteractionDisabled) return;

    const previewItems = latestItemsRef.current;
    const itemIndex = previewItems.findIndex(
      (item) => item._internalId === drag.internalId,
    );
    if (itemIndex === -1) return;
    const to = previewItems
      .slice(0, itemIndex)
      .filter((candidate) => !candidate._draft).length;
    if (drag.from === to) return;

    setItems(previewItems, { type: 'move', from: drag.from, to });
    announce(
      intl.formatMessage(messages.movedItem, {
        from: drag.from + 1,
        to: to + 1,
        count: previewItems.length,
      }),
    );
  }, [announce, intl, isInteractionDisabled, setItems]);

  // Answers `false` on every path that leaves the item where it was, so the
  // drag handle disarms rather than waiting to reclaim focus after a move that
  // did not happen. `undefined` means it moved — the same contract every other
  // `onMove` is written to.
  const moveItem = useCallback(
    (internalId: string, targetIndex: number): void | boolean => {
      if (isInteractionDisabled) return false;

      const currentIndex = items.findIndex(
        (item) => item._internalId === internalId,
      );
      const boundedIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
      if (currentIndex === -1 || currentIndex === boundedIndex) return false;

      const reorderedItems = [...items];
      const [movedItem] = reorderedItems.splice(currentIndex, 1);
      if (!movedItem) return false;
      reorderedItems.splice(boundedIndex, 0, movedItem);

      const confirmedBefore = items.filter((item) => !item._draft);
      const confirmedAfter = reorderedItems.filter((item) => !item._draft);
      const from = confirmedBefore.findIndex(
        (item) => item._internalId === internalId,
      );
      const to = confirmedAfter.findIndex(
        (item) => item._internalId === internalId,
      );
      if (from === -1 || from === to) {
        setItems(reorderedItems);
      } else {
        setItems(reorderedItems, { type: 'move', from, to });
      }
      announce(
        intl.formatMessage(messages.movedItem, {
          from: currentIndex + 1,
          to: boundedIndex + 1,
          count: items.length,
        }),
      );
    },
    [announce, intl, isInteractionDisabled, items, setItems],
  );

  const commitEditing = useCallback(
    (data: T) => {
      const wasAdding = editingItem?._draft === true;
      const newItemPosition = wasAdding
        ? items
            .slice(0, editingIndex ?? items.length)
            .filter((item) => !item._draft).length + 1
        : null;
      saveEditing(data);
      if (newItemPosition !== null) {
        announce(
          intl.formatMessage(messages.addedItem, {
            position: newItemPosition,
            count: confirmedItemCount + 1,
          }),
        );
      }
    },
    [
      announce,
      confirmedItemCount,
      editingIndex,
      editingItem?._draft,
      intl,
      items,
      saveEditing,
    ],
  );

  // Handle delete with optional confirmation for non-draft items
  const requestDelete = useCallback(
    async (internalId: string) => {
      if (isInteractionDisabled) return;

      // Always delete drafts immediately without confirmation
      if (isDraft(internalId)) {
        removeItem(internalId);
        return;
      }

      const index = items.findIndex((item) => item._internalId === internalId);
      const position =
        items.slice(0, index).filter((item) => !item._draft).length + 1;
      const removeAndAnnounce = () => {
        removeItem(internalId);
        announce(
          intl.formatMessage(messages.removedItem, {
            position,
            count: Math.max(0, confirmedItemCount - 1),
          }),
        );
      };

      if (confirmDelete) {
        await confirm({
          confirmLabel: intl.formatMessage(commonMessages.delete),
          onConfirm: removeAndAnnounce,
          // On confirm the row — and the Delete control that opened this — is
          // gone, so focus has nowhere to return to. The add button is the
          // surviving control for this list. (Cancel still returns to the row's
          // own Delete control, which is untouched.)
          finalFocus: () => addButtonRef.current,
        });
      } else {
        removeAndAnnounce();
      }
    },
    [
      announce,
      confirm,
      confirmedItemCount,
      confirmDelete,
      intl,
      isDraft,
      isInteractionDisabled,
      items,
      removeItem,
    ],
  );

  // When using an external editor, filter out draft items from the list
  // (they're rendered in the editor instead). For inline editing, keep drafts in the list.
  const renderableItems = useMemo(
    () => (EditorComponent ? items.filter((item) => !item._draft) : items),
    [EditorComponent, items],
  );

  const id = useId();
  const isAtCapacity =
    maxItems !== undefined && confirmedItemCount >= Math.max(0, maxItems);
  const effectiveSortable = sortable && !isInteractionDisabled;

  // Extract conflicting event handlers and ref before spreading to motion component
  const {
    onAnimationStart,
    onAnimationEnd,
    onAnimationIteration,
    onDrag,
    onDragEnd,
    onDragEnter,
    onDragExit,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
    ref,
    ...safeAriaProps
  } = ariaProps;

  return (
    <LayoutGroup id={id} inherit={false}>
      {/* `min-w-0`, never a fixed floor. The 24rem `min-w-sm` this carried
          overflowed every container narrower than itself — measurably the sole
          source of the horizontal scroll on Architect's stage editor at phone
          widths — and a field cannot know how much room its host has. */}
      <motion.div
        layoutRoot
        className={cx(
          'flex w-full min-w-0 flex-col items-start gap-4',
          className,
        )}
      >
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={(reorderedItems) => {
            if (!effectiveSortable) return;
            latestItemsRef.current = reorderedItems;
            setItems(reorderedItems);
          }}
          className={arrayFieldVariants({
            state: getInputState(inputStateProps),
          })}
          style={{ borderRadius: 28 }}
          role="list"
          layout
          {...safeAriaProps}
        >
          <AnimatePresence mode="popLayout">
            {renderableItems.length === 0 && (
              <motion.li
                layout
                key="no-items"
                className="m-10 text-sm text-current/70"
                custom={hasMountedRef.current}
                variants={getItemAnimationProps}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {resolvedEmptyStateMessage}
              </motion.li>
            )}
            {renderableItems.map((item) => {
              const index = items.findIndex(
                (candidate) => candidate._internalId === item._internalId,
              );
              const committedIndex = committedIndexById.get(item._internalId);

              return (
                <ArrayFieldItemWrapper
                  key={item._internalId}
                  item={item}
                  index={index}
                  committedIndex={committedIndex}
                  itemCount={items.length}
                  isSortable={effectiveSortable}
                  hasMounted={hasMountedRef.current}
                  onDeleteItem={
                    isInteractionDisabled ? undefined : requestDelete
                  }
                  onEditItem={isInteractionDisabled ? undefined : startEditing}
                  onMoveItem={moveItem}
                  onDragStartItem={startPointerDrag}
                  onDragEndItem={finishPointerDrag}
                  onChange={isInteractionDisabled ? undefined : commitEditing}
                  onUpdateItem={isInteractionDisabled ? undefined : updateItem}
                  isNewItem={!!item._draft}
                  isBeingEdited={editingItem?._internalId === item._internalId}
                  onCancel={cancelEditing}
                  ItemComponent={ItemComponent}
                  editTriggerRef={registerEditTrigger(item._internalId)}
                  getAddTrigger={getAddTrigger}
                  itemClasses={itemClasses}
                  disabled={disabled ?? false}
                  readOnly={readOnly ?? false}
                />
              );
            })}
          </AnimatePresence>
        </Reorder.Group>
        {!isAtCapacity && (
          <MotionButton
            ref={addButtonRef}
            layout
            key="add-button"
            color="primary"
            onClick={() => {
              if (immediateAdd) {
                addItem(itemTemplate() as T);
                announce(
                  intl.formatMessage(messages.addedItem, {
                    position: confirmedItemCount + 1,
                    count: confirmedItemCount + 1,
                  }),
                );
                return;
              }
              startAdding(itemTemplate() as T);
            }}
            icon={<PlusIcon />}
            disabled={isInteractionDisabled || (!immediateAdd && !!editingItem)}
          >
            {resolvedAddButtonLabel}
          </MotionButton>
        )}
        {EditorComponent && (
          <EditorComponent
            item={editingItem}
            index={editingIndex}
            isNewItem={isAddingNew}
            onSave={isInteractionDisabled ? undefined : commitEditing}
            onCancel={cancelEditing}
            getEditorTrigger={getEditorTrigger}
          />
        )}
      </motion.div>
    </LayoutGroup>
  );
}
