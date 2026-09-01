import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  EverythingBarItem,
  EverythingBarProvider,
  EverythingBarSearchPage,
} from '../everythingBarModel';
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

    // Only the id differs — the invalidation key is (id, object identity), so
    // the spread keeps the factory's remote shape without re-stating it.
    const addedProvider: EverythingBarProvider = {
      ...createProvider(added),
      id: 'documentation',
    };
    rerender({ providers: [keptProvider, addedProvider] });
    await waitFor(() => expect(added).toEqual(['par']));
    expect(kept).toEqual(['par', 'par']);

    rerender({ providers: [keptProvider] });
    await waitFor(() => expect(kept).toEqual(['par', 'par', 'par']));
    expect(added).toEqual(['par']);
  });
});

describe('useEverythingBarResults session isolation', () => {
  const item: EverythingBarItem = {
    id: 'study:st_42',
    group: 'go-to',
    label: 'Community Recovery Panel 2027',
    rank: { tier: 0 },
    activate: { kind: 'navigate', href: '/study/st_42' },
  };

  /** A provider whose every search the test settles by hand. */
  function createSettleableProvider() {
    const calls: Array<(page: EverythingBarSearchPage) => void> = [];
    const provider: EverythingBarProvider = {
      id: 'entities',
      local: false,
      groups: ['go-to'],
      persistence: 'never',
      search: () =>
        new Promise<EverythingBarSearchPage>((resolve) => {
          calls.push(resolve);
        }),
    };
    return {
      provider,
      calls,
      settle: (page: EverythingBarSearchPage) => calls.at(-1)?.(page),
    };
  }

  const rowLabels = (
    sections: ReturnType<typeof useEverythingBarResults>['sections'],
  ) =>
    sections
      .flatMap((section) => section.rows)
      .flatMap((row) => (row.kind === 'item' ? [row.entry.item.label] : []));

  it("cannot show a closed session's results when it is reopened", async () => {
    const first = createSettleableProvider();

    const { result, rerender } = renderHook(
      ({
        open,
        provider,
      }: {
        open: boolean;
        provider: EverythingBarProvider;
      }) =>
        useEverythingBarResults({
          providers: [provider],
          open,
          query: 'panel',
          recents: [],
          debounceMs: 0,
        }),
      { initialProps: { open: true, provider: first.provider } },
    );

    await act(async () => {
      first.settle({ items: [item] });
    });
    await waitFor(() =>
      expect(rowLabels(result.current.sections)).toEqual([item.label]),
    );

    rerender({ open: false, provider: first.provider });
    expect(rowLabels(result.current.sections)).toEqual([]);

    // Reopened with the new search still in flight: anything rendered now
    // could only have come from the session that just closed.
    const second = createSettleableProvider();
    rerender({ open: true, provider: second.provider });
    expect(rowLabels(result.current.sections)).toEqual([]);

    // The reopen issues its own search, and only ITS answer may render.
    await waitFor(() => expect(second.calls.length).toBeGreaterThan(0));
    await act(async () => {
      second.settle({ items: [{ ...item, label: 'Answered this session' }] });
    });
    await waitFor(() =>
      expect(rowLabels(result.current.sections)).toEqual([
        'Answered this session',
      ]),
    );
  });

  it('discards a response the network hands over after the bar closed', async () => {
    const provider = createSettleableProvider();

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useEverythingBarResults({
          providers: [provider.provider],
          open,
          query: 'panel',
          recents: [],
          debounceMs: 0,
        }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(provider.calls.length).toBeGreaterThan(0));
    rerender({ open: false });
    // Aborting cannot revoke a promise the network already fulfilled.
    await act(async () => {
      provider.settle({ items: [item] });
    });

    expect(rowLabels(result.current.sections)).toEqual([]);
    rerender({ open: true });
    expect(rowLabels(result.current.sections)).toEqual([]);
  });
});
