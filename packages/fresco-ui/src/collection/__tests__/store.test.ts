import { describe, expect, it } from 'vitest';

import { createCollectionStore } from '../store';
import type { Key } from '../types';

type Item = { id: string; name: string };

const items: Item[] = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Carrot' },
];
const keyExtractor = (item: Item) => item.id;
const textValueExtractor = (item: Item) => item.name;

function makeStore() {
  const store = createCollectionStore<Item>();
  store.getState().setItems(items, keyExtractor, textValueExtractor);
  return store;
}

function filterTo(
  store: ReturnType<typeof makeStore>,
  matching: string[] | null,
) {
  store.getState().updateFilterState({
    filterMatchingKeys: matching === null ? null : new Set<Key>(matching),
  });
  store.getState().resortItems();
}

describe('collection store — focus after filtering (resortItems)', () => {
  it('moves focus to the first remaining item when the focused item is filtered out', () => {
    const store = makeStore();
    store.getState().setFocusedKey('c');

    filterTo(store, ['a']); // 'c' is filtered out

    expect(store.getState().orderedKeys).toEqual(['a']);
    expect(store.getState().focusedKey).toBe('a');
  });

  it('keeps focus on the focused item when it survives the filter', () => {
    const store = makeStore();
    store.getState().setFocusedKey('b');

    filterTo(store, ['a', 'b']); // 'b' still visible

    expect(store.getState().focusedKey).toBe('b');
  });

  it('clears focus when nothing matches the filter', () => {
    const store = makeStore();
    store.getState().setFocusedKey('a');

    filterTo(store, []); // no matches

    expect(store.getState().orderedKeys).toEqual([]);
    expect(store.getState().focusedKey).toBeNull();
  });

  it('restores focus when the filter is cleared', () => {
    const store = makeStore();
    store.getState().setFocusedKey('c');

    filterTo(store, ['a']); // focus clamps to 'a'
    expect(store.getState().focusedKey).toBe('a');

    filterTo(store, null); // clear filter — all items visible again
    expect(store.getState().orderedKeys).toEqual(['a', 'b', 'c']);
    // 'a' is still a valid item, so focus stays on it
    expect(store.getState().focusedKey).toBe('a');
  });

  it('leaves selection untouched when a selected item is filtered out', () => {
    const store = makeStore();
    store.getState().setSelectedKeys(new Set<Key>(['c']));
    store.getState().setFocusedKey('c');

    filterTo(store, ['a']); // 'c' filtered out of view

    // Focus clamps to a visible item, but selection persists so 'c' reappears
    // as selected once the filter is cleared.
    expect(store.getState().focusedKey).toBe('a');
    const selected = store.getState().selectedKeys;
    if (selected === 'all') throw new Error('expected an explicit selection');
    expect(selected.has('c')).toBe(true);
    expect(selected.size).toBe(1);
  });
});
