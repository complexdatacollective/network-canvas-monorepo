'use client';

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

const MANAGED_PROPERTY_KEYS = [
  '_internalId',
  '_draft',
] as const satisfies readonly (keyof ManagedProperties)[];

type AssertNever<T extends never> = T;

/**
 * Compile-time exhaustiveness. A property added to `ManagedProperties` and not
 * to `MANAGED_PROPERTY_KEYS` makes this a type error — which is what actually
 * keeps a new managed key out of consumers' saved data, rather than a comment
 * asking whoever adds one to remember.
 */
type _ManagedPropertyKeysAreExhaustive = AssertNever<
  Exclude<keyof ManagedProperties, (typeof MANAGED_PROPERTY_KEYS)[number]>
>;

/**
 * Removes the properties ArrayField manages, leaving the value the consumer's
 * own schema describes.
 *
 * Exported because every consumer needs it: an item handed to an item
 * component, an editor or a preview carries `_internalId` (and `_draft` while
 * it is uncommitted), and neither belongs in whatever the consumer persists.
 * A hand-rolled destructure at the call site freezes today's list of managed
 * keys, so a key added here reaches consumers' saved data — which is why this
 * lives beside `ManagedProperties` and is derived from it.
 */
export const stripManagedProperties = <T extends Record<string, unknown>>(
  item: Partial<WithItemProperties<T>> | undefined,
): T => {
  if (!item) return {} as T;
  const value: Record<string, unknown> = { ...item };
  for (const key of MANAGED_PROPERTY_KEYS) delete value[key];
  return value as T;
};

/**
 * Describes one committed mutation to an ArrayField value.
 *
 * Consumers backed by an array-aware form store can use this descriptor to
 * preserve index-based field metadata when an item is inserted, removed,
 * moved, or replaced.
 *
 * A move carries the row it moved as well as the two positions, because those
 * positions are not always read off the same list. A pointer drag takes `from`
 * when the pointer goes DOWN and `to` when it comes up, and the value can
 * change in between — a collaborator inserting a row, a save landing — after
 * which `from` numbers a list that no longer exists. A consumer replaying it
 * moves whichever row has since taken that place. The row itself is the only
 * part of the operation that survives the change, so it is what a consumer
 * resolving the move against its own data should use.
 */
export type ArrayFieldOperation<T> =
  | { type: 'insert'; index: number; item: T }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number; item: T }
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
 * What a consumer answers when it is told about a committed operation.
 *
 * `false` means the operation did not reach whatever the consumer commits to —
 * a document that refused the write, a row it could not resolve — and the list
 * then puts its rows back to the `value` it was given. Everything else means
 * the operation was taken, and the rows stay as the researcher just left them
 * until the new value arrives.
 *
 * It exists because this hook renders every mutation out of its OWN state
 * before the consumer is told about it, and re-reads `value` only when `value`
 * changes: a consumer that commits elsewhere — a stage document, say — can
 * refuse without the value changing at all, and the row the researcher added
 * would then stay on screen for good, belonging to no list.
 */
type ArrayFieldChangeAnswer = void | boolean;

type ItemsState<T extends Record<string, unknown>> = {
  items: WithItemProperties<T>[];
  editingId: string | null;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A row's content, as something a `Map` can be keyed on.
 *
 * Rows are plain data — what a form store holds — so `JSON.stringify` sees all
 * of it, with each object's keys put in order so that two rows written in
 * different key orders are still the same content.
 */
const contentKey = (item: unknown): string =>
  JSON.stringify(item, (_key: string, value: unknown) =>
    isPlainRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .toSorted()
            .map((key) => [key, value[key]]),
        )
      : value,
  ) ?? '';

/**
 * Which internal id each row of an arriving value inherits.
 *
 * A row carrying an id of its own — or one the id map already knows by object
 * reference — keeps it, and nothing below applies. Everything else is an
 * id-less row (an options list, an attribute list), whose identity has to be
 * inferred; the order the answers are tried in is the whole of it:
 *
 * 1. the row at the SAME position, while its content is unchanged. An
 *    immutable form store replaces the object containing a changed nested
 *    field, so a keystroke arrives as a new object at the same index with
 *    every other row identical — and keeping that position's id is what stops
 *    the row remounting and taking the caret with it.
 * 2. otherwise the same content ELSEWHERE. That is what a row arriving from a
 *    collaborator, an undo or a save looks like: every row past the insertion
 *    point is the same row one place along. Reusing ids by position there
 *    hands each row the id of its NEIGHBOUR, and a pointer drag holding one of
 *    those ids ends up naming a row the researcher never picked up — the drag
 *    finishes by moving it, and the consumer is told about a row it did not
 *    touch.
 * 3. otherwise the position's id, but only while every OTHER row is still
 *    exactly where it was and kept its own id. That is the keystroke of (1)
 *    seen from the other side — one row's content changed and nothing else
 *    moved — and it is the only shape in which the id at a position still
 *    names the row that is now at it. Once anything else has shifted, that id
 *    belongs to a row which has gone somewhere else, and handing it over would
 *    put an open editor or a drag in progress onto a row the researcher never
 *    touched. So a row arriving into a list that moved gets a NEW id: for a
 *    row with no id of its own, content is what carries it through an
 *    insertion above it, and a row whose content changed in the same arrival
 *    that moved it is one this hook cannot recognise.
 *
 * No id is handed out twice: two rows sharing one are a single row to React,
 * and to every consumer resolving an operation by it.
 */
const reuseInternalIds = <T extends Record<string, unknown>>(
  value: readonly T[],
  previousConfirmed: readonly WithItemProperties<T>[],
  knownIdOf: (item: T) => string | undefined,
): string[] => {
  const resolved: (string | undefined)[] = value.map(() => undefined);
  const claimed = new Set<string>();
  const claim = (index: number, id: string) => {
    resolved[index] = id;
    claimed.add(id);
  };

  value.forEach((item, index) => {
    const known = knownIdOf(item);
    if (known !== undefined) claim(index, known);
  });

  const previousKeys = previousConfirmed.map((item) =>
    contentKey(stripManagedProperties<T>(item)),
  );
  const arrivingKeys = value.map((item) => contentKey(item));

  value.forEach((_item, index) => {
    if (resolved[index] !== undefined) return;
    const previous = previousConfirmed[index];
    if (previous === undefined) return;
    if (previousKeys[index] !== arrivingKeys[index]) return;
    if (claimed.has(previous._internalId)) return;
    claim(index, previous._internalId);
  });

  const unclaimedByContent = new Map<string, string[]>();
  previousConfirmed.forEach((item, index) => {
    if (claimed.has(item._internalId)) return;
    const key = previousKeys[index]!;
    const queue = unclaimedByContent.get(key);
    if (queue === undefined) unclaimedByContent.set(key, [item._internalId]);
    else queue.push(item._internalId);
  });

  value.forEach((_item, index) => {
    if (resolved[index] !== undefined) return;
    const candidate = unclaimedByContent.get(arrivingKeys[index]!)?.shift();
    if (candidate !== undefined) claim(index, candidate);
  });

  /**
   * Whether the arriving list is the previous list with only this row's
   * content changed: the same number of rows, and every other one already
   * resolved to the id the previous list held at that same position.
   */
  const isTheOnlyRowThatChanged = (index: number): boolean =>
    value.length === previousConfirmed.length &&
    previousConfirmed.every(
      (previous, other) =>
        other === index || resolved[other] === previous._internalId,
    );

  return value.map((_item, index) => {
    const already = resolved[index];
    if (already !== undefined) return already;
    const positional = previousConfirmed[index]?._internalId;
    const id =
      positional !== undefined &&
      !claimed.has(positional) &&
      isTheOnlyRowThatChanged(index)
        ? positional
        : crypto.randomUUID();
    claimed.add(id);
    return id;
  });
};

/**
 * Return type for the useArrayFieldItems hook.
 */
type UseArrayFieldItemsReturn<T extends Record<string, unknown>> = {
  // ─── Items ───────────────────────────────────────────────────────────────
  /** All items (both confirmed and draft) with managed properties. */
  items: WithItemProperties<T>[];
  /**
   * Maps each committed (non-draft) item's internal ID to its position in the
   * last committed value. Unlike the live `items` order, this is unaffected by
   * an uncommitted reorder preview, so consumers that bind index-based field
   * paths can keep them pointing at the right item mid-drag.
   */
  committedIndexById: Map<string, number>;
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
  /**
   * Update a specific item by its internal ID without affecting editing state.
   *
   * Answers whether the id still named a row of this list. `false` is a write
   * that reached nothing — the row left the value while the caller was holding
   * on to its id, which is what an asynchronous edit does — and it is not the
   * same thing as a consumer refusing the operation the update reported: that
   * one reached a row, and the consumer answers for it (see `onChange`).
   */
  updateItem: (internalId: string, data: Partial<T>) => boolean;
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
  onChange?: (
    items: T[],
    operation: ArrayFieldOperation<T>,
  ) => ArrayFieldChangeAnswer,
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
  const [state, setState] = useState<ItemsState<T>>(() => ({
    items: value.map((item) => ({
      ...item,
      _internalId: getInternalId(item),
    })),
    editingId: null,
  }));
  const stateRef = useRef(state);
  const replaceState = useCallback((nextState: ItemsState<T>) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  /**
   * The state a value produces: its rows, each keeping the internal id the
   * list already knew it by (`reuseInternalIds`), plus the uncommitted draft
   * the value cannot know about.
   *
   * One function for both routes to it — a value arriving from the parent, and
   * a consumer answering that it did not apply an operation — so that the two
   * cannot come to disagree about which row is which.
   */
  const stateForValue = useCallback(
    (nextValue: T[], currentState: ItemsState<T>): ItemsState<T> => {
      const currentDraft = currentState.items.find(
        (item) => item._draft === true,
      );
      const previousConfirmed = currentState.items.filter(
        (item) => !item._draft,
      );

      const internalIds = reuseInternalIds(
        nextValue,
        previousConfirmed,
        getKnownInternalId,
      );
      const newConfirmed: WithItemProperties<T>[] = nextValue.map(
        (item, index) => {
          const internalId = internalIds[index]!;
          idMapRef.current.set(item, internalId);
          return { ...item, _internalId: internalId };
        },
      );

      // Merge: confirmed items from value + draft (if any)
      const newItems = currentDraft
        ? [...newConfirmed, currentDraft]
        : newConfirmed;

      // Clear editingId if the edited item no longer exists
      const editingStillExists =
        currentState.editingId === null ||
        newItems.some((item) => item._internalId === currentState.editingId);

      return {
        items: newItems,
        editingId: editingStillExists ? currentState.editingId : null,
      };
    },
    [getKnownInternalId],
  );

  const { items, editingId } = state;

  // Sync with external value changes
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    replaceState(stateForValue(value, stateRef.current));
  }

  // Map internal IDs to their position in the committed value. Derived from
  // `value` rather than the live `items`, so a local reorder preview (which
  // mutates `items` without notifying the parent) leaves these indices pointing
  // at each item's committed position until the reorder is committed.
  const committedIndexById = useMemo(() => {
    const map = new Map<string, number>();
    value.forEach((item, index) => {
      const internalId = getKnownInternalId(item);
      if (internalId !== undefined) {
        map.set(internalId, index);
      }
    });
    return map;
  }, [value, getKnownInternalId]);

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
        .map((item) => {
          const stripped = stripManagedProperties<T>(item);
          // Preserve the ID mapping for the stripped object so it's found on next render
          idMapRef.current.set(stripped, item._internalId);
          return stripped;
        });

      // The row an operation is ABOUT, named rather than only numbered. For a
      // move, `to` is where it has just landed among the committed rows, so it
      // is where the row itself is read from — and unlike `from`, which a
      // pointer drag captured against the list as it stood when the pointer
      // went down, both it and the row come from this same list. Which is also
      // why the ids that numbering rests on are reused by CONTENT rather than
      // by position when a value arrives mid-drag; see `reuseInternalIds`.
      let described: ArrayFieldOperation<T>;
      if (operation.type === 'remove') {
        described = operation;
      } else {
        const item =
          confirmedItems[
            operation.type === 'move' ? operation.to : operation.index
          ];
        if (item === undefined) return;
        described = { ...operation, item };
      }

      // A consumer that answers `false` did not apply the operation, and its
      // value will not change to say so. The rows go back to what that value
      // holds, because this hook drew the mutation out of its own state before
      // asking: left alone, a row an add put on screen stays there belonging
      // to no list, and every later edit of it is refused too.
      if (onChange?.(confirmedItems, described) === false) {
        replaceState(stateForValue(prevValueRef.current, stateRef.current));
      }
    },
    [onChange, replaceState, stateForValue],
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
      // Honour the item's OWN id when `getId` can supply one, the same way the
      // initial state and the external-value sync do. Minting an unrelated
      // internal id here reads as the same row only until the id surfaces in
      // `value` — at which point `getKnownInternalId` starts answering with the
      // item's id, the row's React key changes, and it remounts. For a row
      // whose children are form fields that is destructive: the replacement
      // mounts before the outgoing row's exit animation finishes, so the
      // outgoing row's unregister tears down the fields the new row has just
      // registered under the same names.
      const internalId = getInternalId(item);
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
    [getInternalId, notifyChange, replaceState],
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
    (internalId: string, data: Partial<T>): boolean => {
      const currentState = stateRef.current;
      const itemIndex = currentState.items.findIndex(
        (item) => item._internalId === internalId,
      );
      // The row this id named has left the list. Answered rather than merely
      // returned from: a caller holding an id across an await — a row editor
      // waiting on a host round trip — has no other way to find out that the
      // edit it is about to make has nowhere to land.
      if (itemIndex === -1) return false;

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
      return true;
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
    committedIndexById,
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
