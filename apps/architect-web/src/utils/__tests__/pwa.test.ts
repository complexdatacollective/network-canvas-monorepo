import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRunningAsInstalledPwa, requestPersistentStorage } from '../pwa';

const stubMatchMedia = (matchingModes: string[]) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matchingModes.some((mode) => query.includes(mode)),
  }));
};

const setNavigatorStandalone = (value: boolean | undefined) => {
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    value,
  });
};

const setStorageManager = (value: unknown) => {
  Object.defineProperty(navigator, 'storage', { configurable: true, value });
};

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, 'standalone');
  Reflect.deleteProperty(navigator, 'storage');
});

describe('isRunningAsInstalledPwa', () => {
  it('is false in a normal browser tab', () => {
    stubMatchMedia([]);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });

  it('is true when launched in standalone display mode', () => {
    stubMatchMedia(['standalone']);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('is true in other installed display modes', () => {
    stubMatchMedia(['window-controls-overlay']);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('is false in browser fullscreen and minimal-ui (not installed modes)', () => {
    // A normal tab matches `(display-mode: fullscreen)` via the Fullscreen API
    // (e.g. fullscreening a <video>); it must not be treated as installed.
    stubMatchMedia(['fullscreen', 'minimal-ui']);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });

  it('is true for an iOS home-screen app (navigator.standalone)', () => {
    stubMatchMedia([]);
    setNavigatorStandalone(true);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('is false when matchMedia is unavailable and not an iOS app', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });
});

describe('requestPersistentStorage', () => {
  it('returns false when the Storage API is unavailable', async () => {
    setStorageManager(undefined);
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('does not re-request when storage is already persisted', async () => {
    const persist = vi.fn();
    setStorageManager({ persisted: vi.fn().mockResolvedValue(true), persist });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet persisted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
    });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('resolves to false (never rejects) when the Storage API throws', async () => {
    setStorageManager({
      persisted: vi.fn().mockRejectedValue(new TypeError('opaque origin')),
      persist: vi.fn(),
    });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
