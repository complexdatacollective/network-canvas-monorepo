import { afterEach, describe, expect, it, vi } from 'vitest';

const HANDOFF_KEY = '5f0e1f8e-6c0e-4d2a-9a51-2f7d3c9e8a11';

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
  it('keeps a well-formed key and every other parameter', async () => {
    const { parseUrlEntryRequests } = await load('/');
    expect(parseUrlEntryRequests(`?lang=es&import=${HANDOFF_KEY}`)).toEqual({
      importHandoffKey: HANDOFF_KEY,
      fromArchitect: false,
      remainingSearch: '?lang=es',
    });
  });

  it.each([
    ['?import='],
    ['?import=not-a-key'],
    ['?import=%3Cscript%3E'],
    [`?import=${HANDOFF_KEY}x`],
    ['?import=../../etc'],
  ])('drops a malformed value (%s)', async (search) => {
    const { parseUrlEntryRequests } = await load('/');
    expect(parseUrlEntryRequests(search)).toEqual({
      importHandoffKey: undefined,
      fromArchitect: false,
      remainingSearch: '',
    });
  });

  it('reads an Architect sender and drops any other', async () => {
    const { parseUrlEntryRequests } = await load('/');
    expect(parseUrlEntryRequests('?from=architect&lang=es')).toEqual({
      importHandoffKey: undefined,
      fromArchitect: true,
      remainingSearch: '?lang=es',
    });
    expect(parseUrlEntryRequests('?from=elsewhere')).toEqual({
      importHandoffKey: undefined,
      fromArchitect: false,
      remainingSearch: '',
    });
  });
});

describe('captureUrlEntryRequests', () => {
  it('strips the parameter from the address and hands the key out once', async () => {
    const mod = await load(`/?import=${HANDOFF_KEY}&lang=fr#top`);
    mod.captureUrlEntryRequests();

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?lang=fr');
    expect(window.location.hash).toBe('#top');
    // History state belongs to the router; it is kept.
    expect(window.history.state).toEqual({ kept: true });

    expect(mod.takeImportRequest()).toBe(HANDOFF_KEY);
    expect(mod.takeImportRequest()).toBeUndefined();
  });

  it('strips a malformed value without acting on it', async () => {
    const mod = await load('/?import=nope');
    mod.captureUrlEntryRequests();
    expect(window.location.search).toBe('');
    expect(mod.takeImportRequest()).toBeUndefined();
  });

  it('strips an Architect sender and answers it once', async () => {
    const mod = await load('/?from=architect#top');
    mod.captureUrlEntryRequests();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#top');
    expect(mod.takeArchitectRequest()).toBe(true);
    expect(mod.takeArchitectRequest()).toBe(false);
    expect(mod.takeImportRequest()).toBeUndefined();
  });

  it('reads the address only once per page', async () => {
    const mod = await load('/');
    mod.captureUrlEntryRequests();
    window.history.replaceState(null, '', `/?import=${HANDOFF_KEY}`);
    mod.captureUrlEntryRequests();
    expect(mod.takeImportRequest()).toBeUndefined();
    expect(window.location.search).toBe(`?import=${HANDOFF_KEY}`);
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
