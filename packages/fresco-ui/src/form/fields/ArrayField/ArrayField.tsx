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
  type KeyboardEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';

import { IconButton, MotionButton } from '../../../Button';
import useDialog from '../../../dialogs/useDialog';
import { useAccessibilityAnnouncements } from '../../../dnd/useAccessibilityAnnouncements';
import Surface from '../../../layout/Surface';
import {
  controlVariants,
  groupSpacingVariants,
  inputControlVariants,
  stateVariants,
} from '../../../styles/controlVariants';
import { compose, cva, cx } from '../../../utils/cva';
import type { CreateFormFieldProps } from '../../Field/types';
import { getInputState } from '../../utils/getInputState';
import {
  useArrayFieldItems,
  type ArrayFieldOperation,
  type WithItemProperties,
} from './useArrayFieldItems';

export type { ArrayFieldOperation } from './useArrayFieldItems';

// Stable empty array to prevent infinite re-renders when value is undefined
const EMPTY_ARRAY: never[] = [];

const arrayFieldVariants = compose(
  controlVariants,
  inputControlVariants,
  groupSpacingVariants,
  stateVariants,
  cva({
    base: 'relative w-full flex-col overflow-hidden text-wrap',
  }),
);

const itemVariants = cva({
  base: 'w-full select-none',
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
 * Pointer drag handle with an arrow-key equivalent, for any reorderable list.
 *
 * Exported for lists that are not `ArrayField`s — Architect's stage timeline
 * uses it so the app has one reorder vocabulary rather than two — which is why
 * `onMove` carries a refusal channel a list with ordering rules of its own can
 * answer on.
 */
export function ArrayFieldDragHandle({
  dragControls,
  index,
  itemCount,
  onMove,
  disabled = false,
  label = `Reorder item ${index + 1} of ${itemCount}`,
  className,
  size = 'md',
}: ArrayFieldDragHandleProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocusAfterMoveRef = useRef(false);

  // Committing a keyboard reorder repositions this handle in the DOM, which
  // blurs it in browsers and drops focus to <body>. Restore focus on the next
  // frame (after the reposition settles) so repeated arrow presses keep working
  // without tabbing back to the handle each step.
  useEffect(() => {
    if (!refocusAfterMoveRef.current) return undefined;
    refocusAfterMoveRef.current = false;
    const frame = requestAnimationFrame(() => buttonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [index]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    event.stopPropagation();

    const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
    // Ignore presses that would run off either end: no move happens, so focus
    // is never lost and no refocus should be scheduled.
    if (targetIndex < 0 || targetIndex > itemCount - 1) return;

    // Armed BEFORE the call, because `onMove` may commit synchronously and the
    // effect above has to see the flag; disarmed again the moment the list says
    // it refused. Leaving it armed after a refusal is not harmless: `index`
    // never changes, so the flag survives until some UNRELATED reorder or
    // deletion shifts this item — and focus is then yanked onto this handle out
    // of nowhere, long after the arrow press that armed it.
    refocusAfterMoveRef.current = true;
    if (onMove(targetIndex) === false) {
      refocusAfterMoveRef.current = false;
    }
  };

  return (
    <IconButton
      ref={buttonRef}
      icon={<GripVerticalIcon />}
      aria-label={label}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title="Drag to reorder. Use the up and down arrow keys with the handle focused."
      size={size}
      variant="text"
      color="dynamic"
      disabled={disabled}
      className={cx('cursor-grab touch-none active:cursor-grabbing', className)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.stopPropagation();
        dragControls.start(event);
      }}
    />
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
      spacing="sm"
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
      style={{ borderRadius: 14 }}
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
  addButtonLabel = 'Add Item',
  emptyStateMessage = 'No items added yet. Click "Add Item" to get started.',
  confirmDelete = true,
  immediateAdd = false,
  itemClasses,
  disabled,
  readOnly,
  ...ariaProps
}: ArrayFieldProps<T>) {
  // Props for getInputState - combines disabled/readOnly with aria props
  const inputStateProps = { disabled, readOnly, ...ariaProps };

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
  } = useArrayFieldItems(value, handleCommittedChange, { getId });

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

  const getEditorTrigger = useCallback(() => {
    const session = lastEditingRef.current;
    if (session && !session.isNew) {
      const trigger = editTriggerElements.current.get(session.internalId);
      // A row deleted while its editor was open has no trigger to go back to.
      if (trigger?.isConnected) return trigger;
    }
    // A new item was never a row, so its opener is the add button — which is
    // also the best remaining answer for an edited row that has since gone.
    return addButtonRef.current;
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
      `Moved item ${drag.from + 1} to position ${to + 1} of ${previewItems.length}.`,
    );
  }, [announce, isInteractionDisabled, setItems]);

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
        `Moved item ${currentIndex + 1} to position ${boundedIndex + 1} of ${items.length}.`,
      );
    },
    [announce, isInteractionDisabled, items, setItems],
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
          `Added item at position ${newItemPosition} of ${confirmedItemCount + 1}.`,
        );
      }
    },
    [
      announce,
      confirmedItemCount,
      editingIndex,
      editingItem?._draft,
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
          `Removed item ${position}. ${Math.max(0, confirmedItemCount - 1)} items remaining.`,
        );
      };

      if (confirmDelete) {
        await confirm({
          confirmLabel: 'Delete',
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
  /* eslint-disable @typescript-eslint/no-unused-vars */
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
  /* eslint-enable @typescript-eslint/no-unused-vars */

  return (
    <LayoutGroup id={id}>
      {/* `min-w-0`, never a fixed floor. The 24rem `min-w-sm` this carried
          overflowed every container narrower than itself — measurably the sole
          source of the horizontal scroll on Architect's stage editor at phone
          widths — and a field cannot know how much room its host has. */}
      <motion.div
        layoutRoot
        className="flex w-full min-w-0 flex-col items-start gap-4"
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
                {emptyStateMessage}
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
                  `Added item at position ${confirmedItemCount + 1} of ${confirmedItemCount + 1}.`,
                );
                return;
              }
              startAdding(itemTemplate() as T);
            }}
            icon={<PlusIcon />}
            disabled={isInteractionDisabled || (!immediateAdd && !!editingItem)}
          >
            {addButtonLabel}
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
