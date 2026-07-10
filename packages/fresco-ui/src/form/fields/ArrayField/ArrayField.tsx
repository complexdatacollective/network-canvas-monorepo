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
  type WithItemProperties,
} from './useArrayFieldItems';

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
  itemCount: number;
  isNewItem: boolean;
  /** Save and exit editing mode. Use for inline editing pattern. */
  onChange: (value: T) => void;
  /** Update item data without affecting editing state. Use for always-editing pattern. */
  onUpdate: (value: Partial<T>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: (targetIndex: number) => void;
  isSortable: boolean;
  isBeingEdited: boolean;
  disabled: boolean;
  readOnly: boolean;
  dragControls: DragControls;
};

export type ArrayFieldEditorProps<T extends Record<string, unknown>> = {
  item: WithItemProperties<T> | undefined; // Undefined when no item is being edited
  index: number | null;
  isNewItem: boolean;
  // Editors get onSave to reflect the fact that this should be called once
  // the user is done editing, rather than onChange which implies continuous updates.
  onSave: (value: T) => void;
  onCancel: () => void;
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
};

export type ArrayFieldProps<T extends Record<string, unknown>> =
  CreateFormFieldProps<T[], 'ul', ArrayFieldCustomProps<T>>;

export type ArrayFieldDragHandleProps = {
  dragControls: DragControls;
  index: number;
  itemCount: number;
  onMove: (targetIndex: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

/**
 * Pointer drag handle with an arrow-key equivalent for sortable ArrayFields.
 */
export function ArrayFieldDragHandle({
  dragControls,
  index,
  itemCount,
  onMove,
  disabled = false,
  label = `Reorder item ${index + 1} of ${itemCount}`,
  className,
}: ArrayFieldDragHandleProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    event.stopPropagation();
    onMove(index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  return (
    <IconButton
      icon={<GripVerticalIcon />}
      aria-label={label}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title="Drag to reorder. Use the up and down arrow keys with the handle focused."
      size="sm"
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
  itemCount: number;
  isSortable: boolean;
  isBeingEdited: boolean;
  isNewItem: boolean;
  hasMounted: boolean;
  onCancel: () => void;
  onChange: (value: T) => void;
  onUpdateItem: (internalId: string, value: Partial<T>) => void;
  onDeleteItem: (internalId: string) => void;
  onEditItem: (internalId: string) => void;
  onMoveItem: (internalId: string, targetIndex: number) => void;
  ItemComponent: ComponentType<ArrayFieldItemProps<T>>;
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
    itemCount,
    isSortable,
    isBeingEdited,
    isNewItem,
    hasMounted,
    onDeleteItem,
    onEditItem,
    onMoveItem,
    onCancel,
    onChange,
    onUpdateItem,
    ItemComponent,
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

  // Memoize item-specific callbacks to prevent re-renders
  const onUpdate = useCallback(
    (data: Partial<T>) => onUpdateItem(item._internalId, data),
    [onUpdateItem, item._internalId],
  );

  const onDelete = useCallback(
    () => onDeleteItem(item._internalId),
    [onDeleteItem, item._internalId],
  );

  const onEdit = useCallback(
    () => onEditItem(item._internalId),
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

  const {
    items,
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
  } = useArrayFieldItems(value, onChange, { getId });

  const moveItem = useCallback(
    (internalId: string, targetIndex: number) => {
      if (isInteractionDisabled) return;

      const currentIndex = items.findIndex(
        (item) => item._internalId === internalId,
      );
      const boundedIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
      if (currentIndex === -1 || currentIndex === boundedIndex) return;

      const reorderedItems = [...items];
      const [movedItem] = reorderedItems.splice(currentIndex, 1);
      if (!movedItem) return;
      reorderedItems.splice(boundedIndex, 0, movedItem);
      setItems(reorderedItems);
      announce(
        `Moved item ${currentIndex + 1} to position ${boundedIndex + 1} of ${items.length}.`,
      );
    },
    [announce, isInteractionDisabled, items, setItems],
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

      if (confirmDelete) {
        await confirm({
          confirmLabel: 'Delete',
          onConfirm: () => removeItem(internalId),
        });
      } else {
        removeItem(internalId);
      }
    },
    [confirmDelete, confirm, removeItem, isDraft, isInteractionDisabled],
  );

  // When using an external editor, filter out draft items from the list
  // (they're rendered in the editor instead). For inline editing, keep drafts in the list.
  const renderableItems = useMemo(
    () => (EditorComponent ? items.filter((item) => !item._draft) : items),
    [EditorComponent, items],
  );

  const id = useId();
  const editingIndex = editingItem
    ? items.findIndex((item) => item._internalId === editingItem._internalId)
    : null;
  const confirmedItemCount = items.filter((item) => !item._draft).length;
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
      <motion.div
        layoutRoot
        className="flex w-full min-w-sm flex-col items-start gap-4"
      >
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={(reorderedItems) => {
            if (effectiveSortable) setItems(reorderedItems);
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

              return (
                <ArrayFieldItemWrapper
                  key={item._internalId}
                  item={item}
                  index={index}
                  itemCount={items.length}
                  isSortable={effectiveSortable}
                  hasMounted={hasMountedRef.current}
                  onDeleteItem={
                    isInteractionDisabled ? () => undefined : requestDelete
                  }
                  onEditItem={
                    isInteractionDisabled ? () => undefined : startEditing
                  }
                  onMoveItem={moveItem}
                  onChange={
                    isInteractionDisabled ? () => undefined : saveEditing
                  }
                  onUpdateItem={
                    isInteractionDisabled ? () => undefined : updateItem
                  }
                  isNewItem={!!item._draft}
                  isBeingEdited={editingItem?._internalId === item._internalId}
                  onCancel={cancelEditing}
                  ItemComponent={ItemComponent}
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
            layout
            key="add-button"
            onClick={() =>
              immediateAdd
                ? addItem(itemTemplate() as T)
                : startAdding(itemTemplate() as T)
            }
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
            onSave={isInteractionDisabled ? () => undefined : saveEditing}
            onCancel={cancelEditing}
          />
        )}
      </motion.div>
    </LayoutGroup>
  );
}
