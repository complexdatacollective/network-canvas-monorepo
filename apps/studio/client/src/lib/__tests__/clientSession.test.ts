// The tab identity a protocol-builder lock belongs to (#1483). It has to be
// one id for the life of the tab and not one shared with the tab beside it:
// the server derives the lock owner from it, so a per-load id would lose the
// section on every reload and a shared one would let two editors write it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A document that has just loaded this module, as a reload or a new tab is. */
async function loaded() {
  vi.resetModules();
  const { clientSessionId } = await import('../clientSession.ts');
  return clientSessionId;
}

describe("a tab's client session id", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is one id for the life of the tab, and the same one after a reload', async () => {
    const tab = await loaded();
    const id = tab();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(tab()).toBe(id);

    // A reload is a fresh module in a tab whose `sessionStorage` is still
    // there, so it finds the id the last load kept rather than minting one.
    const reloaded = await loaded();
    expect(reloaded()).toBe(id);
  });

  it('is a different id in a second tab', async () => {
    const first = await loaded();
    const id = first();
    // A second tab is a fresh module with a `sessionStorage` of its own, which
    // is what makes two tabs of one researcher two lock owners (#1275).
    window.sessionStorage.clear();
    const second = await loaded();
    expect(second()).not.toBe(id);
  });

  it('still names the tab when the browser refuses to keep it', async () => {
    // A browser configured to block site data throws on access rather than
    // answering nothing. A per-load id is a worse owner than a per-tab one,
    // but it is an owner, and the alternative is an editor that cannot lock.
    const blocked = () => {
      throw new Error('site data is blocked');
    };
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(blocked);
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(blocked);

    const tab = await loaded();
    const id = tab();
    expect(id).toHaveLength(36);
    expect(tab()).toBe(id);
  });
});
