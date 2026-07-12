import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requestPersistentStorage,
  requestPersistentStorageOnFirstInteraction,
  STORAGE_PERSISTED_EVENT,
} from '../storage';

function stubStorageManager({
  persisted,
  persist,
}: {
  persisted: boolean;
  persist: boolean;
}) {
  const persistedMock = vi.fn().mockResolvedValue(persisted);
  const persistMock = vi.fn().mockResolvedValue(persist);
  Object.defineProperty(navigator, 'storage', {
    value: { persisted: persistedMock, persist: persistMock },
    configurable: true,
  });
  return { persistedMock, persistMock };
}

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // WebKit and Chromium can grant persist() silently long after boot (their
  // heuristics key on interaction history), so a fresh grant announces itself
  // for live UI (StatusRow) to re-read without waiting for a focus change.
  it('dispatches the persisted event on a fresh grant', async () => {
    stubStorageManager({ persisted: false, persist: true });
    const listener = vi.fn();
    window.addEventListener(STORAGE_PERSISTED_EVENT, listener);
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(STORAGE_PERSISTED_EVENT, listener);
  });

  it('does not dispatch the persisted event when the request is denied', async () => {
    stubStorageManager({ persisted: false, persist: false });
    const listener = vi.fn();
    window.addEventListener(STORAGE_PERSISTED_EVENT, listener);
    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(STORAGE_PERSISTED_EVENT, listener);
  });

  it('does not dispatch the persisted event when already persisted', async () => {
    const { persistMock } = stubStorageManager({
      persisted: true,
      persist: true,
    });
    const listener = vi.fn();
    window.addEventListener(STORAGE_PERSISTED_EVENT, listener);
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persistMock).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(STORAGE_PERSISTED_EVENT, listener);
  });
});

describe('requestPersistentStorageOnFirstInteraction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests persistence once on the first pointer interaction only', async () => {
    const { persistMock } = stubStorageManager({
      persisted: false,
      persist: false,
    });
    requestPersistentStorageOnFirstInteraction();
    expect(persistMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(persistMock).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    // Give any (incorrect) extra requests a tick to land.
    await Promise.resolve();
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('treats a key press as the first interaction too', async () => {
    const { persistMock } = stubStorageManager({
      persisted: false,
      persist: false,
    });
    requestPersistentStorageOnFirstInteraction();
    window.dispatchEvent(new Event('keydown'));
    await vi.waitFor(() => expect(persistMock).toHaveBeenCalledTimes(1));
  });

  // Firefox pops a permission dialog on persist(); the startup request already
  // asked once this session, so an automatic second ask would nag the user.
  it('does not arm on Firefox', async () => {
    const { persistMock } = stubStorageManager({
      persisted: false,
      persist: true,
    });
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0',
    );
    requestPersistentStorageOnFirstInteraction();
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(persistMock).not.toHaveBeenCalled();
  });
});
