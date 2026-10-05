import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  EverythingBarItem,
  EverythingBarProvider,
} from '../everythingBarModel';
import {
  addRecent,
  parseRecents,
  readRecents,
  useEverythingBarRecents,
  writeRecents,
  type EverythingBarRecentRef,
} from '../everythingBarRecents';

const ref = (providerId: string, itemId: string): EverythingBarRecentRef => ({
  providerId,
  itemId,
});

describe('parseRecents', () => {
  it('reads a stored list of references', () => {
    expect(
      parseRecents(
        '[{"providerId":"destinations","itemId":"study:st_42:settings"}]',
      ),
    ).toEqual([ref('destinations', 'study:st_42:settings')]);
  });

  it('yields nothing for a missing, empty or non-JSON store', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('')).toEqual([]);
    expect(parseRecents('{"providerId":')).toEqual([]);
  });

  it('drops entries that are not references, keeping the ones that are', () => {
    expect(
      parseRecents(
        '[{"providerId":"a","itemId":"1"},null,42,{"providerId":"b"},{"label":"Participants"}]',
      ),
    ).toEqual([ref('a', '1')]);
  });

  it('ignores a stored value that is not a list at all', () => {
    expect(parseRecents('{"providerId":"a","itemId":"1"}')).toEqual([]);
  });
});

describe('addRecent', () => {
  it('puts the newest activation first', () => {
    expect(addRecent([ref('a', '1')], ref('b', '2'), 5)).toEqual([
      ref('b', '2'),
      ref('a', '1'),
    ]);
  });

  it('moves a repeat activation to the front instead of duplicating it', () => {
    expect(addRecent([ref('a', '1'), ref('b', '2')], ref('b', '2'), 5)).toEqual(
      [ref('b', '2'), ref('a', '1')],
    );
  });

  it('separates two providers that use the same natural id', () => {
    expect(
      addRecent(
        [ref('commands', 'settings')],
        ref('destinations', 'settings'),
        5,
      ),
    ).toEqual([ref('destinations', 'settings'), ref('commands', 'settings')]);
  });

  it('stays within its bound, dropping the oldest', () => {
    const stored = [ref('a', '1'), ref('a', '2'), ref('a', '3')];

    expect(addRecent(stored, ref('a', '4'), 3)).toEqual([
      ref('a', '4'),
      ref('a', '1'),
      ref('a', '2'),
    ]);
  });
});

describe('storage access', () => {
  const key = 'fresco-ui:everything-bar:test';

  it('round-trips through localStorage', () => {
    writeRecents(key, [ref('destinations', 'team:tm_7:members')]);

    expect(readRecents(key)).toEqual([
      ref('destinations', 'team:tm_7:members'),
    ]);
  });

  it('reads nothing from a cleared store', () => {
    writeRecents(key, [ref('a', '1')]);
    window.localStorage.clear();

    expect(readRecents(key)).toEqual([]);
  });

  it('survives a store that throws on read and on write', () => {
    // Patched on the prototype: `window.localStorage` hands back a fresh
    // wrapper on every access, so patching the instance would leave the real
    // implementation in place and the assertions below vacuous.
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

    try {
      expect(readRecents(key)).toEqual([]);
      expect(() => writeRecents(key, [ref('a', '1')])).not.toThrow();
      expect(getItem).toHaveBeenCalled();
      expect(setItem).toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('useEverythingBarRecents', () => {
  const key = 'fresco-ui:everything-bar:reopen';

  const item: EverythingBarItem = {
    id: 'team:tm_7:activity',
    group: 'go-to',
    label: 'Activity log',
    rank: { tier: 1 },
    activate: { kind: 'navigate', href: '/team/tm_7/activity' },
  };

  /** Same reference, different label: proves WHICH resolution rendered. */
  const renamed: EverythingBarItem = {
    ...item,
    label: 'Activity log (2027)',
  };

  /** A provider whose `resolve` the test settles by hand. */
  function createProvider() {
    let settle: (value: EverythingBarItem | null) => void = () => undefined;
    const provider: EverythingBarProvider = {
      id: 'destinations',
      local: true,
      persistence: 'recents',
      items: () => [item],
      resolve: () =>
        new Promise<EverythingBarItem | null>((resolve) => {
          settle = resolve;
        }),
    };
    return {
      provider,
      settle: (value: EverythingBarItem | null) => settle(value),
    };
  }

  it('renders nothing until the CURRENT resolution succeeds, on every open', async () => {
    window.localStorage.setItem(
      key,
      JSON.stringify([{ providerId: 'destinations', itemId: item.id }]),
    );
    const first = createProvider();

    const { result, rerender } = renderHook(
      ({
        open,
        provider,
      }: {
        open: boolean;
        provider: EverythingBarProvider;
      }) =>
        useEverythingBarRecents({
          providers: [provider],
          open,
          storageKey: key,
        }),
      { initialProps: { open: true, provider: first.provider } },
    );

    expect(result.current.entries).toEqual([]);
    await act(async () => {
      first.settle(item);
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    rerender({ open: false, provider: first.provider });
    expect(result.current.entries).toEqual([]);

    // Reopening with the resolution still in flight must show nothing at all:
    // the previous resolution's row is exactly the stale, still-clickable
    // label this guards against.
    const second = createProvider();
    rerender({ open: true, provider: second.provider });
    expect(result.current.entries).toEqual([]);

    // …and the entry appears again only once THIS resolution answers.
    await act(async () => {
      second.settle(item);
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('re-resolves when a provider object is replaced while the bar is open', async () => {
    window.localStorage.setItem(
      key,
      JSON.stringify([{ providerId: 'destinations', itemId: item.id }]),
    );
    const before = createProvider();

    const { result, rerender } = renderHook(
      ({
        open,
        provider,
      }: {
        open: boolean;
        provider: EverythingBarProvider;
      }) =>
        useEverythingBarRecents({
          providers: [provider],
          open,
          storageKey: key,
        }),
      { initialProps: { open: true, provider: before.provider } },
    );

    await act(async () => {
      before.settle(item);
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // The app rebuilt its providers — permissions or the current team changed
    // — without closing the bar. The rows on screen were answered by sources
    // that no longer exist, so they go, and the new sources are asked.
    const after = createProvider();
    rerender({ open: true, provider: after.provider });
    expect(result.current.entries).toEqual([]);

    await act(async () => {
      after.settle(renamed);
    });
    await waitFor(() =>
      expect(result.current.entries[0]?.item.label).toBe('Activity log (2027)'),
    );
  });

  it('never lets a resolution from a replaced provider land', async () => {
    window.localStorage.setItem(
      key,
      JSON.stringify([{ providerId: 'destinations', itemId: item.id }]),
    );
    const stale = createProvider();

    const { result, rerender } = renderHook(
      ({ provider }: { provider: EverythingBarProvider }) =>
        useEverythingBarRecents({
          providers: [provider],
          open: true,
          storageKey: key,
        }),
      { initialProps: { provider: stale.provider } },
    );

    // Swap providers with the first resolution still in flight, then answer it
    // late: it belongs to a provider set this bar no longer has.
    const current = createProvider();
    rerender({ provider: current.provider });
    await act(async () => {
      stale.settle(item);
    });

    expect(result.current.entries).toEqual([]);

    await act(async () => {
      current.settle(renamed);
    });
    await waitFor(() =>
      expect(result.current.entries[0]?.item.label).toBe('Activity log (2027)'),
    );
  });

  it('drops an entry the provider no longer resolves, without rendering it first', async () => {
    window.localStorage.setItem(
      key,
      JSON.stringify([{ providerId: 'destinations', itemId: item.id }]),
    );
    const granted = createProvider();

    const { result, rerender } = renderHook(
      ({
        open,
        provider,
      }: {
        open: boolean;
        provider: EverythingBarProvider;
      }) =>
        useEverythingBarRecents({
          providers: [provider],
          open,
          storageKey: key,
        }),
      { initialProps: { open: true, provider: granted.provider } },
    );

    await act(async () => {
      granted.settle(item);
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    rerender({ open: false, provider: granted.provider });
    const revoked = createProvider();
    rerender({ open: true, provider: revoked.provider });

    expect(result.current.entries).toEqual([]);
    await act(async () => {
      revoked.settle(null);
    });
    await waitFor(() => expect(readRecents(key)).toEqual([]));
    expect(result.current.entries).toEqual([]);
  });
});
