import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Managed properties added to array items for internal tracking.
 */
type ManagedProperties = {
  readonly _internalId: string;
  readonly _draft?: boolean;
};

/**
 * Item with internal properties (_internalId and optional _draft flag) merged in.
 */
export type WithItemProperties<T> = T & ManagedProperties;

/**
 * Describes one committed mutation to an ArrayField value.
 *
 * Consumers backed by an array-aware form store can use this descriptor to
 * preserve index-based field metadata when an item is inserted, removed,
 * moved, or replaced.
 */
export type ArrayFieldOperation<T> =
  | { type: 'insert'; index: number; item: T }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'replace'; index: number; item: T };

type PendingArrayFieldOperation =
  | { type: 'insert'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'replace'; index: number };

/**
 * Configuration for the useArrayFieldItems hook.
 */
type UseArrayFieldItemsConfig<T> = {
  /** Optional function to extract an existing ID from an item. */
  getId?: (item: T) => string | undefined;
};

/**
 * Return type for the useArrayFieldItems hook.
 */
type UseArrayFieldItemsReturn<T extends Record<string, unknown>> = {
  // ─── Items ───────────────────────────────────────────────────────────────
  /** All items (both confirmed and draft) with managed properties. */
  items: WithItemProperties<T>[];
  /** Preview a reordered list locally, or commit it with an operation. */
  setItems: (
    items: WithItemProperties<T>[],
    operation?: PendingArrayFieldOperation,
  ) => void;

  // ─── Editing State ───────────────────────────────────────────────────────
  /** The item currently being edited, or undefined if none. */
  editingItem: WithItemProperties<T> | undefined;
  /** True if editingItem is a newly added draft item (vs editing an existing one). */
  isAddingNew: boolean;

  // ─── Editing Actions ─────────────────────────────────────────────────────
  /** Start adding a new item. Creates a draft and starts editing it. */
  startAdding: (template: T) => void;
  /** Start editing an existing item by its internal ID. */
  startEditing: (internalId: string) => void;
  /** Cancel the current edit. Removes draft items, clears editing state. */
  cancelEditing: () => void;
  /** Save the current edit. Confirms drafts and calls onChange. */
  saveEditing: (data: T) => void;

  // ─── Item Operations ─────────────────────────────────────────────────────
  /** Add a confirmed item directly without entering editing mode. Use for always-editing pattern. */
  addItem: (item: T) => void;
  /** Remove an item by its internal ID. */
  removeItem: (internalId: string) => void;
  /** Update a specific item by its internal ID without affecting editing state. */
  updateItem: (internalId: string, data: Partial<T>) => void;
  /** Check if an item is a draft by its internal ID. */
  isDraft: (internalId: string) => boolean;
};

/**
 * Hook for managing arrays with stable internal IDs, draft support, and editing state.
 *
 * This hook provides a complete solution for managing editable array fields:
 * - Stable internal IDs for React keys
 * - Draft items for newly added items that don't trigger onChange until confirmed
 * - Separate editing state tracked by ID (not draft flag)
 *
 * Key behaviors:
 * - `_draft` flag is only set on newly added items (via startAdding)
 * - `editingItem` is tracked by internal ID, separate from draft status
 * - startAdding: Creates an item with _draft: true and starts editing it
 * - startEditing: Sets the editing ID to an existing item (no draft flag)
 * - saveEditing: For drafts, removes _draft flag; for all items, calls onChange
 * - cancelEditing: Removes draft items, clears editing state
 *
 * External value sync behavior:
 * - When the parent's `value` prop changes, items are re-synced with new data
 * - Draft items (unsaved additions) are preserved across value changes
 * - If an item being edited is removed by the parent, `editingId` is cleared
 * - For non-draft edits: `editingItem` reflects the NEW data from the parent,
 *   not any unsaved local edits. Consumers should handle this case if needed
 *   (e.g., by warning users or merging changes)
 *
 * @example
 * ```tsx
 * function ItemList({ value, onChange }: {
 *   value: Item[];
 *   onChange: (items: Item[]) => void;
 * }) {
 *   const {
 *     items,
 *     editingItem,
 *     startAdding,
 *     startEditing,
 *     cancelEditing,
 *     saveEditing,
 *     removeItem,
 *   } = useArrayFieldItems(value, onChange);
 *
 *   return (
 *     <>
 *       {items.map((item) => (
 *         <Item
 *           key={item._internalId}
 *           item={item}
 *           onEdit={() => startEditing(item._internalId)}
 *           onDelete={() => removeItem(item._internalId)}
 *         />
 *       ))}
 *       <button onClick={() => startAdding({ name: '' })}>Add</button>
 *       {editingItem && (
 *         <Editor
 *           item={editingItem}
 *           onSave={saveEditing}
 *           onCancel={cancelEditing}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function useArrayFieldItems<T extends Record<string, unknown>>(
  value: T[],
  onChange?: (items: T[], operation: ArrayFieldOperation<T>) => void,
  config?: UseArrayFieldItemsConfig<T>,
): UseArrayFieldItemsReturn<T> {
  // WeakMap ties internal ID lifespan to the original object for GC
  const idMapRef = useRef<WeakMap<T, string>>(new WeakMap());

  // Resolve an ID already associated with an item without creating one.
  const getKnownInternalId = useCallback(
    (item: T): string | undefined => {
      // If getId is provided and returns a value, use it directly
      if (config?.getId) {
        const existingId = config.getId(item);
        if (existingId !== undefined) {
          return existingId;
        }
      }

      return idMapRef.current.get(item);
    },
    [config],
  );

  // Helper to get or create an internal ID for an item
  const getInternalId = useCallback(
    (item: T): string => {
      const knownId = getKnownInternalId(item);
      if (knownId) return knownId;

      const internalId = crypto.randomUUID();
      idMapRef.current.set(item, internalId);
      return internalId;
    },
    [getKnownInternalId],
  );

  // Combined state for atomic updates (prevents animation flickering)
  const [state, setState] = useState<{
    items: WithItemProperties<T>[];
    editingId: string | null;
  }>(() => ({
    items: value.map((item) => ({
      ...item,
      _internalId: getInternalId(item),
    })),
    editingId: null,
  }));
  const stateRef = useRef(state);
  const replaceState = useCallback((nextState: typeof state) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const { items, editingId } = state;

  // Sync with external value changes
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;

    // Get current draft to preserve it
    const currentState = stateRef.current;
    const currentDraft = currentState.items.find(
      (item) => item._draft === true,
    );

    const previousConfirmed = currentState.items.filter((item) => !item._draft);

    // Immutable form stores replace the object containing a changed nested
    // field. Reuse the item at the same position when neither an explicit ID
    // nor an object-reference mapping is available, so a keystroke does not
    // remount the row and interrupt focus.
    const newConfirmed: WithItemProperties<T>[] = value.map((item, index) => {
      const internalId =
        getKnownInternalId(item) ??
        previousConfirmed[index]?._internalId ??
        crypto.randomUUID();

      idMapRef.current.set(item, internalId);

      return {
        ...item,
        _internalId: internalId,
      };
    });

    // Merge: confirmed items from value + draft (if any)
    const newItems = currentDraft
      ? [...newConfirmed, currentDraft]
      : newConfirmed;

    // Clear editingId if the edited item no longer exists
    const editingStillExists =
      currentState.editingId === null ||
      newItems.some((item) => item._internalId === currentState.editingId);

    replaceState({
      items: newItems,
      editingId: editingStillExists ? currentState.editingId : null,
    });
  }

  // Derive editing state from editingId
  const editingItem = useMemo(
    () => items.find((item) => item._internalId === editingId),
    [items, editingId],
  );
  const isAddingNew = editingItem?._draft ?? false;

  // Check if an item is a draft
  const isDraft = useCallback(
    (internalId: string): boolean => {
      const item = items.find((i) => i._internalId === internalId);
      return item?._draft ?? false;
    },
    [items],
  );

  // Notify parent of non-draft items (strips managed properties, preserves ID mapping)
  const notifyChange = useCallback(
    (
      allItems: WithItemProperties<T>[],
      operation: PendingArrayFieldOperation,
    ) => {
      const confirmedItems = allItems
        .filter((item) => !item._draft)
        .map(({ _internalId, _draft, ...rest }) => {
          const stripped = rest as unknown as T;
          // Preserve the ID mapping for the stripped object so it's found on next render
          idMapRef.current.set(stripped, _internalId);
          return stripped;
        });

      if (operation.type === 'insert' || operation.type === 'replace') {
        const item = confirmedItems[operation.index];
        if (!item) return;
        onChange?.(confirmedItems, { ...operation, item });
        return;
      }

      onChange?.(confirmedItems, operation);
    },
    [onChange],
  );

  // Start adding a new item (creates draft and sets editing state)
  const startAdding = useCallback(
    (template: T): void => {
      const internalId = crypto.randomUUID();
      const draftItem: WithItemProperties<T> = {
        ...template,
        _internalId: internalId,
        _draft: true,
      };
      const currentState = stateRef.current;

      // Remove any existing draft, add the new one, and set editing ID atomically
      replaceState({
        items: [
          ...currentState.items.filter((item) => !item._draft),
          draftItem,
        ],
        editingId: internalId,
      });
    },
    [replaceState],
  );

  // Add a confirmed item directly without entering editing mode
  const addItem = useCallback(
    (item: T): void => {
      const internalId = crypto.randomUUID();
      const newItem: WithItemProperties<T> = {
        ...item,
        _internalId: internalId,
      };

      const currentState = stateRef.current;
      const newItems = [...currentState.items, newItem];
      const index = currentState.items.filter(
        (candidate) => !candidate._draft,
      ).length;

      replaceState({ ...currentState, items: newItems });
      notifyChange(newItems, { type: 'insert', index });
    },
    [notifyChange, replaceState],
  );

  // Start editing an existing item (sets editing ID, no draft flag)
  const startEditing = useCallback(
    (internalId: string): void => {
      const currentState = stateRef.current;
      // Skip if already editing this item
      if (currentState.editingId === internalId) return;

      const targetItem = currentState.items.find(
        (item) => item._internalId === internalId,
      );
      // Skip if target doesn't exist
      if (!targetItem) return;

      // Check if there's a draft to remove
      const hasDraft = currentState.items.some((item) => item._draft);

      replaceState({
        // Only filter if there's actually a draft to remove
        items: hasDraft
          ? currentState.items.filter((item) => !item._draft)
          : currentState.items,
        editingId: internalId,
      });
    },
    [replaceState],
  );

  // Cancel the current edit (removes draft items if any, clears editing state)
  const cancelEditing = useCallback((): void => {
    const currentState = stateRef.current;
    // Skip if not currently editing
    if (currentState.editingId === null) return;

    // Check if there's a draft to remove
    const hasDraft = currentState.items.some((item) => item._draft);

    replaceState({
      // Only filter if there's actually a draft to remove
      items: hasDraft
        ? currentState.items.filter((item) => !item._draft)
        : currentState.items,
      editingId: null,
    });
  }, [replaceState]);

  // Save the current edit (confirms drafts, updates existing items)
  const saveEditing = useCallback(
    (data: T): void => {
      const currentState = stateRef.current;
      if (!currentState.editingId) return;

      const editingIdx = currentState.items.findIndex(
        (item) => item._internalId === currentState.editingId,
      );
      if (editingIdx === -1) return;

      const editingItemRef = currentState.items[editingIdx]!;

      const newItems = currentState.items.map((item, idx) => {
        if (idx !== editingIdx) return item;

        // Update the item with new data, removing _draft flag if present
        return {
          ...data,
          _internalId: editingItemRef._internalId,
        } as WithItemProperties<T>;
      });

      const confirmedIndex = currentState.items
        .slice(0, editingIdx)
        .filter((item) => !item._draft).length;

      replaceState({ items: newItems, editingId: null });
      notifyChange(newItems, {
        type: editingItemRef._draft ? 'insert' : 'replace',
        index: confirmedIndex,
      });
    },
    [notifyChange, replaceState],
  );

  // Remove an item
  const removeItem = useCallback(
    (internalId: string): void => {
      const currentState = stateRef.current;
      const itemIndex = currentState.items.findIndex(
        (item) => item._internalId === internalId,
      );
      if (itemIndex === -1) return;

      const item = currentState.items[itemIndex];
      const itemIsDraft = item?._draft ?? false;
      const newItems = currentState.items.filter(
        (candidate) => candidate._internalId !== internalId,
      );

      replaceState({ ...currentState, items: newItems });

      // Only notify if removing a non-draft item
      if (!itemIsDraft) {
        const confirmedIndex = currentState.items
          .slice(0, itemIndex)
          .filter((candidate) => !candidate._draft).length;
        notifyChange(newItems, { type: 'remove', index: confirmedIndex });
      }
    },
    [notifyChange, replaceState],
  );

  // Update a specific item without affecting editing state
  const updateItem = useCallback(
    (internalId: string, data: Partial<T>): void => {
      const currentState = stateRef.current;
      const itemIndex = currentState.items.findIndex(
        (item) => item._internalId === internalId,
      );
      if (itemIndex === -1) return;

      const existingItem = currentState.items[itemIndex]!;
      const updatedItem: WithItemProperties<T> = {
        ...existingItem,
        ...data,
        _internalId: existingItem._internalId,
        _draft: existingItem._draft,
      };

      const newItems = currentState.items.map((item, index) =>
        index === itemIndex ? updatedItem : item,
      );

      replaceState({ ...currentState, items: newItems });

      // Only notify if updating a non-draft item
      if (!existingItem._draft) {
        const confirmedIndex = currentState.items
          .slice(0, itemIndex)
          .filter((candidate) => !candidate._draft).length;
        notifyChange(newItems, {
          type: 'replace',
          index: confirmedIndex,
        });
      }
    },
    [notifyChange, replaceState],
  );

  // Set items - handles both draft and non-draft updates
  const setItems = useCallback(
    (
      newItems: WithItemProperties<T>[],
      operation?: PendingArrayFieldOperation,
    ): void => {
      replaceState({ ...stateRef.current, items: newItems });

      if (operation) notifyChange(newItems, operation);
    },
    [notifyChange, replaceState],
  );

  return {
    // Items
    items,
    setItems,

    // Editing state (derived)
    editingItem,
    isAddingNew,

    // Editing actions
    startAdding,
    startEditing,
    cancelEditing,
    saveEditing,

    // Item operations
    addItem,
    removeItem,
    updateItem,
    isDraft,
  };
}
