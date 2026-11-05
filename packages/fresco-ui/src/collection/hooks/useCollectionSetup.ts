'use client';

import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  DroppableCollectionResult,
  DroppableCollectionState,
} from '../dnd/types';
import { useSelectableCollection } from '../keyboard/useSelectableCollection';
import type { Layout } from '../layout/Layout';
import type { SelectionManager } from '../selection/SelectionManager';
import type {
  Collection,
  CollectionProps,
  Key,
  Node,
  SelectionMode,
} from '../types';
import { useCollectionData } from './useCollection';
import { useSelectionState } from './useSelectionState';

type UseCollectionSetupOptions = {
  selectionMode?: SelectionMode;
  selectedKeys?: Iterable<Key>;
  defaultSelectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  disabledKeys?: Iterable<Key>;
  disallowEmptySelection?: boolean;
  dragAndDropHooks?: CollectionProps<unknown>['dragAndDropHooks'];
  layout: Layout;
  collectionId?: string;
};

type UseCollectionSetupResult<T> = {
  collection: Collection<T>;
  selectionManager: SelectionManager;
  disabledKeysSet: Set<Key>;
  collectionProps: ReturnType<
    typeof useSelectableCollection
  >['collectionProps'];
  dndCollectionProps: Record<string, unknown>;
  /** Attach to the same element as `containerRef`: it tells the hook when the
   * container is mounted, so its width can be measured. */
  containerCallbackRef: (element: HTMLElement | null) => void;
  /** Drop state for collection container styling (when onDrop is configured) */
  dropState: DroppableCollectionState | null;
};

/**
 * Hook that encapsulates the shared setup logic for collections.
 * Handles selection state, keyboard navigation, and drag-and-drop setup.
 *
 * @param options - Selection, keyboard, and DnD configuration
 * @param containerRef - Ref to the collection container element
 * @returns Collection setup result with managers and props
 */
export function useCollectionSetup<T>(
  options: UseCollectionSetupOptions,
  containerRef: RefObject<HTMLElement | null> | null,
): UseCollectionSetupResult<T> {
  const collection = useCollectionData<T>();

  // Track container width for grid column calculation
  const [containerWidth, setContainerWidth] = useState<number | undefined>(
    undefined,
  );

  // The container element, held in state so the effects below run again when
  // it appears. It can mount after the hook does: a caller's render prop may
  // leave the collection's elements out at first, and a ref alone would never
  // tell an effect that it had been attached since.
  const [containerElement, setContainerElement] = useState<HTMLElement | null>(
    null,
  );
  // The width is read as the element attaches, so the first layout pass that
  // has an element already has its width.
  const containerCallbackRef = useCallback((element: HTMLElement | null) => {
    setContainerElement(element);
    const initialWidth = element?.offsetWidth ?? 0;
    if (initialWidth > 0) setContainerWidth(initialWidth);
  }, []);

  // Track container width using ResizeObserver. Intentionally does not depend
  // on `containerWidth`: the effect sets `containerWidth` but never reads it,
  // so including it in deps would cause the ResizeObserver to
  // disconnect/reconnect on every width change.
  useEffect(() => {
    if (!containerElement) return undefined;

    // Watch for size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });

    resizeObserver.observe(containerElement);
    return () => resizeObserver.disconnect();
  }, [containerElement]);

  // Set container ref on layout for DOM-based position queries
  // This allows layouts like InlineGridLayout to query actual item positions
  const collectionId = options.collectionId ?? 'collection';
  useEffect(() => {
    if (!containerRef || !containerElement) return;

    options.layout.setContainerRef(containerRef, collectionId);
  }, [options.layout, containerRef, collectionId, containerElement]);

  const selectionManager = useSelectionState({
    selectionMode: options.selectionMode,
    selectedKeys: options.selectedKeys,
    defaultSelectedKeys: options.defaultSelectedKeys,
    onSelectionChange: options.onSelectionChange,
    disabledKeys: options.disabledKeys,
    disallowEmptySelection: options.disallowEmptySelection,
  });

  // Convert disabledKeys prop to Set for keyboard delegate
  const disabledKeysSet = useMemo(
    () =>
      options.disabledKeys
        ? new Set<Key>(options.disabledKeys)
        : new Set<Key>(),
    [options.disabledKeys],
  );

  // Create keyboard delegate for navigation using layout-specific implementation
  // Pass containerWidth so GridLayout can calculate the correct column count
  const keyboardDelegate = useMemo(() => {
    // First update the layout with the current items and container width for
    // spatial navigation. This populates layoutInfos so SpatialKeyboardDelegate
    // can use item positions, and the renderers below read the same layout.
    if (containerWidth !== undefined && containerWidth > 0) {
      // Build items map and ordered keys from collection
      // Collection nodes are already Node<T> objects with all required properties
      const items = new Map<Key, Node<unknown>>();
      const orderedKeys: Key[] = [];
      for (const node of collection) {
        items.set(node.key, node as Node<unknown>);
        orderedKeys.push(node.key);
      }

      options.layout.setItems(items, orderedKeys);
      options.layout.update({ containerWidth });
    }

    return options.layout.getKeyboardDelegate(
      collection,
      disabledKeysSet,
      containerWidth,
    );
  }, [options.layout, collection, disabledKeysSet, containerWidth]);

  // Setup keyboard navigation
  const { collectionProps } = useSelectableCollection({
    selectionManager,
    keyboardDelegate,
    ref: containerRef,
    disallowEmptySelection: options.disallowEmptySelection,
  });

  // Get collection-level drop state and props if hooks provided (for onDrop).
  // Whether the hook is provided never changes while this is mounted:
  // Collection keys its content on it (see `dragAndDropHooksInUse`).
  const dropResult: DroppableCollectionResult | null = options.dragAndDropHooks
    ?.useDroppableCollectionState
    ? // oxlint-disable-next-line react/hooks -- called on every render or on none: Collection remounts its content when the hook comes or goes
      options.dragAndDropHooks.useDroppableCollectionState(collectionId)
    : null;

  return {
    collection,
    selectionManager,
    disabledKeysSet,
    collectionProps,
    dndCollectionProps: dropResult?.dropProps ?? {},
    containerCallbackRef,
    dropState: dropResult?.state ?? null,
  };
}
