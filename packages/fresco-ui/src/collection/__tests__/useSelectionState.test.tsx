import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CollectionProvider } from '../CollectionProvider';
import { useCollectionStoreApi } from '../contexts';
import { useSelectionState } from '../hooks/useSelectionState';
import type { CollectionStoreApi } from '../store';
import type { Key } from '../types';

type Item = { id: string; name: string };

const ITEMS: Item[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

function Probe({
  disabledKeys,
  storeRef,
}: {
  disabledKeys?: Key[];
  storeRef: { current: CollectionStoreApi<unknown> | null };
}) {
  useSelectionState({ selectionMode: 'multiple', disabledKeys });
  storeRef.current = useCollectionStoreApi();
  return null;
}

function Harness({
  disabledKeys,
  storeRef,
}: {
  disabledKeys?: Key[];
  storeRef: { current: CollectionStoreApi<unknown> | null };
}) {
  return (
    <CollectionProvider
      items={ITEMS}
      keyExtractor={(item) => item.id}
      textValueExtractor={(item) => item.name}
    >
      <Probe disabledKeys={disabledKeys} storeRef={storeRef} />
    </CollectionProvider>
  );
}

describe('useSelectionState disabledKeys sync', () => {
  it('clears the store set when the prop becomes undefined', () => {
    const storeRef: { current: CollectionStoreApi<unknown> | null } = {
      current: null,
    };
    const { rerender } = render(
      <Harness disabledKeys={['a']} storeRef={storeRef} />,
    );
    expect(storeRef.current?.getState().disabledKeys).toEqual(new Set(['a']));

    // Passing undefined must re-enable everything, not leave a stale set —
    // consumers toggle between a populated array and undefined (e.g.
    // NameGeneratorRoster after maxNodes headroom returns or an encrypted
    // roster unlocks).
    rerender(<Harness storeRef={storeRef} />);
    expect(storeRef.current?.getState().disabledKeys).toEqual(new Set());

    rerender(<Harness disabledKeys={['b']} storeRef={storeRef} />);
    expect(storeRef.current?.getState().disabledKeys).toEqual(new Set(['b']));
  });
});
