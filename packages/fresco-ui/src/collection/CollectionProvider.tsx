'use client';

import { type ReactNode, useEffect, useEffectEvent, useState } from 'react';

import { CollectionStoreContext } from './contexts';
import {
  type CollectionSeed,
  type CollectionStoreApi,
  createSeededCollectionStore,
} from './store';
import type { KeyExtractor, TextValueExtractor } from './types';

type CollectionProviderProps<T> = {
  /** Items to populate the collection with */
  items: T[];
  /** Function to extract unique key from each item */
  keyExtractor: KeyExtractor<T>;
  /** Function to extract text value for type-ahead search and accessibility */
  textValueExtractor: TextValueExtractor<T>;
  /**
   * The sort, disabled keys and selection the collection starts with,
   * applied to the seeded items so the first render (including server
   * output) already reflects them rather than waiting for client effects.
   */
  seed?: CollectionSeed;
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
  seed,
  children,
}: CollectionProviderProps<T>) {
  // Create the store once, seeded so the first render — including server and
  // static output — already contains the items, in their initial sort order,
  // instead of the empty state.
  const [store] = useState(() =>
    createSeededCollectionStore(items, keyExtractor, textValueExtractor, seed),
  );

  // Reads the latest key extractor without making it an effect dependency: a
  // key identifies its item, so it changes only with the items.
  const syncItems = useEffectEvent(
    (nextItems: T[], nextTextValueExtractor: TextValueExtractor<T>) => {
      store
        .getState()
        .setItems(nextItems, keyExtractor, nextTextValueExtractor);
    },
  );

  // The text an item is typed ahead by can change while the item does not
  // (a name decrypting), so a new text extractor is read again. Pass a stable
  // one: a new function on every render rebuilds the collection every time.
  useEffect(() => {
    syncItems(items, textValueExtractor);
  }, [items, textValueExtractor]);

  return (
    <CollectionStoreContext.Provider
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the context type erases the item type so one context serves every Provider<T>
      value={store as CollectionStoreApi<unknown>}
    >
      {children}
    </CollectionStoreContext.Provider>
  );
}
