import { act, render, waitFor } from '@testing-library/react';
import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { describe, expect, it } from 'vitest';

import { useMeasureItems } from '../hooks/useMeasureItems';
import { ListLayout } from '../layout/ListLayout';
import type { Collection, Key, Node } from '../types';

type Item = { id: string };

const IDS = ['a', 'b', 'c'];

function makeCollection(ids: string[]): Collection<Item> {
  const nodes = new Map<Key, Node<Item>>(
    ids.map((id, index) => [
      id,
      { key: id, type: 'item', value: { id }, textValue: id, index, level: 0 },
    ]),
  );
  return {
    size: ids.length,
    getKeys: () => ids,
    getItem: (key) => nodes.get(key),
    getFirstKey: () => ids[0] ?? null,
    getLastKey: () => ids.at(-1) ?? null,
    getKeyBefore: (key) => ids[ids.indexOf(String(key)) - 1] ?? null,
    getKeyAfter: (key) => ids[ids.indexOf(String(key)) + 1] ?? null,
    [Symbol.iterator]: () => nodes.values(),
  };
}

let lastResult: ReturnType<typeof useMeasureItems<Item>>;

function Harness({
  collection,
  layout,
}: {
  collection: Collection<Item>;
  layout: ListLayout<Item>;
}) {
  lastResult = useMeasureItems({
    collection,
    layout,
    renderItem: (item: Item) => <div>{item.id}</div>,
    containerWidth: 500,
  });
  return <div>{lastResult.measurementContainer}</div>;
}

/**
 * An external store holding the collection version, standing in for the
 * collection store whose updates produce fresh items arrays.
 */
function createVersionStore() {
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    getVersion: () => version,
    setVersion: (next: number) => {
      version = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type VersionStore = ReturnType<typeof createVersionStore>;

/**
 * Rebuilds the collection identity on every `version` bump, mirroring an
 * upstream memo that produces a fresh items array per store update. With
 * `hijack`, the first bump makes a second store update from a layout effect,
 * so the second identity change lands in the very commit where the hook is
 * recovering from the first — the interleaving a burst of store updates
 * produces (parent layout effects run after the hook's own).
 */
function Parent({
  versionStore,
  hijack,
}: {
  versionStore: VersionStore;
  hijack: boolean;
}) {
  const version = useSyncExternalStore(
    versionStore.subscribe,
    versionStore.getVersion,
  );
  const collection = useMemo(() => {
    void version; // referenced so each bump rebuilds the collection identity
    return makeCollection(IDS);
  }, [version]);
  const layout = useMemo(() => new ListLayout<Item>(), []);
  // Updating the store from a layout effect IS the thing under test: it is the
  // only way to land the second identity change in the commit that is
  // recovering from the first. Deriving it during render would schedule the
  // bump before the hook's own layout effect and reproduce nothing.
  useLayoutEffect(() => {
    if (hijack && version === 1) versionStore.setVersion(2);
  }, [hijack, version, versionStore]);
  return <Harness collection={collection} layout={layout} />;
}

const mountAndSettle = async (hijack: boolean) => {
  const versionStore = createVersionStore();
  render(<Parent versionStore={versionStore} hijack={hijack} />);
  // Flush the ResizeObserver mock's one-shot sentinel callback (fires with a
  // synthetic 800×600 rect, invalidating the first measurement) so the hook
  // reaches a stable completed state before the test manipulates it.
  await act(async () => {});
  await waitFor(() => expect(lastResult.isComplete).toBe(true));
  return versionStore;
};

describe('useMeasureItems', () => {
  it('re-measures after a single collection identity change', async () => {
    const versionStore = await mountAndSettle(false);

    act(() => versionStore.setVersion(1));

    await waitFor(() => expect(lastResult.isComplete).toBe(true));
    expect(lastResult.measurements.size).toBe(IDS.length);
  });

  it('re-measures when a second identity change lands in the recovery commit', async () => {
    const versionStore = await mountAndSettle(true);

    act(() => versionStore.setVersion(1));

    // Without a re-measure trigger in the reset path, the second change wipes
    // the measurements the recovery commit just took, and no dependency of
    // the measurement effect changes afterwards — the hook wedges with
    // isComplete=false and an empty map, so the renderer draws zero rows.
    await waitFor(() => expect(lastResult.isComplete).toBe(true));
    expect(lastResult.measurements.size).toBe(IDS.length);
  });
});
