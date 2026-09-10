// The tab identity a protocol-builder lock belongs to (#1483). It has to be
// one id for the life of the document — the server derives the lock owner from
// it, so a second id would lose the section the researcher still has open —
// and it must not be one a second document can present: browsers copy
// `sessionStorage` into a duplicated tab, and two documents naming one owner
// would both be granted the same section.
import { describe, expect, it, vi } from 'vitest';

/** A document that has just loaded this module, as a new or duplicated tab is. */
async function loaded() {
  vi.resetModules();
  const { clientSessionId } = await import('../clientSession.ts');
  return clientSessionId;
}

describe("a tab's client session id", () => {
  it('is one id for the life of the document', async () => {
    const tab = await loaded();
    const id = tab();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(tab()).toBe(id);
    expect(tab()).toBe(id);
  });

  it('is a different id in a second tab, whatever the first tab stored', async () => {
    const first = await loaded();
    const id = first();
    // A duplicated tab starts with a copy of the original's `sessionStorage`,
    // so anything kept there would name the first tab's owner in the second.
    window.sessionStorage.setItem('studio.clientSessionId', id);
    const second = await loaded();
    expect(second()).not.toBe(id);
  });

  it('names the tab in a browser that keeps no site data at all', async () => {
    // A browser configured to block site data throws on access rather than
    // answering nothing, so an id that reached for storage would have to
    // handle it. This one never does.
    const blocked = () => {
      throw new Error('site data is blocked');
    };
    const getItem = vi
      .spyOn(window.sessionStorage, 'getItem')
      .mockImplementation(blocked);
    const setItem = vi
      .spyOn(window.sessionStorage, 'setItem')
      .mockImplementation(blocked);

    const tab = await loaded();
    const id = tab();
    expect(id).toHaveLength(36);
    expect(tab()).toBe(id);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
