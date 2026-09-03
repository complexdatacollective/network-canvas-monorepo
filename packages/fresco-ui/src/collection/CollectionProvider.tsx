'use client';

import { type ReactNode, useEffect, useRef } from 'react';

import { CollectionStoreContext } from './contexts';
import type { SortRule } from './sorting/types';
import { type CollectionStoreApi, createSeededCollectionStore } from './store';
import type { Key, KeyExtractor, TextValueExtractor } from './types';

type CollectionProviderProps<T> = {
  /** Items to populate the collection with */
  items: T[];
  /** Function to extract unique key from each item */
  keyExtractor: KeyExtractor<T>;
  /** Function to extract text value for type-ahead search and accessibility */
  textValueExtractor: TextValueExtractor<T>;
  /**
   * The sort the collection starts with, applied to the seeded items so the
   * first render (including server output) is already in order.
   */
  initialSortRules?: SortRule[];
  /**
   * Keys disabled from the first render, so server output already carries
   * the disabled semantics rather than waiting for the client effect.
   */
  initialDisabledKeys?: Iterable<Key>;
  /** Child components */
  children: ReactNode;
};

/**
 * Provider component that creates and manages the collection store.
 * Wrap your Collection and related components with this provider.
 *
 * @example
 * ```tsx
 * <CollectionProvider items={data} keyExtractor={(item) => item.id}>
 *   <Collection renderItem={(item) => <div>{item.name}</div>} />
 * </CollectionProvider>
 * ```
 */
export function CollectionProvider<T>({
  items,
  keyExtractor,
  textValueExtractor,
  initialSortRules,
  initialDisabledKeys,
  children,
}: CollectionProviderProps<T>) {
  const storeRef = useRef<CollectionStoreApi<T> | null>(null);
  const keyExtractorRef = useRef(keyExtractor);
  const textValueExtractorRef = useRef(textValueExtractor);

  // Update refs when functions change
  keyExtractorRef.current = keyExtractor;
  textValueExtractorRef.current = textValueExtractor;

  // Create the store once, seeded so the first render — including server and
  // static output — already contains the items, in their initial sort order,
  // instead of the empty state.
  storeRef.current ??= createSeededCollectionStore(
    items,
    keyExtractor,
    textValueExtractor,
    initialSortRules,
    initialDisabledKeys,
  );

  // Update items when they change
  useEffect(() => {
    storeRef.current
      ?.getState()
      .setItems(items, keyExtractorRef.current, textValueExtractorRef.current);
  }, [items]);

  return (
    <CollectionStoreContext.Provider
      value={storeRef.current as CollectionStoreApi<unknown>}
    >
      {children}
    </CollectionStoreContext.Provider>
  );
}
