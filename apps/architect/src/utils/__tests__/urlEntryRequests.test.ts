import { afterEach, describe, expect, it, vi } from 'vitest';

const LEGACY_ID = '0b6c1f8e-6c0e-4d2a-9a51-2f7d3c9e8a10';
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
  it('keeps well-formed ids and every other parameter', async () => {
    const { parseUrlEntryRequests } = await load('/');
    expect(
      parseUrlEntryRequests(
        `?lang=es&upgrade=${LEGACY_ID}&import=${HANDOFF_KEY}`,
      ),
    ).toEqual({
      requests: { upgradeLegacyId: LEGACY_ID, importHandoffKey: HANDOFF_KEY },
      remainingSearch: '?lang=es',
    });
  });

  it.each([
    ['?upgrade=not-an-id'],
    ['?upgrade=../../etc'],
    [`?upgrade=${LEGACY_ID}x`],
    ['?import='],
    ['?import=%3Cscript%3E'],
  ])('drops a malformed value (%s)', async (search) => {
    const { parseUrlEntryRequests } = await load('/');
    expect(parseUrlEntryRequests(search)).toEqual({
      requests: { upgradeLegacyId: undefined, importHandoffKey: undefined },
      remainingSearch: '',
    });
  });
});

describe('captureUrlEntryRequests', () => {
  it('strips the parameters from the address and hands each out once', async () => {
    const module = await load(
      `/?upgrade=${LEGACY_ID}&import=${HANDOFF_KEY}&lang=es#top`,
    );

    module.captureUrlEntryRequests();

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?lang=es');
    expect(window.location.hash).toBe('#top');
    // The history entry's own state survives the rewrite.
    expect(window.history.state).toEqual({ kept: true });
    expect(module.takeUpgradeRequest()).toBe(LEGACY_ID);
    expect(module.takeUpgradeRequest()).toBeUndefined();
    expect(module.takeImportRequest()).toBe(HANDOFF_KEY);
    expect(module.takeImportRequest()).toBeUndefined();
  });

  it('strips a malformed request without acting on it', async () => {
    const module = await load('/?upgrade=nonsense');

    module.captureUrlEntryRequests();

    expect(window.location.search).toBe('');
    expect(module.takeUpgradeRequest()).toBeUndefined();
  });

  it('leaves an address without requests untouched', async () => {
    const module = await load('/protocol?lang=es');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    module.captureUrlEntryRequests();

    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?lang=es');
    replaceState.mockRestore();
  });

  it('reads the address only once', async () => {
    const module = await load(`/?upgrade=${LEGACY_ID}`);
    module.captureUrlEntryRequests();
    module.takeUpgradeRequest();

    window.history.replaceState(null, '', `/?upgrade=${LEGACY_ID}`);
    module.captureUrlEntryRequests();

    expect(module.takeUpgradeRequest()).toBeUndefined();
  });
});
