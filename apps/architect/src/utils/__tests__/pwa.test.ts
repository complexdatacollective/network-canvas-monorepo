import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isRunningAsInstalledPwa,
  requestPersistentStorage,
  requestPersistentStorageOnFirstInteraction,
  scopeServiceWorkerContainer,
} from '../pwa';

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

describe('requestPersistentStorageOnFirstInteraction', () => {
  it('requests persistence once on the first pointer interaction only', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    setStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
    });
    requestPersistentStorageOnFirstInteraction();
    expect(persist).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('treats a key press as the first interaction too', async () => {
    const persist = vi.fn().mockResolvedValue(false);
    setStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
    });
    requestPersistentStorageOnFirstInteraction();
    window.dispatchEvent(new Event('keydown'));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });
});

describe('scopeServiceWorkerContainer', () => {
  const registrationAt = (scope: string) =>
    ({ scope }) as unknown as ServiceWorkerRegistration;

  const containerReturning = (
    registration: ServiceWorkerRegistration | undefined,
  ) => {
    const controller = {} as ServiceWorker;
    return {
      controller,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getRegistration: vi.fn(async (_clientURL?: string | URL) => registration),
    };
  };

  it("returns this build's own registration", async () => {
    const own = registrationAt('https://architect.example/v8/');
    const container = containerReturning(own);
    const scoped = scopeServiceWorkerContainer(
      container,
      '/v8/',
      'https://architect.example/v8/protocol',
    );

    await expect(scoped.getRegistration()).resolves.toBe(own);
    expect(container.getRegistration).toHaveBeenCalledWith(
      'https://architect.example/v8/',
    );
  });

  // Before /v8/sw.js is registered, the root app's worker controls a /v8/ page
  // and the browser answers the lookup with the root registration. Acting on it
  // would skip-wait the other app's update.
  it("never returns the hosting app's root registration", async () => {
    const scoped = scopeServiceWorkerContainer(
      containerReturning(registrationAt('https://architect.example/')),
      '/v8/',
      'https://architect.example/v8/',
    );

    await expect(scoped.getRegistration()).resolves.toBeUndefined();
  });

  it('forwards the controller and controller-change listeners', () => {
    const container = containerReturning(undefined);
    const scoped = scopeServiceWorkerContainer(
      container,
      '/v8/',
      'https://architect.example/v8/',
    );
    const listener = vi.fn();

    expect(scoped.controller).toBe(container.controller);
    scoped.addEventListener('controllerchange', listener);
    scoped.removeEventListener('controllerchange', listener);
    expect(container.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      listener,
    );
    expect(container.removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      listener,
    );
  });
});
