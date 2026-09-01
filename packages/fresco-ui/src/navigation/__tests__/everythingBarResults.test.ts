import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EverythingBarProvider } from '../everythingBarModel';
import { useEverythingBarResults } from '../useEverythingBarResults';

/**
 * A remote provider that records every query it is asked. Each call to this
 * factory returns a NEW object with the same id — which is exactly what an app
 * does when the context its providers close over changes.
 */
function createProvider(calls: string[]): EverythingBarProvider {
  return {
    id: 'entities',
    local: false,
    groups: ['go-to'],
    persistence: 'never',
    search: (query) => {
      calls.push(query);
      return Promise.resolve({ items: [] });
    },
  };
}

const renderResults = (providers: EverythingBarProvider[]) =>
  renderHook(
    ({ providers: current }: { providers: EverythingBarProvider[] }) =>
      useEverythingBarResults({
        providers: current,
        open: true,
        query: 'par',
        recents: [],
        debounceMs: 0,
      }),
    { initialProps: { providers } },
  );

describe('useEverythingBarResults provider invalidation', () => {
  it('searches again when a provider object is replaced, even under the same id', async () => {
    const calls: string[] = [];
    const { rerender } = renderResults([createProvider(calls)]);
    await waitFor(() => expect(calls).toEqual(['par']));

    // A new object with the same id: the app rebuilt its providers because
    // what they can see changed. Leaving the old results up would leave a
    // previous context's rows on screen and activatable.
    rerender({ providers: [createProvider(calls)] });

    await waitFor(() => expect(calls).toEqual(['par', 'par']));
  });

  it('does not search again while the provider objects are the same', async () => {
    const calls: string[] = [];
    const provider = createProvider(calls);
    const { rerender } = renderResults([provider]);
    await waitFor(() => expect(calls).toEqual(['par']));

    // A fresh array literal holding the same provider on every render is the
    // ordinary consumer shape, and must not turn into a search per render.
    rerender({ providers: [provider] });
    rerender({ providers: [provider] });
    rerender({ providers: [provider] });

    await waitFor(() => expect(calls).toEqual(['par']));
    expect(calls).toEqual(['par']);
  });

  it('searches again when a provider is added, and stops asking one that is removed', async () => {
    const kept: string[] = [];
    const added: string[] = [];
    const keptProvider = createProvider(kept);
    const { rerender } = renderResults([keptProvider]);
    await waitFor(() => expect(kept).toEqual(['par']));

    const addedProvider: EverythingBarProvider = {
      ...createProvider(added),
      id: 'documentation',
      groups: ['documentation'],
    };
    rerender({ providers: [keptProvider, addedProvider] });
    await waitFor(() => expect(added).toEqual(['par']));
    expect(kept).toEqual(['par', 'par']);

    rerender({ providers: [keptProvider] });
    await waitFor(() => expect(kept).toEqual(['par', 'par', 'par']));
    expect(added).toEqual(['par']);
  });
});
