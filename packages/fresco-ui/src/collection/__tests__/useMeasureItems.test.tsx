import { act, render, waitFor } from '@testing-library/react';
import { useLayoutEffect, useMemo, useState } from 'react';
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
 * Rebuilds the collection identity on every `version` bump, mirroring an
 * upstream memo that produces a fresh items array per store update. With
 * `hijack`, the first bump schedules a second one from a layout effect, so
 * the second identity change lands in the very commit where the hook is
 * recovering from the first — the interleaving a burst of store updates
 * produces (parent layout effects run after the hook's own).
 */
function Parent({
  start,
  hijack,
}: {
  start: { current: (() => void) | null };
  hijack: boolean;
}) {
  const [version, setVersion] = useState(0);
  start.current = () => setVersion(1);
  const collection = useMemo(() => {
    void version; // referenced so each bump rebuilds the collection identity
    return makeCollection(IDS);
  }, [version]);
  const layout = useMemo(() => new ListLayout<Item>(), []);
  useLayoutEffect(() => {
    if (hijack && version === 1) setVersion(2);
  }, [hijack, version]);
  return <Harness collection={collection} layout={layout} />;
}

const mountAndSettle = async (hijack: boolean) => {
  const start = { current: null as (() => void) | null };
  render(<Parent start={start} hijack={hijack} />);
  // Flush the ResizeObserver mock's one-shot sentinel callback (fires with a
  // synthetic 800×600 rect, invalidating the first measurement) so the hook
  // reaches a stable completed state before the test manipulates it.
  await act(async () => {});
  await waitFor(() => expect(lastResult.isComplete).toBe(true));
  return start;
};

describe('useMeasureItems', () => {
  it('re-measures after a single collection identity change', async () => {
    const start = await mountAndSettle(false);

    act(() => start.current?.());

    await waitFor(() => expect(lastResult.isComplete).toBe(true));
    expect(lastResult.measurements.size).toBe(IDS.length);
  });

  it('re-measures when a second identity change lands in the recovery commit', async () => {
    const start = await mountAndSettle(true);

    act(() => start.current?.());

    // Without a re-measure trigger in the reset path, the second change wipes
    // the measurements the recovery commit just took, and no dependency of
    // the measurement effect changes afterwards — the hook wedges with
    // isComplete=false and an empty map, so the renderer draws zero rows.
    await waitFor(() => expect(lastResult.isComplete).toBe(true));
    expect(lastResult.measurements.size).toBe(IDS.length);
  });
});
