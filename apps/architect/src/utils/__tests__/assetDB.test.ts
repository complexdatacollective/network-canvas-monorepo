import { afterEach, describe, expect, it, vi } from 'vitest';

const appBase = vi.hoisted(() => ({ isSubpath: false }));

vi.mock('~/utils/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return appBase.isSubpath;
  },
}));

import { assetDb, clearAllStorage } from '../assetDB';

describe('clearAllStorage', () => {
  afterEach(() => {
    appBase.isSubpath = false;
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const stubLibrary = () => {
    vi.spyOn(assetDb.assets, 'clear').mockResolvedValue(undefined);
    vi.spyOn(assetDb.protocols, 'clear').mockResolvedValue(undefined);
  };

  it('clears localStorage in the root app', async () => {
    stubLibrary();
    localStorage.setItem('architect.locale', 'fr');

    await clearAllStorage();

    expect(localStorage.getItem('architect.locale')).toBeNull();
    expect(assetDb.protocols.clear).toHaveBeenCalled();
  });

  // Architect 9 owns the same origin's localStorage (its language, analytics
  // and update keys); Architect 8 at /v8/ clears only its own library.
  it("leaves the hosting app's localStorage alone in a sub-path build", async () => {
    appBase.isSubpath = true;
    stubLibrary();
    localStorage.setItem('architect.locale', 'fr');

    await clearAllStorage();

    expect(localStorage.getItem('architect.locale')).toBe('fr');
    expect(assetDb.assets.clear).toHaveBeenCalled();
    expect(assetDb.protocols.clear).toHaveBeenCalled();
  });
});
