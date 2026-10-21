import { afterEach, describe, expect, it, vi } from 'vitest';

// The module captures once per page, so each test loads a fresh copy.
const load = async (url: string) => {
  window.history.replaceState({ kept: true }, '', url);
  vi.resetModules();
  return await import('../urlEntryRequests');
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('parseUrlEntryRequests', () => {
  it('reads an Architect sender and keeps every other parameter', async () => {
    const { parseUrlEntryRequests } = await load('/');
    expect(parseUrlEntryRequests('?from=architect&lang=es')).toEqual({
      fromArchitect: true,
      remainingSearch: '?lang=es',
    });
  });

  it.each([['?from='], ['?from=elsewhere'], ['?from=Architect']])(
    'drops any other sender (%s)',
    async (search) => {
      const { parseUrlEntryRequests } = await load('/');
      expect(parseUrlEntryRequests(search)).toEqual({
        fromArchitect: false,
        remainingSearch: '',
      });
    },
  );
});

describe('captureUrlEntryRequests', () => {
  it('strips an Architect sender from the address and answers it once', async () => {
    const mod = await load('/?from=architect&lang=fr#top');
    mod.captureUrlEntryRequests();

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?lang=fr');
    expect(window.location.hash).toBe('#top');
    // History state belongs to the router; it is kept.
    expect(window.history.state).toEqual({ kept: true });

    expect(mod.takeArchitectRequest()).toBe(true);
    expect(mod.takeArchitectRequest()).toBe(false);
  });

  it('strips another sender without acting on it', async () => {
    const mod = await load('/?from=elsewhere');
    mod.captureUrlEntryRequests();
    expect(window.location.search).toBe('');
    expect(mod.takeArchitectRequest()).toBe(false);
  });

  it('reads the address only once per page', async () => {
    const mod = await load('/');
    mod.captureUrlEntryRequests();
    window.history.replaceState(null, '', '/?from=architect');
    mod.captureUrlEntryRequests();
    expect(mod.takeArchitectRequest()).toBe(false);
    expect(window.location.search).toBe('?from=architect');
  });

  it('leaves an address without the parameter exactly as it is', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const mod = await load('/data?lang=es');
    replaceState.mockClear();
    mod.captureUrlEntryRequests();
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });
});
