import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CollectionProvider } from '../CollectionProvider';
import { useFilterState } from '../hooks/useFilterState';
import { useSelectionState } from '../hooks/useSelectionState';
import { useSortState } from '../hooks/useSortState';

type Item = { id: string; name: string };

const ITEMS: Item[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];
const keyExtractor = (item: Item) => item.id;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <CollectionProvider
      items={ITEMS}
      keyExtractor={keyExtractor}
      textValueExtractor={(item) => item.name}
    >
      {children}
    </CollectionProvider>
  );
}

// Each manager is created once per collection, so what it calls back must be
// the callback the host passed most recently, not the one it was created with.
describe('collection managers call the latest callback', () => {
  it('reports a selection change to the newest onSelectionChange', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(
      ({ onSelectionChange }) =>
        useSelectionState({ selectionMode: 'multiple', onSelectionChange }),
      { wrapper: Wrapper, initialProps: { onSelectionChange: first } },
    );

    rerender({ onSelectionChange: latest });
    act(() => result.current.toggleSelection('a'));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith(new Set(['a']));
  });

  it('reports a sort change to the newest onSortChange', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(
      ({ onSortChange }) => useSortState({ onSortChange }),
      { wrapper: Wrapper, initialProps: { onSortChange: first } },
    );

    rerender({ onSortChange: latest });
    act(() => result.current.sortBy('name', 'string'));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(
      expect.objectContaining({ property: 'name' }),
    );
  });

  it('reports a query and its results to the newest filter callbacks', async () => {
    const firstQuery = vi.fn();
    const firstResults = vi.fn();
    const latestQuery = vi.fn();
    const latestResults = vi.fn();
    const { result, rerender } = renderHook(
      ({ onFilterChange, onFilterResultsChange }) =>
        useFilterState({
          items: ITEMS,
          keyExtractor,
          filterKeys: ['name'],
          filterExecution: 'sync',
          filterDebounceMs: 0,
          onFilterChange,
          onFilterResultsChange,
        }),
      {
        wrapper: Wrapper,
        initialProps: {
          onFilterChange: firstQuery,
          onFilterResultsChange: firstResults,
        },
      },
    );

    rerender({
      onFilterChange: latestQuery,
      onFilterResultsChange: latestResults,
    });
    act(() => result.current?.setQuery('Alpha'));

    expect(latestQuery).toHaveBeenCalledWith('Alpha');
    await waitFor(() => expect(latestResults).toHaveBeenCalled());
    expect(firstQuery).not.toHaveBeenCalled();
    expect(firstResults).not.toHaveBeenCalled();
  });
});
